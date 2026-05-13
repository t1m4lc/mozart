export interface OpenInTool {
  readonly id: 'vscode' | 'finder' | 'terminal' | 'copy_path';
  readonly label: string;
  readonly icon: string;
  readonly shortcut: number;
}

export const OPEN_IN_TOOLS: readonly OpenInTool[] = [
  { id: 'vscode', label: 'VSCode', icon: 'lucideCode2', shortcut: 1 },
  { id: 'finder', label: 'Finder', icon: 'lucideFolderOpen', shortcut: 2 },
  { id: 'terminal', label: 'Terminal', icon: 'lucideTerminal', shortcut: 3 },
  { id: 'copy_path', label: 'Copy path', icon: 'lucideCopy', shortcut: 4 },
] as const;
