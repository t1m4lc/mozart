#!/bin/sh
# mock-claude.sh — test fixture standing in for the real `claude` binary.
#
# Behavior:
#   - If "--version" is in argv: print "2.1.138" and exit 0.
#   - Else, route by $MOZART_MOCK_FIXTURE:
#       *.jsonl → cat the fixture to stdout, exit 0.
#       *.sh    → exec the fixture script (so it can write to stderr,
#                 sleep, exit non-zero, etc.).
#       unset/other → write a diagnostic to stderr and exit 1.
#
# Tests select the fixture per-invocation by setting MOZART_MOCK_FIXTURE.
# Runner integration tests serialize on a Mutex because both env vars
# (MOZART_CLAUDE_BIN + MOZART_MOCK_FIXTURE) are process-global.

case " $* " in
  *" --version "*) echo "2.1.138"; exit 0 ;;
esac

fixture="${MOZART_MOCK_FIXTURE:-}"
case "$fixture" in
  *.jsonl)
    if [ -r "$fixture" ]; then
      cat "$fixture"
      exit 0
    else
      echo "mock-claude: fixture not readable: $fixture" >&2
      exit 1
    fi
    ;;
  *.sh)
    if [ -r "$fixture" ]; then
      exec sh "$fixture"
    else
      echo "mock-claude: fixture not readable: $fixture" >&2
      exit 1
    fi
    ;;
  *)
    echo "mock-claude: MOZART_MOCK_FIXTURE not set or unsupported (got: '$fixture')" >&2
    exit 1
    ;;
esac
