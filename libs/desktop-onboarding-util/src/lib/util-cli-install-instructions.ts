import type { ConnectionProviderId } from '@mozart/desktop-llm-model-util';

// Install copy for the provider step's missing-CLI panel. Unlike Git
// (whose install method is OS-specific), the Claude Code and Codex CLIs
// both install via npm cross-platform, so a flat per-provider map is the
// honest shape. The `note` covers the PATH caveat the GUI-launch build
// hits (see `claude_cli/bin_path.rs`).

export interface CliInstallInstruction {
  readonly label: string;
  readonly command: string;
  readonly note: string;
  readonly docsUrl: string;
}

export const CLI_INSTALL_INSTRUCTIONS: Record<
  ConnectionProviderId,
  CliInstallInstruction
> = {
  claude: {
    label: "Claude Code isn't installed",
    command: 'npm install -g @anthropic-ai/claude-code',
    note: 'Requires Node.js. After installing, make sure `claude` runs in a terminal, then check again.',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  },
  codex: {
    label: "Codex isn't installed",
    command: 'npm install -g @openai/codex',
    note: 'Requires Node.js. After installing, make sure `codex` runs in a terminal, then check again.',
    docsUrl: 'https://github.com/openai/codex',
  },
};
