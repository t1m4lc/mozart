//! Stream parser for `claude -p ... --output-format=stream-json --include-partial-messages`.
//!
//! Token-only extraction (D1.4-A): only `content_block_delta` events whose
//! `delta.type == "text_delta"` produce a typed `StreamEvent::StreamToken`.
//! Every other recognized JSON shape — including `tool_use` blocks, `message_*`,
//! `content_block_start/stop`, `ping` — and every malformed-JSON line are
//! losslessly wrapped as `StreamEvent::CliOutput { line }`.
//!
//! The B-era `CliOutput` corpus is the v0.0.2 F5 migration test fixture, so
//! the original (un-trimmed) line bytes are preserved (plan §6 + spec §6.5.1).

use crate::claude_cli::StreamEvent;
use serde_json::Value;

pub fn parse_line(line: &str) -> Option<StreamEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Lossless fallback: any decode failure → CliOutput { line } (original bytes).
    let v: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            return Some(StreamEvent::CliOutput {
                line: line.to_string(),
            })
        }
    };

    let is_text_delta = v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta")
        && v.get("delta")
            .and_then(|d| d.get("type"))
            .and_then(|t| t.as_str())
            == Some("text_delta");

    if is_text_delta {
        if let Some(text) = v
            .get("delta")
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str())
        {
            return Some(StreamEvent::StreamToken {
                text: text.to_string(),
            });
        }
    }

    Some(StreamEvent::CliOutput {
        line: line.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // 1. text_delta → Some(StreamToken { text })
    #[test]
    fn text_delta_line_becomes_stream_token() {
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        match parse_line(line) {
            Some(StreamEvent::StreamToken { text }) => assert_eq!(text, "Hello"),
            other => panic!("expected StreamToken, got {other:?}"),
        }
    }

    // 2. tool_use content_block_start → Some(CliOutput) (NOT ToolCall in v0.0.1)
    #[test]
    fn tool_use_content_block_start_falls_back_to_cli_output() {
        let line = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_x","name":"bash","input":{}}}"#;
        match parse_line(line) {
            Some(StreamEvent::CliOutput { line: l }) => assert_eq!(l, line),
            other => panic!("expected CliOutput, got {other:?}"),
        }
    }

    // 3. message_start / content_block_stop / message_stop → each Some(CliOutput)
    #[test]
    fn lifecycle_events_fall_back_to_cli_output() {
        let cases = [
            r#"{"type":"message_start","message":{"id":"msg_1","role":"assistant"}}"#,
            r#"{"type":"content_block_stop","index":0}"#,
            r#"{"type":"message_stop"}"#,
        ];
        for case in cases {
            match parse_line(case) {
                Some(StreamEvent::CliOutput { line }) => assert_eq!(line, case),
                other => panic!("expected CliOutput for {case:?}, got {other:?}"),
            }
        }
    }

    // 4. JSON-invalid line → Some(CliOutput { line })
    #[test]
    fn malformed_json_falls_back_to_cli_output() {
        let line = "not json at all { [";
        match parse_line(line) {
            Some(StreamEvent::CliOutput { line: l }) => assert_eq!(l, line),
            other => panic!("expected CliOutput, got {other:?}"),
        }
    }

    // 5. Empty / whitespace-only → None
    #[test]
    fn empty_or_whitespace_line_returns_none() {
        assert!(parse_line("").is_none());
        assert!(parse_line("   ").is_none());
        assert!(parse_line("\n").is_none());
        assert!(parse_line("\t  \r\n").is_none());
    }

    // 6. event_type() round-trip for all 5 variants
    #[test]
    fn event_type_round_trip_all_variants() {
        assert_eq!(
            StreamEvent::StreamToken { text: "x".into() }.event_type(),
            "stream_token"
        );
        assert_eq!(
            StreamEvent::ToolCall {
                name: "n".into(),
                args_json: "{}".into()
            }
            .event_type(),
            "tool_call"
        );
        assert_eq!(
            StreamEvent::CliOutput { line: "x".into() }.event_type(),
            "cli_output"
        );
        assert_eq!(
            StreamEvent::StatusUpdate { status: "ok".into() }.event_type(),
            "status_update"
        );
        assert_eq!(
            StreamEvent::Error { message: "x".into() }.event_type(),
            "error"
        );
    }

    // 7. serde wire-shape: {"kind":"stream_token","text":"hi"}
    #[test]
    fn stream_token_wire_shape() {
        let serialized =
            serde_json::to_string(&StreamEvent::StreamToken { text: "hi".into() }).unwrap();
        assert_eq!(serialized, r#"{"kind":"stream_token","text":"hi"}"#);
    }
}
