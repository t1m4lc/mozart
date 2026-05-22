// Mode the LLM should operate in for a given turn. Owned by the
// llm-model domain because the run dispatch (LlmStreamInput.mode) is
// the load-bearing consumer; the composer UI takes it as an input.
// libs/mozart-ui/composer also declares a structurally-identical
// `ChatMode` — once the composer migrates to consume this lib, we can
// drop the duplicate there.
export type ChatMode = 'agent' | 'plan' | 'ask';
