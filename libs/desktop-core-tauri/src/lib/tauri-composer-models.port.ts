import type { ComposerModelsPort } from '@mozart/desktop-llm-model-data-access';
import { commands } from './_bindings';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Backs ComposerModelsStore with global settings.json (`agent.enabledModelIds`)
// via the resolved-settings IPC. Reads ignore any project layer (this is a
// personal, global preference); writes go to the global file and preserve the
// rest of the agent section.
export function tauriComposerModelsPort(): ComposerModelsPort {
  return {
    async load() {
      const s = unwrap(await commands.getResolvedSettings(null));
      return s.agent.enabledModelIds ?? [];
    },
    async save(ids) {
      const current = unwrap(await commands.getResolvedSettings(null));
      unwrap(
        await commands.saveGlobalSettings({
          ...current,
          agent: { ...current.agent, enabledModelIds: [...ids] },
        }),
      );
    },
  };
}
