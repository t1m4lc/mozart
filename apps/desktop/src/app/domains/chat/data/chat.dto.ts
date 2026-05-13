// Raw shapes returned by Tauri. Re-exported under domain-local names
// so the rest of the chat domain never reaches into `core/_bindings`.

export type { Chat as ChatDto, Message as MessageDto } from '../../../core/_bindings';
