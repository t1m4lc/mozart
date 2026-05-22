//! Pure summary builder for a completed assistant turn (T7).
//!
//! Walks the `agent_events` rows for one run and distills a compact
//! `SummaryDigest` covering files read, files edited, commands run,
//! key tool results, and a short prose recap. The supervisor task in
//! `runner.rs` calls this after `mark_ended` and persists the result
//! into `agent_turn_summaries`, which the ContextCompiler then folds
//! into the envelope's `operational_summaries` layer on the next turn.
//!
//! v1 is deterministic — no LLM in the loop. The tradeoff is intent
//! coverage: only the canonical Claude CLI tools (`Read`, `Edit`,
//! `Write`, `Bash`) get structured extraction; unknown tools are
//! counted as `other_tools` and surfaced only in `text_summary`. That
//! aligns with the ContextCompiler v1 spec (see
//! docs/agent-context-architecture.md) — an LLM-driven distillation
//! is a deferred follow-up.
//!
//! All extraction is best-effort: malformed payloads, missing fields,
//! and unknown event types are silently skipped rather than aborting
//! the build. The builder never returns an error — the worst case is
//! an empty digest, which the ContextCompiler can still consume.

use crate::claude_cli::StreamEvent;
use crate::db::models::AgentEvent;

/// Output of [`build_summary`]. Plain Vecs of strings — the persistence
/// layer JSON-serializes each into the matching column on
/// `agent_turn_summaries`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SummaryDigest {
    pub files_read: Vec<String>,
    pub files_edited: Vec<String>,
    pub commands_run: Vec<String>,
    pub key_results: Vec<String>,
    pub text_summary: String,
}

/// Cap per-command string length so a paragraph-long shell heredoc
/// doesn't bloat the operational_summaries layer.
const COMMAND_TRUNCATE_LEN: usize = 200;
/// Cap per-result string length — tool result summaries can be long.
const RESULT_TRUNCATE_LEN: usize = 240;
/// Don't surface more than this many key_results per turn. Older ones
/// drop off; rationale: the most recent results are the highest-signal.
const MAX_KEY_RESULTS: usize = 12;

pub fn build_summary(events: &[AgentEvent]) -> SummaryDigest {
    let mut files_read: Vec<String> = Vec::new();
    let mut files_edited: Vec<String> = Vec::new();
    let mut commands_run: Vec<String> = Vec::new();
    let mut key_results: Vec<String> = Vec::new();
    let mut tool_names_by_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut other_tool_count: usize = 0;

    for ev in events {
        // Parse the payload back into the typed StreamEvent. The runner
        // serializes via `serde_json::to_string(&StreamEvent)`, so the
        // round-trip is lossless on the happy path. Malformed rows
        // (e.g. truncated due to a previous crash) get dropped.
        let stream_ev: StreamEvent = match serde_json::from_str(&ev.payload_json) {
            Ok(v) => v,
            Err(_) => continue,
        };
        match stream_ev {
            StreamEvent::ToolCall { id, name, args_json } => {
                tool_names_by_id.insert(id, name.clone());
                let args: serde_json::Value =
                    serde_json::from_str(&args_json).unwrap_or(serde_json::Value::Null);
                match name.as_str() {
                    "Read" => {
                        if let Some(p) = args.get("file_path").and_then(|v| v.as_str()) {
                            files_read.push(p.to_string());
                        }
                    }
                    "Edit" | "MultiEdit" | "NotebookEdit" => {
                        if let Some(p) = args.get("file_path").and_then(|v| v.as_str()) {
                            files_edited.push(p.to_string());
                        }
                    }
                    "Write" => {
                        if let Some(p) = args.get("file_path").and_then(|v| v.as_str()) {
                            files_edited.push(p.to_string());
                        }
                    }
                    "Bash" => {
                        if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
                            commands_run.push(truncate(cmd, COMMAND_TRUNCATE_LEN));
                        }
                    }
                    _ => other_tool_count += 1,
                }
            }
            StreamEvent::ToolResult { id, ok, summary } => {
                if !ok {
                    continue;
                }
                let Some(s) = summary else { continue };
                if s.trim().is_empty() {
                    continue;
                }
                let prefix = tool_names_by_id
                    .get(&id)
                    .map(|n| format!("{n}: "))
                    .unwrap_or_default();
                key_results.push(format!("{prefix}{}", truncate(&s, RESULT_TRUNCATE_LEN)));
            }
            _ => {}
        }
    }

    let files_read = dedupe_preserve_order(files_read);
    let files_edited = dedupe_preserve_order(files_edited);
    // Trim oldest key_results past the cap.
    if key_results.len() > MAX_KEY_RESULTS {
        let drop_n = key_results.len() - MAX_KEY_RESULTS;
        key_results.drain(0..drop_n);
    }

    let text_summary = build_text_summary(
        files_read.len(),
        files_edited.len(),
        commands_run.len(),
        other_tool_count,
    );

    SummaryDigest {
        files_read,
        files_edited,
        commands_run,
        key_results,
        text_summary,
    }
}

fn dedupe_preserve_order(mut v: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    v.retain(|s| seen.insert(s.clone()));
    v
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // Truncate on a UTF-8 char boundary, then append an ellipsis.
    let mut end = max.saturating_sub(1);
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    let mut out = s[..end].to_string();
    out.push('…');
    out
}

fn build_text_summary(
    read_n: usize,
    edit_n: usize,
    cmd_n: usize,
    other_n: usize,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if read_n > 0 {
        parts.push(format!(
            "read {read_n} {}",
            plural(read_n, "file", "files")
        ));
    }
    if edit_n > 0 {
        parts.push(format!(
            "edited {edit_n} {}",
            plural(edit_n, "file", "files")
        ));
    }
    if cmd_n > 0 {
        parts.push(format!(
            "ran {cmd_n} {}",
            plural(cmd_n, "command", "commands")
        ));
    }
    if other_n > 0 {
        parts.push(format!(
            "used {other_n} other {}",
            plural(other_n, "tool", "tools")
        ));
    }
    if parts.is_empty() {
        return "no tool activity recorded".to_string();
    }
    let mut sentence = parts.join(", ");
    if let Some(c) = sentence.get_mut(0..1) {
        c.make_ascii_uppercase();
    }
    sentence.push('.');
    sentence
}

fn plural(n: usize, one: &'static str, many: &'static str) -> &'static str {
    if n == 1 { one } else { many }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_cli::StreamEvent;
    use crate::db::models::AgentEvent;

    fn ev(id: i64, run_id: &str, event_type: &str, payload: &str, ts: i64) -> AgentEvent {
        AgentEvent {
            event_id: id,
            run_id: run_id.into(),
            event_type: event_type.into(),
            payload_json: payload.into(),
            ts,
        }
    }

    fn serialize(e: &StreamEvent) -> String {
        serde_json::to_string(e).unwrap()
    }

    #[test]
    fn empty_input_yields_empty_digest_with_default_text() {
        let out = build_summary(&[]);
        assert!(out.files_read.is_empty());
        assert!(out.files_edited.is_empty());
        assert!(out.commands_run.is_empty());
        assert!(out.key_results.is_empty());
        assert_eq!(out.text_summary, "no tool activity recorded");
    }

    #[test]
    fn read_tool_extracts_file_path() {
        let call = serialize(&StreamEvent::ToolCall {
            id: "toolu_1".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"src/foo.rs"}"#.into(),
        });
        let events = vec![ev(1, "r1", "tool_call", &call, 100)];
        let out = build_summary(&events);
        assert_eq!(out.files_read, vec!["src/foo.rs"]);
        assert_eq!(out.text_summary, "Read 1 file.");
    }

    #[test]
    fn edit_and_write_tools_both_record_file_edits() {
        let edit = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "Edit".into(),
            args_json: r#"{"file_path":"src/a.rs"}"#.into(),
        });
        let write = serialize(&StreamEvent::ToolCall {
            id: "t2".into(),
            name: "Write".into(),
            args_json: r#"{"file_path":"src/b.rs"}"#.into(),
        });
        let events = vec![
            ev(1, "r1", "tool_call", &edit, 100),
            ev(2, "r1", "tool_call", &write, 200),
        ];
        let out = build_summary(&events);
        assert_eq!(out.files_edited, vec!["src/a.rs", "src/b.rs"]);
        assert_eq!(out.text_summary, "Edited 2 files.");
    }

    #[test]
    fn bash_tool_records_truncated_command() {
        let long_cmd = "echo ".to_string() + &"x".repeat(300);
        let bash = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "Bash".into(),
            args_json: format!(r#"{{"command":{}}}"#, serde_json::to_string(&long_cmd).unwrap()),
        });
        let events = vec![ev(1, "r1", "tool_call", &bash, 100)];
        let out = build_summary(&events);
        assert_eq!(out.commands_run.len(), 1);
        // truncated to <=200 chars with ellipsis
        let recorded = &out.commands_run[0];
        assert!(recorded.chars().count() <= 200);
        assert!(recorded.ends_with('…'));
        assert_eq!(out.text_summary, "Ran 1 command.");
    }

    #[test]
    fn ok_tool_result_attaches_tool_name_prefix() {
        let call = serialize(&StreamEvent::ToolCall {
            id: "toolu_99".into(),
            name: "Bash".into(),
            args_json: r#"{"command":"ls"}"#.into(),
        });
        let result = serialize(&StreamEvent::ToolResult {
            id: "toolu_99".into(),
            ok: true,
            summary: Some("src/ tests/".into()),
        });
        let events = vec![
            ev(1, "r1", "tool_call", &call, 100),
            ev(2, "r1", "tool_result", &result, 110),
        ];
        let out = build_summary(&events);
        assert_eq!(out.key_results, vec!["Bash: src/ tests/"]);
    }

    #[test]
    fn failed_tool_result_is_excluded_from_key_results() {
        let result = serialize(&StreamEvent::ToolResult {
            id: "toolu_x".into(),
            ok: false,
            summary: Some("error: file not found".into()),
        });
        let events = vec![ev(1, "r1", "tool_result", &result, 100)];
        let out = build_summary(&events);
        assert!(out.key_results.is_empty());
    }

    #[test]
    fn unknown_tool_counted_as_other_in_text_summary() {
        let call = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "WebFetch".into(),
            args_json: r#"{"url":"https://example.com"}"#.into(),
        });
        let events = vec![ev(1, "r1", "tool_call", &call, 100)];
        let out = build_summary(&events);
        assert!(out.files_read.is_empty());
        assert!(out.files_edited.is_empty());
        assert!(out.commands_run.is_empty());
        assert_eq!(out.text_summary, "Used 1 other tool.");
    }

    #[test]
    fn duplicate_file_paths_are_deduped_preserving_first_order() {
        let r1 = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"src/a.rs"}"#.into(),
        });
        let r2 = serialize(&StreamEvent::ToolCall {
            id: "t2".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"src/b.rs"}"#.into(),
        });
        let r3 = serialize(&StreamEvent::ToolCall {
            id: "t3".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"src/a.rs"}"#.into(),
        });
        let events = vec![
            ev(1, "r", "tool_call", &r1, 100),
            ev(2, "r", "tool_call", &r2, 200),
            ev(3, "r", "tool_call", &r3, 300),
        ];
        let out = build_summary(&events);
        assert_eq!(out.files_read, vec!["src/a.rs", "src/b.rs"]);
    }

    #[test]
    fn malformed_payload_is_silently_skipped() {
        let good = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"ok.rs"}"#.into(),
        });
        let events = vec![
            ev(1, "r", "tool_call", "not-json-at-all", 100),
            ev(2, "r", "tool_call", &good, 110),
        ];
        let out = build_summary(&events);
        assert_eq!(out.files_read, vec!["ok.rs"]);
    }

    #[test]
    fn key_results_capped_at_max_dropping_oldest() {
        let mut events = Vec::new();
        // 15 ok results — only the last 12 should survive.
        for i in 0..15 {
            let result = serialize(&StreamEvent::ToolResult {
                id: format!("t{i}"),
                ok: true,
                summary: Some(format!("result-{i}")),
            });
            events.push(ev(i, "r", "tool_result", &result, 100 + i));
        }
        let out = build_summary(&events);
        assert_eq!(out.key_results.len(), MAX_KEY_RESULTS);
        // First retained should be index 3 (drops 0..2).
        assert!(out.key_results[0].contains("result-3"));
        assert!(out.key_results.last().unwrap().contains("result-14"));
    }

    #[test]
    fn mixed_activity_produces_human_readable_text() {
        let read = serialize(&StreamEvent::ToolCall {
            id: "t1".into(),
            name: "Read".into(),
            args_json: r#"{"file_path":"a.rs"}"#.into(),
        });
        let edit = serialize(&StreamEvent::ToolCall {
            id: "t2".into(),
            name: "Edit".into(),
            args_json: r#"{"file_path":"a.rs"}"#.into(),
        });
        let bash = serialize(&StreamEvent::ToolCall {
            id: "t3".into(),
            name: "Bash".into(),
            args_json: r#"{"command":"cargo check"}"#.into(),
        });
        let events = vec![
            ev(1, "r", "tool_call", &read, 100),
            ev(2, "r", "tool_call", &edit, 110),
            ev(3, "r", "tool_call", &bash, 120),
        ];
        let out = build_summary(&events);
        assert_eq!(
            out.text_summary,
            "Read 1 file, edited 1 file, ran 1 command."
        );
    }

    // T9: a ToolResult that arrives before its matching ToolCall (events
    // out-of-order) should still record the result, just without the
    // tool-name prefix. Order-of-arrival is best-effort by the stream
    // parser; the digest must not drop signal when ordering is broken.
    #[test]
    fn tool_result_before_tool_call_records_result_unprefixed() {
        let result = serialize(&StreamEvent::ToolResult {
            id: "toolu_z".into(),
            ok: true,
            summary: Some("orphan-result".into()),
        });
        let call = serialize(&StreamEvent::ToolCall {
            id: "toolu_z".into(),
            name: "Bash".into(),
            args_json: r#"{"command":"ls"}"#.into(),
        });
        // Result first, then the call that should have preceded it.
        let events = vec![
            ev(1, "r", "tool_result", &result, 100),
            ev(2, "r", "tool_call", &call, 110),
        ];
        let out = build_summary(&events);
        assert_eq!(
            out.key_results,
            vec!["orphan-result"],
            "result must survive even when its call hasn't been seen yet"
        );
        assert_eq!(out.commands_run, vec!["ls"]);
    }

    #[test]
    fn stream_token_and_thinking_events_do_not_contribute() {
        let tok = serialize(&StreamEvent::StreamToken {
            text: "hello".into(),
        });
        let think = serialize(&StreamEvent::Thinking {
            id: "x".into(),
            text: "reflecting".into(),
        });
        let events = vec![
            ev(1, "r", "stream_token", &tok, 100),
            ev(2, "r", "thinking", &think, 110),
        ];
        let out = build_summary(&events);
        assert_eq!(out.text_summary, "no tool activity recorded");
    }
}
