//! Stream parser for `codex exec - --json`.
//!
//! Codex emits one JSON object per line (JSONL). The top-level envelope is
//! a small, stable set of `type`s:
//!
//! - `{type:"thread.started", thread_id}` — session metadata (ignored)
//! - `{type:"turn.started"}` / `{type:"turn.completed", usage}` — turn
//!   bookkeeping (ignored; terminal status comes from the process exit code)
//! - `{type:"turn.failed", error:{message}}` — a failed turn → `Error`
//! - `{type:"item.started"|"item.updated"|"item.completed", item:{…}}` —
//!   the only carrier of model output. `item.type` selects the mapping:
//!   - `agent_message`   → `StreamToken` (full text, emitted on completion)
//!   - `reasoning`       → `Thinking`
//!   - `command_execution` → `ToolCall` (start) + `ToolResult` (completion)
//!   - `file_change`     → `ToolCall` + `ToolResult` (on completion)
//!   - `mcp_tool_call`   → `ToolCall` (start) + `ToolResult` (completion)
//!   - `web_search`      → `ToolCall` + `ToolResult` (on completion)
//!   - `todo_list`/`plan_update` → `StatusUpdate`
//! - `{type:"error", message}` → `Error`
//!
//! Codex does NOT stream agent-message text token-by-token over this
//! interface the way the Claude CLI does; an `agent_message` arrives whole
//! on `item.completed`, so the timeline renders it in one chunk (MVP
//! limitation, tracked in the plan's Risks).
//!
//! Anything we don't recognize falls through to `CliOutput { line }`
//! losslessly so the original bytes survive into `agent_events` for
//! debugging — same contract as the Claude parser.

use std::collections::HashSet;

use serde_json::Value;

use crate::claude_cli::StreamEvent;

/// Cap on the captured command/tool output stuffed into a `ToolResult`
/// summary. Keeps a runaway build log from bloating `agent_events`.
const SUMMARY_CAP: usize = 4000;

/// Per-run accumulator. Tracks which item ids already emitted a `ToolCall`
/// so completion only adds the `ToolResult` (and a completion with no prior
/// start still gets a synthesized `ToolCall`). Created once at run start.
#[derive(Debug, Default)]
pub struct CodexParserState {
    tool_started: HashSet<String>,
}

enum Phase {
    Started,
    Completed,
}

pub fn parse_line(line: &str, state: &mut CodexParserState) -> Vec<StreamEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let v: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            return vec![StreamEvent::CliOutput {
                line: line.to_string(),
            }]
        }
    };

    match v.get("type").and_then(|t| t.as_str()) {
        Some("item.started") => handle_item(&v, state, Phase::Started, line),
        Some("item.completed") => handle_item(&v, state, Phase::Completed, line),
        // Intermediate updates carry partial output we don't surface in v1.
        Some("item.updated") => Vec::new(),
        Some("turn.failed") | Some("error") => vec![error_event(&v)],
        // `turn.completed` carries the turn's token usage (terminal status
        // itself still comes from the exit code).
        Some("turn.completed") => handle_turn_usage(&v),
        // Session/turn bookkeeping.
        Some("thread.started") | Some("turn.started") => Vec::new(),
        _ => vec![StreamEvent::CliOutput {
            line: line.to_string(),
        }],
    }
}

fn handle_item(
    v: &Value,
    state: &mut CodexParserState,
    phase: Phase,
    line: &str,
) -> Vec<StreamEvent> {
    let Some(item) = v.get("item") else {
        return vec![StreamEvent::CliOutput {
            line: line.to_string(),
        }];
    };
    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let id = item
        .get("id")
        .and_then(|i| i.as_str())
        .unwrap_or("")
        .to_string();

    match item_type {
        // Text/reasoning land whole on completion; ignore on start.
        "agent_message" => match phase {
            Phase::Completed => str_field(item, "text")
                .map(|text| vec![StreamEvent::StreamToken { text }])
                .unwrap_or_default(),
            Phase::Started => Vec::new(),
        },
        "reasoning" => match phase {
            Phase::Completed => str_field(item, "text")
                .map(|text| vec![StreamEvent::Thinking { id, text }])
                .unwrap_or_default(),
            Phase::Started => Vec::new(),
        },
        "command_execution" => {
            let name = "shell".to_string();
            let args = serde_json::json!({
                "command": item.get("command").and_then(|c| c.as_str()).unwrap_or(""),
            })
            .to_string();
            tool_events(state, &phase, &id, &name, args, item)
        }
        "file_change" => {
            let name = "apply_patch".to_string();
            let args = item
                .get("changes")
                .map(|c| c.to_string())
                .unwrap_or_else(|| "{}".to_string());
            tool_events(state, &phase, &id, &name, args, item)
        }
        "mcp_tool_call" => {
            let name = item
                .get("tool")
                .or_else(|| item.get("name"))
                .and_then(|t| t.as_str())
                .unwrap_or("mcp_tool")
                .to_string();
            let args = item
                .get("arguments")
                .or_else(|| item.get("args"))
                .map(|a| a.to_string())
                .unwrap_or_else(|| "{}".to_string());
            tool_events(state, &phase, &id, &name, args, item)
        }
        "web_search" => {
            let name = "web_search".to_string();
            let args = serde_json::json!({
                "query": item.get("query").and_then(|q| q.as_str()).unwrap_or(""),
            })
            .to_string();
            tool_events(state, &phase, &id, &name, args, item)
        }
        "todo_list" | "plan_update" => match phase {
            Phase::Completed => vec![StreamEvent::StatusUpdate {
                status: "plan updated".to_string(),
            }],
            Phase::Started => Vec::new(),
        },
        // Unknown item type — preserve the raw line for debugging.
        _ => vec![StreamEvent::CliOutput {
            line: line.to_string(),
        }],
    }
}

/// Emit the `ToolCall` (start) / `ToolResult` (completion) pair for a
/// tool-shaped item. A completion that never saw a start synthesizes the
/// `ToolCall` first so the UI always has a matching call for every result.
fn tool_events(
    state: &mut CodexParserState,
    phase: &Phase,
    id: &str,
    name: &str,
    args_json: String,
    item: &Value,
) -> Vec<StreamEvent> {
    match phase {
        Phase::Started => {
            state.tool_started.insert(id.to_string());
            vec![StreamEvent::ToolCall {
                id: id.to_string(),
                name: name.to_string(),
                args_json,
            }]
        }
        Phase::Completed => {
            let mut out = Vec::new();
            if !state.tool_started.remove(id) {
                out.push(StreamEvent::ToolCall {
                    id: id.to_string(),
                    name: name.to_string(),
                    args_json,
                });
            }
            out.push(StreamEvent::ToolResult {
                id: id.to_string(),
                ok: item_succeeded(item),
                summary: tool_summary(item),
            });
            out
        }
    }
}

/// A tool item succeeded when its `exit_code` is 0, or — absent an exit
/// code — when its `status` is a success-ish string. Defaults to success
/// so a missing-field item doesn't render as a spurious failure.
fn item_succeeded(item: &Value) -> bool {
    if let Some(code) = item.get("exit_code").and_then(|c| c.as_i64()) {
        return code == 0;
    }
    match item.get("status").and_then(|s| s.as_str()) {
        Some("failed") | Some("error") => false,
        _ => true,
    }
}

/// Capped, best-effort summary string from a tool item's output fields.
fn tool_summary(item: &Value) -> Option<String> {
    let raw = item
        .get("aggregated_output")
        .or_else(|| item.get("output"))
        .or_else(|| item.get("result"))
        .and_then(|o| o.as_str())?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(cap(trimmed, SUMMARY_CAP))
}

fn error_event(v: &Value) -> StreamEvent {
    let message = v
        .get("message")
        .and_then(|m| m.as_str())
        .or_else(|| v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()))
        .unwrap_or("codex run failed")
        .to_string();
    StreamEvent::Error { message }
}

fn handle_turn_usage(v: &Value) -> Vec<StreamEvent> {
    let Some(usage) = v.get("usage") else {
        return Vec::new();
    };
    let input_tokens = usage.get("input_tokens").and_then(Value::as_i64);
    let output_tokens = usage.get("output_tokens").and_then(Value::as_i64);
    let cache_read_tokens = usage.get("cached_input_tokens").and_then(Value::as_i64);
    if input_tokens.is_none() && output_tokens.is_none() && cache_read_tokens.is_none() {
        return Vec::new();
    }
    vec![StreamEvent::Usage {
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens: None,
    }]
}

fn str_field(item: &Value, key: &str) -> Option<String> {
    item.get(key)
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn cap(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(line: &str, state: &mut CodexParserState) -> Vec<StreamEvent> {
        parse_line(line, state)
    }

    #[test]
    fn agent_message_completed_emits_one_stream_token() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.completed","item":{"id":"i3","type":"agent_message","text":"done."}}"#,
            &mut s,
        );
        assert_eq!(evs.len(), 1);
        assert!(matches!(&evs[0], StreamEvent::StreamToken { text } if text == "done."));
    }

    #[test]
    fn agent_message_started_is_silent() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.started","item":{"id":"i3","type":"agent_message","text":""}}"#,
            &mut s,
        );
        assert!(evs.is_empty());
    }

    #[test]
    fn reasoning_maps_to_thinking() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.completed","item":{"id":"r1","type":"reasoning","text":"thinking…"}}"#,
            &mut s,
        );
        assert!(matches!(&evs[0], StreamEvent::Thinking { id, text } if id == "r1" && text == "thinking…"));
    }

    #[test]
    fn command_execution_start_then_complete_pairs_call_and_result() {
        let mut s = CodexParserState::default();
        let start = parse(
            r#"{"type":"item.started","item":{"id":"c1","type":"command_execution","command":"bash -lc ls","status":"in_progress"}}"#,
            &mut s,
        );
        assert!(matches!(&start[0], StreamEvent::ToolCall { id, name, .. } if id == "c1" && name == "shell"));

        let done = parse(
            r#"{"type":"item.completed","item":{"id":"c1","type":"command_execution","command":"bash -lc ls","exit_code":0,"aggregated_output":"a\nb\n","status":"completed"}}"#,
            &mut s,
        );
        // Start already emitted the ToolCall → completion is result-only.
        assert_eq!(done.len(), 1);
        assert!(matches!(&done[0], StreamEvent::ToolResult { id, ok, .. } if id == "c1" && *ok));
    }

    #[test]
    fn command_completion_without_start_synthesizes_call() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.completed","item":{"id":"c9","type":"command_execution","command":"echo hi","exit_code":1,"aggregated_output":"boom"}}"#,
            &mut s,
        );
        assert_eq!(evs.len(), 2);
        assert!(matches!(&evs[0], StreamEvent::ToolCall { id, .. } if id == "c9"));
        assert!(matches!(&evs[1], StreamEvent::ToolResult { ok, .. } if !*ok));
    }

    #[test]
    fn file_change_completion_emits_call_and_result() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.completed","item":{"id":"f1","type":"file_change","changes":[{"path":"a.rs","kind":"modify"}]}}"#,
            &mut s,
        );
        assert_eq!(evs.len(), 2);
        assert!(matches!(&evs[0], StreamEvent::ToolCall { name, .. } if name == "apply_patch"));
        assert!(matches!(&evs[1], StreamEvent::ToolResult { ok, .. } if *ok));
    }

    #[test]
    fn turn_failed_maps_to_error() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"turn.failed","error":{"message":"rate limited"}}"#,
            &mut s,
        );
        assert!(matches!(&evs[0], StreamEvent::Error { message } if message == "rate limited"));
    }

    #[test]
    fn bookkeeping_events_are_silent() {
        let mut s = CodexParserState::default();
        for line in [
            r#"{"type":"thread.started","thread_id":"t1"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"turn.completed"}"#,
        ] {
            assert!(parse(line, &mut s).is_empty(), "expected silence for {line}");
        }
    }

    #[test]
    fn turn_completed_emits_usage() {
        let mut s = CodexParserState::default();
        let line =
            r#"{"type":"turn.completed","usage":{"input_tokens":900,"cached_input_tokens":400,"output_tokens":120}}"#;
        match parse(line, &mut s).as_slice() {
            [StreamEvent::Usage {
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_creation_tokens,
            }] => {
                assert_eq!(*input_tokens, Some(900));
                assert_eq!(*output_tokens, Some(120));
                assert_eq!(*cache_read_tokens, Some(400));
                assert_eq!(*cache_creation_tokens, None);
            }
            other => panic!("expected Usage, got {other:?}"),
        }
    }

    #[test]
    fn unparseable_line_falls_through_to_cli_output() {
        let mut s = CodexParserState::default();
        let evs = parse("not json at all", &mut s);
        assert!(matches!(&evs[0], StreamEvent::CliOutput { line } if line == "not json at all"));
    }

    #[test]
    fn unknown_item_type_preserved_as_cli_output() {
        let mut s = CodexParserState::default();
        let evs = parse(
            r#"{"type":"item.completed","item":{"id":"x","type":"future_thing"}}"#,
            &mut s,
        );
        assert!(matches!(&evs[0], StreamEvent::CliOutput { .. }));
    }
}
