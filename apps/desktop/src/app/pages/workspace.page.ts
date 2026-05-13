import { CdkTrapFocus } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmBreadcrumbImports } from '@mozart/ui/breadcrumb';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmComboboxImports } from '@mozart/ui/combobox';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideCode2,
  lucideCopy,
  lucideFolderOpen,
  lucideGitBranch,
  lucideGitPullRequestArrow,
  lucidePanelLeft,
  lucidePanelRight,
  lucideTerminal,
} from '@ng-icons/lucide';
import {
  BrnComboboxAnchor,
  BrnComboboxPopoverTrigger,
} from '@spartan-ng/brain/combobox';
import { OsService } from '../core/os.service';
import { ShellLayoutService } from '../core/shell-layout.service';
import { MacWindowControls } from '../shell/mac-window-controls';

const MOCK_PROJECT = {
  id: 'p1',
  title: 'mozart',
  icon: '🧑‍🎤',
  path: '~/dev/mozart',
};
const MOCK_WORKSPACE = {
  id: 'w1',
  title: 'feat/shell-resizable',
  status: 'in_progress',
};
const MOCK_BRANCHES = [
  'main',
  'develop',
  'feat/shell-resizable',
  'feat/workspace-page',
  'fix/tooltip-default',
  'fix/sidebar-border',
  'chore/cleanup',
  'release/v0.0.1',
];

const OPEN_IN_TOOLS = [
  { id: 'vscode', label: 'VSCode', icon: 'lucideCode2', shortcut: 1 },
  { id: 'finder', label: 'Finder', icon: 'lucideFolderOpen', shortcut: 2 },
  { id: 'terminal', label: 'Terminal', icon: 'lucideTerminal', shortcut: 3 },
  { id: 'copy_path', label: 'Copy path', icon: 'lucideCopy', shortcut: 4 },
] as const;

type OpenInTool = (typeof OPEN_IN_TOOLS)[number];

@Component({
  selector: 'app-workspace-page',
  imports: [
    NgIcon,
    NgTemplateOutlet,
    MacWindowControls,
    BrnComboboxAnchor,
    BrnComboboxPopoverTrigger,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmComboboxImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
    CdkTrapFocus,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCode2,
      lucideCopy,
      lucideFolderOpen,
      lucideGitBranch,
      lucidePanelLeft,
      lucidePanelRight,
      lucideGitPullRequestArrow,
      lucideTerminal,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <div
      data-tauri-drag-region
      class="flex h-9 items-center gap-1 border-b border-sidebar-border bg-accent px-1"
    >
      <ng-container
        [ngTemplateOutlet]="layout.leftPanelOpen() ? null : sidebarHeader"
      />

      <div class="flex min-w-0 flex-1 items-center gap-1 px-1">
        <nav
          hlmBreadcrumb
          aria-label="Workspace"
          class="min-w-0 overflow-hidden"
        >
          <ol hlmBreadcrumbList>
            <li hlmBreadcrumbItem class="shrink-0">
              <span
                hlmBreadcrumbPage
                class="flex items-center gap-1 text-sm font-normal"
              >
                <span>{{ project.icon }}</span>
                <span>{{ project.title }}</span>
              </span>
            </li>
            <li hlmBreadcrumbSeparator class="shrink-0 flex items-center"></li>
            <li hlmBreadcrumbItem class="min-w-0 overflow-hidden">
              <span
                hlmBreadcrumbPage
                class="flex min-w-0 items-center gap-1 text-sm font-normal"
              >
                <ng-icon
                  hlm
                  name="lucideGitBranch"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ workspace.title }}</span>
              </span>
            </li>
          </ol>
        </nav>

        <hlm-combobox
          [value]="targetBranch()"
          (valueChange)="targetBranch.set($event ?? '')"
          [itemToString]="branchToString"
          [filter]="branchFilter"
        >
          <button
            brnComboboxAnchor
            brnComboboxPopoverTrigger
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            hlmTooltip="Target branch"
            position="bottom"
            class="size-6 shrink-0 rounded-md text-muted-foreground"
            data-tauri-drag-region="false"
          >
            <ng-icon hlm name="lucideGitPullRequestArrow" size="xs" />
          </button>
          <ng-template hlmComboboxPortal>
            <hlm-combobox-content class="w-60">
              <hlm-combobox-input
                cdkTrapFocus
                [cdkTrapFocusAutoCapture]="true"
                placeholder="Search branches…"
                showTrigger="false"
                showClear="true"
              />
              <div hlmComboboxList>
                @for (branch of selectableBranches; track branch) {
                  <hlm-combobox-item [value]="branch">
                    <ng-icon
                      hlm
                      name="lucideGitBranch"
                      size="xs"
                      class="shrink-0 text-muted-foreground"
                    />
                    <span [class.font-semibold]="branch === targetBranch()">{{
                      branch
                    }}</span>
                  </hlm-combobox-item>
                }
                <hlm-combobox-empty>No branch found.</hlm-combobox-empty>
              </div>
            </hlm-combobox-content>
          </ng-template>
        </hlm-combobox>
      </div>

      <!-- Right: open-in group + right panel toggle -->
      <div
        class="flex shrink-0 items-center gap-1"
        data-tauri-drag-region="false"
      >
        <!-- Open-in button group -->
        <div class="flex">
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [hlmTooltip]="'Open with ' + lastUsedTool().label"
            position="bottom"
            class="h-7 rounded-r-none rounded-l-md border-r-0 px-2 text-xs font-normal hover:bg-accent"
            (click)="openIn(lastUsedTool())"
          >
            <ng-icon hlm [name]="lastUsedTool().icon" size="xs" />
            <span
              class="ml-1 hidden max-w-28 truncate text-muted-foreground lg:inline"
            >
              {{ workspace.title }}
            </span>
          </button>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            position="bottom"
            [hlmDropdownMenuTrigger]="openInMenu"
            align="end"
            side="bottom"
            class="h-7 rounded-l-none rounded-r-md px-1.5 hover:bg-accent"
          >
            <ng-icon hlm name="lucideChevronDown" size="xs" />
          </button>
        </div>

        <ng-template #openInMenu>
          <hlm-dropdown-menu>
            @for (tool of tools; track tool.id) {
              <button
                hlmDropdownMenuItem
                type="button"
                class="cursor-pointer"
                (triggered)="openIn(tool)"
              >
                <ng-icon hlm [name]="tool.icon" size="xs" />
                <span class="flex-1">{{ tool.label }}</span>
                <span class="ml-4 text-xs text-muted-foreground/60">{{
                  tool.shortcut
                }}</span>
              </button>
            }
          </hlm-dropdown-menu>
        </ng-template>

        <!-- Right panel toggle -->
        <button
          hlmBtn
          variant="ghost"
          size="icon-sm"
          type="button"
          hlmTooltip="Toggle right sidebar"
          position="bottom"
          class="size-7 text-muted-foreground"
          (click)="layout.toggleRightPanel()"
        >
          <ng-icon hlm name="lucidePanelRight" size="sm" />
        </button>
      </div>
    </div>

    <section class="p-2">
      <h1 class="text-lg font-medium">Workspace</h1>
    </section>

    <!-- Projected into toolbar when left sidebar is hidden -->
    <ng-template #sidebarHeader>
      @if (isMac) {
        <app-mac-window-controls />
      }
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        hlmTooltip="Toggle left sidebar"
        position="bottom"
        class="size-6 text-muted-foreground"
        data-tauri-drag-region="false"
        (click)="layout.toggleLeftPanel()"
      >
        <ng-icon hlm name="lucidePanelLeft" size="sm" />
      </button>
    </ng-template>
  `,
})
export class WorkspacePage {
  protected readonly layout = inject(ShellLayoutService);
  protected readonly isMac = inject(OsService).isMac();

  protected readonly project = MOCK_PROJECT;
  protected readonly workspace = MOCK_WORKSPACE;
  protected readonly tools = OPEN_IN_TOOLS;

  protected readonly lastUsedTool = signal<OpenInTool>(OPEN_IN_TOOLS[0]);
  protected readonly targetBranch = signal('main');

  protected readonly selectableBranches = MOCK_BRANCHES.filter(
    (b) => b !== MOCK_WORKSPACE.title,
  );

  protected readonly branchToString = (v: string | null) => v ?? '';
  protected readonly branchFilter = (v: string, search: string): boolean =>
    v.toLowerCase().includes(search.toLowerCase());

  protected openIn(tool: OpenInTool): void {
    this.lastUsedTool.set(tool);
  }
}
