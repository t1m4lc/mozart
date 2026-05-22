# mozart-message-markdown

Sandbox-safe markdown renderer used wherever the app needs to display
agent- or workspace-authored markdown (chat messages, file previews,
diff hunks). Runs `marked` through Angular's built-in `[innerHTML]`
sanitizer so prompt-injection markup is stripped before reaching the
DOM.
