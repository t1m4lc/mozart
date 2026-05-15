import type { OS } from '../../core/os.service';

// OS-specific install copy for the Git step. Dictionary-over-switch
// (per project convention). Keys cover the three desktop OSes ; the
// `default` value applies when OsService returns `unknown` (e.g.
// non-browser SSR contexts that should never hit this path in
// production).

export interface GitInstallInstruction {
  readonly label: string;
  readonly command: string | null;
  readonly note?: string;
}

export const GIT_INSTALL_INSTRUCTIONS: Record<OS, GitInstallInstruction> = {
  macos: {
    label: 'Install Git on macOS',
    command: 'brew install git',
    note: 'Requires Homebrew. Alternative : download the official installer.',
  },
  linux: {
    label: 'Install Git on Linux',
    command: 'sudo apt install git',
    note: 'Debian / Ubuntu — for other distros use your package manager.',
  },
  windows: {
    label: 'Download Git for Windows',
    command: null,
    note: 'Run the installer from git-scm.com/download/win.',
  },
  ios: {
    label: 'Mozart runs on desktop only',
    command: null,
  },
  android: {
    label: 'Mozart runs on desktop only',
    command: null,
  },
  unknown: {
    label: 'Install Git for your operating system',
    command: null,
    note: 'See git-scm.com/downloads for the official installer.',
  },
};
