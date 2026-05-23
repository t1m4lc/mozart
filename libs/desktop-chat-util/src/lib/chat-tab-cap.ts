// Maximum number of concurrent chat tabs per workspace. The
// `+` button in the workspace tab bar disables once this is hit;
// the chat facade rejects `createChat` calls above the cap as a
// defensive backstop. Kept in chat-util so both chat and workspaces
// (and any future renderer) can read it without a cross-domain dep.

export const CHAT_TAB_CAP = 4;
