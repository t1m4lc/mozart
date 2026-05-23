//! Stream parser for `claude -p ... --output-format=stream-json
//! --include-partial-messages --verbose`.
//!
//! Real claude CLI output is one JSON object per line, with a top-level
//! envelope:
//!
//! - `{type:"system", subtype:"init"|"status", ...}` — session metadata
//! - `{type:"stream_event", event:<anthropic event>, ...}` — partial
//!   Anthropic stream events (the only carrier of text/tool/thinking)
//! - `{type:"assistant", message:{...}}` — full assembled assistant turn
//!   (we ignore — same content already arrived via stream_event deltas)
//! - `{type:"user", message:{role:"user", content:[{type:"tool_result", ...}]}}`
//!   — echoed user turn carrying tool results
//! - `{type:"rate_limit_event", ...}` — telemetry, ignored
//! - `{type:"result", subtype:"success"|..., ...}` — final summary
//!   (terminal status is derived from exit code; we ignore this envelope)
//!
//! Inside `stream_event.event`, the relevant Anthropic events are:
//!
//! - `content_block_start` with `content_block.type ∈ {"text", "tool_use",
//!    "thinking"}`
//! - `content_block_delta` with `delta.type ∈ {"text_delta",
//!    "input_json_delta", "thinking_delta"}`
//! - `content_block_stop`
//! - `message_start | message_delta | message_stop` — ignored
//!
//! `tool_use` content blocks span multiple lines: a `content_block_start`
//! announces the tool name+id, then `content_block_delta` lines carry
//! `input_json_delta.partial_json` chunks that must be concatenated, and
//! `content_block_stop` finalizes the call. The parser maintains a small
//! `ParserState` (keyed by content-block `index`) so the runner can
//! accumulate partials across lines and emit one `ToolCall` per stop.
//!
//! Anything we don't recognize falls through to `CliOutput { line }`
//! losslessly so the original bytes survive into `agent_events` for
//! debugging.

use crate::claude_cli::StreamEvent;
use serde_json::Value;
use std::collections::HashMap;

/// Per-run accumulator for multi-line content blocks (currently only
/// `tool_use` needs it). Created once at run start, threaded through each
/// `parse_line` call.
#[derive(Debug, Default)]
pub struct ParserState {
    tool_blocks: HashMap<u64, ToolBlock>,
}

#[derive(Debug)]
struct ToolBlock {
    id: String,
    name: String,
    partial_input: String,
}

pub fn parse_line(line: &str, state: &mut ParserState) -> Vec<StreamEvent> {
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

    let top_type = v.get("type").and_then(|t| t.as_str());

    match top_type {
        Some("stream_event") => match v.get("event") {
            Some(ev) => handle_anthropic_event(ev, state, line),
            None => vec![StreamEvent::CliOutput {
                line: line.to_string(),
            }],
        },
        Some("user") => handle_user_message(&v),
        Some("system") | Some("assistant") | Some("result") | Some("rate_limit_event") => {
            Vec::new()
        }
        _ => vec![StreamEvent::CliOutput {
            line: line.to_string(),
        }],
    }
}

fn handle_anthropic_event(
    ev: &Value,
    state: &mut ParserState,
    raw_line: &str,
) -> Vec<StreamEvent> {
    match ev.get("type").and_then(|t| t.as_str()) {
        Some("content_block_start") => handle_block_start(ev, state),
        Some("content_block_delta") => handle_block_delta(ev, state),
        Some("content_block_stop") => handle_block_stop(ev, state),
        Some("message_start") | Some("message_delta") | Some("message_stop") | Some("ping") => {
            Vec::new()
        }
        _ => vec![StreamEvent::CliOutput {
            line: raw_line.to_string(),
        }],
    }
}

fn handle_block_start(ev: &Value, state: &mut ParserState) -> Vec<StreamEvent> {
    let index = ev.get("index").and_then(|i| i.as_u64());
    let block = ev.get("content_block");
    let block_type = block
        .and_then(|b| b.get("type"))
        .and_then(|t| t.as_str());

    if let (Some(idx), Some("tool_use"), Some(block)) = (index, block_type, block) {
        let id = block
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();
        let name = block
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();
        state.tool_blocks.insert(
            idx,
            ToolBlock {
                id,
                name,
                partial_input: String::new(),
            },
        );
    }
    Vec::new()
}

fn handle_block_delta(ev: &Value, state: &mut ParserState) -> Vec<StreamEvent> {
    let index = ev.get("index").and_then(|i| i.as_u64());
    let delta = ev.get("delta");
    let delta_type = delta.and_then(|d| d.get("type")).and_then(|t| t.as_str());

    match (index, delta_type) {
        (_, Some("text_delta")) => delta
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str())
            .map(|text| {
                vec![StreamEvent::StreamToken {
                    text: text.to_string(),
                }]
            })
            .unwrap_or_default(),

        (Some(idx), Some("input_json_delta")) => {
            if let Some(partial) = delta
                .and_then(|d| d.get("partial_json"))
                .and_then(|t| t.as_str())
            {
                if let Some(block) = state.tool_blocks.get_mut(&idx) {
                    block.partial_input.push_str(partial);
                }
            }
            Vec::new()
        }

        (idx, Some("thinking_delta")) => {
            let text = delta
                .and_then(|d| d.get("thinking"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            let id = format!("thinking-{}", idx.unwrap_or(0));
            vec![StreamEvent::Thinking {
                id,
                text: text.to_string(),
            }]
        }

        _ => Vec::new(),
    }
}

fn handle_block_stop(ev: &Value, state: &mut ParserState) -> Vec<StreamEvent> {
    let Some(idx) = ev.get("index").and_then(|i| i.as_u64()) else {
        return Vec::new();
    };
    let Some(block) = state.tool_blocks.remove(&idx) else {
        return Vec::new();
    };
    let args_json = if block.partial_input.is_empty() {
        "{}".to_string()
    } else {
        block.partial_input
    };
    vec![StreamEvent::ToolCall {
        id: block.id,
        name: block.name,
        args_json,
    }]
}

fn handle_user_message(v: &Value) -> Vec<StreamEvent> {
    let content = v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array());
    let Some(content) = content else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for item in content {
        if item.get("type").and_then(|t| t.as_str()) != Some("tool_result") {
            continue;
        }
        let id = item
            .get("tool_use_id")
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();
        let is_error = item
            .get("is_error")
            .and_then(|b| b.as_bool())
            .unwrap_or(false);
        let summary = extract_tool_result_summary(item.get("content"));
        out.push(StreamEvent::ToolResult {
            id,
            ok: !is_error,
            summary,
        });
    }
    out
}

/// Anthropic's `tool_result.content` is either a plain string or an array
/// of blocks (`{type:"text", text:"..."}`, `{type:"image", ...}`). We
/// extract the first text-like representation and cap it so the UI
/// receives a reasonable preview, not a 50KB shell dump.
fn extract_tool_result_summary(content: Option<&Value>) -> Option<String> {
    const MAX: usize = 500;
    let raw = match content? {
        Value::String(s) => s.clone(),
        Value::Array(arr) => arr
            .iter()
            .find_map(|b| b.get("text").and_then(|t| t.as_str()).map(str::to_string))?,
        _ => return None,
    };
    if raw.chars().count() > MAX {
        let truncated: String = raw.chars().take(MAX).collect();
        Some(format!("{truncated}…"))
    } else {
        Some(raw)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_one(line: &str) -> Vec<StreamEvent> {
        parse_line(line, &mut ParserState::default())
    }

    #[test]
    fn wrapped_text_delta_becomes_stream_token() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::StreamToken { text }] => assert_eq!(text, "Hello"),
            other => panic!("expected StreamToken, got {other:?}"),
        }
    }

    #[test]
    fn stream_event_message_lifecycle_is_silent() {
        let cases = [
            r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"m"}}}"#,
            r#"{"type":"stream_event","event":{"type":"message_delta","delta":{}}}"#,
            r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
            r#"{"type":"stream_event","event":{"type":"ping"}}"#,
        ];
        for case in cases {
            assert!(
                parse_one(case).is_empty(),
                "expected no events for {case:?}"
            );
        }
    }

    #[test]
    fn system_assistant_result_envelopes_are_ignored() {
        let cases = [
            r#"{"type":"system","subtype":"init","cwd":"/tmp"}"#,
            r#"{"type":"system","subtype":"status","status":"requesting"}"#,
            r#"{"type":"assistant","message":{"id":"m","content":[{"type":"text","text":"hi"}]}}"#,
            r#"{"type":"result","subtype":"success","duration_ms":42}"#,
            r#"{"type":"rate_limit_event","rate_limit_info":{}}"#,
        ];
        for case in cases {
            assert!(
                parse_one(case).is_empty(),
                "expected no events for {case:?}"
            );
        }
    }

    #[test]
    fn tool_use_start_alone_emits_nothing() {
        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"Bash","input":{}}}}"#;
        let mut s = ParserState::default();
        assert!(parse_line(start, &mut s).is_empty());
    }

    #[test]
    fn tool_use_accumulates_partials_and_emits_on_stop() {
        let mut s = ParserState::default();
        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"Bash","input":{}}}}"#;
        let d1 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\":"}}}"#;
        let d2 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" \"ls\"}"}}}"#;
        let stop = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":1}}"#;

        assert!(parse_line(start, &mut s).is_empty());
        assert!(parse_line(d1, &mut s).is_empty());
        assert!(parse_line(d2, &mut s).is_empty());
        match parse_line(stop, &mut s).as_slice() {
            [StreamEvent::ToolCall {
                id,
                name,
                args_json,
            }] => {
                assert_eq!(id, "toolu_1");
                assert_eq!(name, "Bash");
                assert_eq!(args_json, "{\"cmd\": \"ls\"}");
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
        // State cleared after stop.
        assert!(parse_line(stop, &mut s).is_empty());
    }

    #[test]
    fn tool_use_with_no_partials_emits_empty_args() {
        let mut s = ParserState::default();
        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_2","name":"Read","input":{}}}}"#;
        let stop = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":2}}"#;
        parse_line(start, &mut s);
        match parse_line(stop, &mut s).as_slice() {
            [StreamEvent::ToolCall { args_json, .. }] => assert_eq!(args_json, "{}"),
            other => panic!("expected ToolCall, got {other:?}"),
        }
    }

    #[test]
    fn text_block_stop_emits_nothing() {
        let mut s = ParserState::default();
        let stop = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0}}"#;
        assert!(parse_line(stop, &mut s).is_empty());
    }

    #[test]
    fn thinking_delta_becomes_thinking_event() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me see"}}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::Thinking { id, text }] => {
                assert_eq!(id, "thinking-0");
                assert_eq!(text, "Let me see");
            }
            other => panic!("expected Thinking, got {other:?}"),
        }
    }

    #[test]
    fn user_tool_result_string_content() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file1\nfile2","is_error":false}]}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::ToolResult { id, ok, summary }] => {
                assert_eq!(id, "toolu_1");
                assert!(ok);
                assert_eq!(summary.as_deref(), Some("file1\nfile2"));
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn user_tool_result_array_content_picks_first_text() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_2","content":[{"type":"text","text":"out"}],"is_error":false}]}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::ToolResult { summary, .. }] => {
                assert_eq!(summary.as_deref(), Some("out"));
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn user_tool_result_error_flag_propagates() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_3","content":"boom","is_error":true}]}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::ToolResult { ok, .. }] => assert!(!ok),
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn user_tool_result_summary_truncated() {
        let big: String = "x".repeat(2_000);
        let line = format!(
            r#"{{"type":"user","message":{{"role":"user","content":[{{"type":"tool_result","tool_use_id":"toolu_4","content":"{big}","is_error":false}}]}}}}"#
        );
        match parse_one(&line).as_slice() {
            [StreamEvent::ToolResult { summary, .. }] => {
                let s = summary.as_deref().unwrap();
                assert!(s.chars().count() <= 501, "expected ≤501 chars, got {}", s.chars().count());
                assert!(s.ends_with('…'));
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn unknown_top_type_falls_back_to_cli_output() {
        let line = r#"{"type":"mystery","payload":42}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::CliOutput { line: l }] => assert_eq!(l, line),
            other => panic!("expected CliOutput, got {other:?}"),
        }
    }

    #[test]
    fn malformed_json_falls_back_to_cli_output() {
        let line = "not json at all { [";
        match parse_one(line).as_slice() {
            [StreamEvent::CliOutput { line: l }] => assert_eq!(l, line),
            other => panic!("expected CliOutput, got {other:?}"),
        }
    }

    #[test]
    fn empty_or_whitespace_line_returns_no_events() {
        assert!(parse_one("").is_empty());
        assert!(parse_one("   ").is_empty());
        assert!(parse_one("\n").is_empty());
        assert!(parse_one("\t  \r\n").is_empty());
    }

    #[test]
    fn unwrapped_anthropic_event_falls_back_to_cli_output() {
        // Naked Anthropic events (no stream_event envelope) should NOT
        // be silently parsed — they're not what real claude CLI emits.
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"#;
        match parse_one(line).as_slice() {
            [StreamEvent::CliOutput { line: l }] => assert_eq!(l, line),
            other => panic!("expected CliOutput, got {other:?}"),
        }
    }

    #[test]
    fn event_type_round_trip_all_variants() {
        let cases: &[(StreamEvent, &str)] = &[
            (StreamEvent::StreamToken { text: "x".into() }, "stream_token"),
            (
                StreamEvent::ToolCall {
                    id: "i".into(),
                    name: "n".into(),
                    args_json: "{}".into(),
                },
                "tool_call",
            ),
            (
                StreamEvent::ToolResult {
                    id: "i".into(),
                    ok: true,
                    summary: None,
                },
                "tool_result",
            ),
            (
                StreamEvent::Thinking {
                    id: "i".into(),
                    text: "t".into(),
                },
                "thinking",
            ),
            (StreamEvent::CliOutput { line: "x".into() }, "cli_output"),
            (
                StreamEvent::StatusUpdate { status: "s".into() },
                "status_update",
            ),
            (StreamEvent::Error { message: "x".into() }, "error"),
        ];
        for (ev, expected) in cases {
            assert_eq!(ev.event_type(), *expected);
        }
    }

    #[test]
    fn stream_token_wire_shape() {
        let s = serde_json::to_string(&StreamEvent::StreamToken { text: "hi".into() }).unwrap();
        assert_eq!(s, r#"{"kind":"stream_token","text":"hi"}"#);
    }

    #[test]
    fn tool_call_wire_shape_carries_id() {
        let s = serde_json::to_string(&StreamEvent::ToolCall {
            id: "toolu_x".into(),
            name: "Bash".into(),
            args_json: "{}".into(),
        })
        .unwrap();
        assert_eq!(
            s,
            r#"{"kind":"tool_call","id":"toolu_x","name":"Bash","args_json":"{}"}"#
        );
    }

    #[test]
    fn tool_result_wire_shape_omits_null_summary() {
        let s = serde_json::to_string(&StreamEvent::ToolResult {
            id: "toolu_x".into(),
            ok: true,
            summary: None,
        })
        .unwrap();
        assert_eq!(s, r#"{"kind":"tool_result","id":"toolu_x","ok":true}"#);
    }
}
