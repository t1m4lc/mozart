# mozart-trigger-menu

Generic Notion-style trigger menu behavior. A headless directive that opens an
injected menu near the caret when a configured trigger character is typed in a
`contenteditable` host, exposes the live query to the menu, and inserts a
configurable atomic pill token on selection.

Decoupled from any specific trigger character, menu implementation, or feature
(composer, mentions, slash commands).
