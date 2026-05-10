#!/bin/sh
# Single-shot fixture: writes one stderr line and exits non-zero.
# Used by claude_cli::runner integration tests to assert stderr capture
# + agent_runs.status='error' + error_message round-trip.
echo "mock claude failed: rate limited" >&2
exit 1
