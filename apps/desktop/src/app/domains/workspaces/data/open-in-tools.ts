export type OpenInToolId =
  | 'vscode'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'sublime'
  | 'intellij'
  | 'webstorm'
  | 'pycharm'
  | 'finder'
  | 'terminal';

export interface OpenInTool {
  readonly id: OpenInToolId;
  readonly label: string;
  /** Lucide icon name. Used as a fallback when `iconPath` is absent. */
  readonly icon: string;
  /** Optional path to a brand icon under `apps/desktop/public/`.
   *  When set, the OpenInMenu renders `<img>` instead of the Lucide
   *  icon — keeps each IDE visually recognisable. */
  readonly iconPath?: string;
  readonly shortcut: number;
  /** True for tools that don't need detection (always available). */
  readonly alwaysAvailable?: boolean;
}

/**
 * Static catalog of supported tools. Detection (`detect_installed_ides`)
 * filters out the IDE entries the user doesn't have on PATH; entries
 * marked `alwaysAvailable` (Finder + Copy path) bypass the filter.
 */
export const OPEN_IN_TOOLS: readonly OpenInTool[] = [
  {
    id: 'vscode',
    label: 'VSCode',
    icon: 'lucideCode2',
    iconPath: '/vscode.png',
    shortcut: 1,
  },
  { id: 'cursor', label: 'Cursor', icon: 'lucideMousePointerClick', shortcut: 2 },
  { id: 'windsurf', label: 'Windsurf', icon: 'lucideWind', shortcut: 3 },
  { id: 'zed', label: 'Zed', icon: 'lucideZap', shortcut: 4 },
  { id: 'sublime', label: 'Sublime Text', icon: 'lucideBookOpen', shortcut: 5 },
  { id: 'intellij', label: 'IntelliJ IDEA', icon: 'lucideBraces', shortcut: 6 },
  { id: 'webstorm', label: 'WebStorm', icon: 'lucideBraces', shortcut: 7 },
  { id: 'pycharm', label: 'PyCharm', icon: 'lucideBraces', shortcut: 8 },
  {
    id: 'finder',
    label: 'File Manager',
    icon: 'lucideFolderOpen',
    iconPath: '/finder.png',
    shortcut: 9,
    alwaysAvailable: true,
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: 'lucideTerminal',
    iconPath: '/terminal.png',
    shortcut: 0,
    alwaysAvailable: true,
  },
] as const;
