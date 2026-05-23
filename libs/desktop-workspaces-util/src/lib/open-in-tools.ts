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
  /** Optional path to a brand icon served from `libs/mozart-assets/src/desktop/`.
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
    iconPath: '/assets/desktop/icons/tools/vscode.svg',
    shortcut: 1,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'lucideMousePointerClick',
    iconPath: '/assets/desktop/icons/tools/cursor.svg',
    shortcut: 2,
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    icon: 'lucideWind',
    iconPath: '/assets/desktop/icons/tools/windsurf.svg',
    shortcut: 3,
  },
  {
    id: 'zed',
    label: 'Zed',
    icon: 'lucideZap',
    iconPath: '/assets/desktop/icons/tools/zed.svg',
    shortcut: 4,
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    icon: 'lucideBookOpen',
    iconPath: '/assets/desktop/icons/tools/sublime.svg',
    shortcut: 5,
  },
  {
    id: 'intellij',
    label: 'IntelliJ IDEA',
    icon: 'lucideBraces',
    iconPath: '/assets/desktop/icons/tools/intellij.svg',
    shortcut: 6,
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    icon: 'lucideBraces',
    iconPath: '/assets/desktop/icons/tools/webstorm.svg',
    shortcut: 7,
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    icon: 'lucideBraces',
    iconPath: '/assets/desktop/icons/tools/pycharm.svg',
    shortcut: 8,
  },
  {
    id: 'finder',
    label: 'File Manager',
    icon: 'lucideFolderOpen',
    iconPath: '/assets/desktop/icons/tools/finder.svg',
    shortcut: 9,
    alwaysAvailable: true,
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: 'lucideTerminal',
    iconPath: '/assets/desktop/icons/tools/terminal.svg',
    shortcut: 0,
    alwaysAvailable: true,
  },
] as const;
