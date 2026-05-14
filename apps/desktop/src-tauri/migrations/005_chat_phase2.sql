-- migrations/005_chat_phase2.sql
-- Schema v5: Phase 2 — composer modes & per-chat effort & unread markers.
--
-- `chats.mode`   = sticky per-chat composer mode (`agent` | `plan` | `ask`).
--                  Replaces the old per-message `'normal'` value.
-- `chats.effort` = sticky per-chat effort (`low` | `medium` | `high` |
--                  `xhigh` | `max`).
-- `chats.last_read_message_id` = drives sidebar bold-on-unread.
--
-- Also backfills `messages.mode` `'normal'` → `'agent'` so the new vocabulary
-- holds end-to-end. New rows under v0.0.1 onward write only the new values.

ALTER TABLE chats ADD COLUMN mode   TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE chats ADD COLUMN effort TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE chats ADD COLUMN last_read_message_id TEXT;

UPDATE messages SET mode = 'agent' WHERE mode = 'normal';

UPDATE schema_version SET version = 5;
