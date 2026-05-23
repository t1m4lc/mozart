// Public surface of `desktop-chat-feature`. Smart shells that combine
// the chat data-access + ui libs into routable content. The workspace
// observation surface lives behind `WorkspaceChatPort` in the
// data-access lib so this lib stays decoupled from the workspaces domain.

export { FeatureChatList } from './lib/feature-chat-list';
export { FeatureChatContent } from './lib/feature-chat-content';
