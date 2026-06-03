// The Tauri-backed impl lives in apps/desktop/src/app/core/tauri-claude.adapter.ts
// because it must import `core/_bindings` (Tauri-generated).

export {
  LLM_ADAPTER,
  type LlmAdapter,
  type LlmRunHandle,
  type LlmStreamInput,
} from './lib/llm.adapter';
export { FakeLlmAdapter } from './lib/fake-llm.adapter';
export {
  COMPOSER_MODELS_PORT,
  ComposerModelsStore,
  type ComposerModelsPort,
} from './lib/composer-models.store';
