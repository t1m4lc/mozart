// Public surface of `desktop-llm-model-data-access`. Adapter port +
// token + fake impl. The Tauri-backed impl lives in
// apps/desktop/src/app/core/tauri-claude.adapter.ts because it must
// import `core/_bindings` (Tauri-generated). Stream shapes, reducer,
// parser, providers config, and ChatMode live in
// `desktop-llm-model-util`.

export {
  LLM_ADAPTER,
  type LlmAdapter,
  type LlmRunHandle,
  type LlmStreamInput,
} from './lib/llm.adapter';
export { FakeLlmAdapter } from './lib/fake-llm.adapter';
