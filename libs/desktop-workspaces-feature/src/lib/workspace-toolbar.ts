import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MzStatusIcon } from '@mozart-ui/status-icon';
import { ShellTopBar } from '@mozart/desktop-core-ui';
import type { RunStatus } from '@mozart/desktop-runs-util';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { OpenInMenu } from '@mozart/desktop-workspaces-ui';
import {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type OpenInTool,
  type UiWorkspaceStatus,
} from '@mozart/desktop-workspaces-util';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideCheck,
  lucideChevronDown,
  lucideCircleStop,
  lucideExternalLink,
  lucideFolderOpen,
  lucideGitBranch,
  lucideGitCommitVertical,
  lucideGitPullRequest,
  lucideGithub,
  lucidePanelRight,
  lucidePlay,
} from '@ng-icons/lucide';
import type { BaseFreshness } from '@mozart/desktop-workspaces-data-access';
import { HlmBreadcrumbImports } from '@spartan-ui/breadcrumb';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSheetImports } from '@spartan-ui/sheet';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { FeatureWorkspaceAside } from './feature-workspace-aside';

@Component({
  selector: 'app-workspace-toolbar',
  imports: [
    NgIcon,
    NgTemplateOutlet,
    MzStatusIcon,
    OpenInMenu,
    ShellTopBar,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmSheetImports,
    HlmTooltipImports,
    FeatureWorkspaceAside,
  ],
  providers: [
    provideIcons({
      lucideArrowDown,
      lucideCheck,
      lucideChevronDown,
      lucideCircleStop,
      lucideExternalLink,
      lucideFolderOpen,
      lucideGitBranch,
      lucideGitCommitVertical,
      lucideGithub,
      lucideGitPullRequest,
      lucidePanelRight,
      lucidePlay,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-shell-top-bar>
      @if (leadingSlot()) {
        <ng-container [ngTemplateOutlet]="leadingSlot()!" />
      }

      <div
        class="flex min-w-0 flex-1 items-center gap-1 px-1"
        data-tauri-drag-region
      >
        <nav
          hlmBreadcrumb
          aria-label="Workspace"
          class="min-w-0 overflow-hidden"
          data-tauri-drag-region="false"
        >
          <ol hlmBreadcrumbList>
            <li hlmBreadcrumbItem class="shrink-0">
              @if (repoUrl()) {
                <button
                  type="button"
                  class="flex items-center gap-1 rounded text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
                  [hlmDropdownMenuTrigger]="repoMenu"
                  align="start"
                  side="bottom"
                  hlmTooltip="Source repository"
                  position="bottom"
                >
                  <span>{{ projectIcon() }}</span>
                  <span>{{ projectName() }}</span>
                </button>
              } @else if (repoPath()) {
                <button
                  type="button"
                  class="flex items-center gap-1 rounded text-sm font-normal text-muted-foreground transition-colors hover:text-foreground"
                  hlmTooltip="Open the repository folder"
                  position="bottom"
                  (click)="openRepoFolder.emit()"
                >
                  <span>{{ projectIcon() }}</span>
                  <span>{{ projectName() }}</span>
                </button>
              } @else {
                <span
                  hlmBreadcrumbPage
                  class="flex items-center gap-1 text-sm font-normal"
                >
                  <span>{{ projectIcon() }}</span>
                  <span>{{ projectName() }}</span>
                </span>
              }
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
                @if (renaming()) {
                  <input
                    #renameInput
                    type="text"
                    [value]="workspaceTitle()"
                    class="min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-sm font-normal text-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
                    (click)="$event.stopPropagation()"
                    (keydown.enter)="commitRename($any($event.target).value)"
                    (keydown.escape)="cancelRename()"
                    (blur)="commitRename($any($event.target).value)"
                  />
                } @else {
                  <span
                    class="truncate"
                    [class.cursor-text]="!frozen()"
                    [class.cursor-default]="frozen()"
                    [hlmTooltip]="branchTooltip()"
                    position="bottom"
                    (dblclick)="startRename($event)"
                  >
                    {{ workspaceTitle() }}
                  </span>
                }
              </span>
            </li>
          </ol>
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-1" data-tauri-drag-region>
        @if (workspaceTitle()) {
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            class="h-7 px-2 text-xs font-normal"
            [class.text-brand]="hasUncommittedChanges() && !frozen()"
            [class.text-muted-foreground]="
              !(hasUncommittedChanges() && !frozen())
            "
            [hlmTooltip]="
              frozen()
                ? 'Workspace is done — reopen to commit'
                : hasUncommittedChanges()
                  ? 'You have uncommitted changes'
                  : 'Commit changes'
            "
            position="bottom"
            [disabled]="frozen()"
            (click)="commit.emit()"
          >
            <ng-icon hlm name="lucideGitCommitVertical" size="sm" />
            <span>Commit</span>
          </button>

          @if (baseFreshness(); as f) {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="h-7 gap-1.5 px-2 text-xs font-normal"
              [class.text-brand]="f.behind > 0 && !frozen()"
              [class.text-muted-foreground]="!(f.behind > 0 && !frozen())"
              [hlmTooltip]="
                f.behind > 0
                  ? 'Update from ' + baseBranch()
                  : 'Up to date with ' + baseBranch()
              "
              position="bottom"
              [disabled]="frozen() || updatingFromBase()"
              (click)="updateFromBase.emit()"
            >
              <ng-icon
                hlm
                [name]="f.behind > 0 ? 'lucideArrowDown' : 'lucideCheck'"
                size="sm"
              />
              <span>
                {{
                  f.behind > 0
                    ? f.behind + ' behind ' + baseBranch()
                    : 'Up to date'
                }}
              </span>
            </button>
          }

          @if (prNumber(); as n) {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              class="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground"
              [hlmTooltip]="'Open pull request #' + n + ' on GitHub'"
              position="bottom"
              (click)="openPr.emit()"
            >
              <ng-icon
                hlm
                name="lucideGitPullRequest"
                size="sm"
                class="text-status-ok"
              />
              <span>PR #{{ n }}</span>
            </button>
          }

          @if (workspaceStatus(); as s) {
            <button
              hlmBtn
              variant="ghost"
              size="sm"
              type="button"
              [hlmDropdownMenuTrigger]="statusMenu"
              align="start"
              side="bottom"
              hlmTooltip="Workspace status"
              position="bottom"
              class="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground"
            >
              <mz-status-icon [status]="s" [size]="14" />
              <span>{{ statusLabel(s) }}</span>
              <ng-icon
                hlm
                name="lucideChevronDown"
                size="xs"
                class="text-muted-foreground"
              />
            </button>
          }

          @if (availableTools().length > 0 && lastUsedTool()) {
            <app-open-in-menu
              [tools]="availableTools()"
              [lastUsed]="lastUsedTool()!"
              [subtitle]="workspaceTitle()"
              (openIn)="openIn.emit($event)"
            />
          }
        }

        @if (layout.isCompact()) {
          <!-- Narrow viewport: open the right pane content in a sheet
               overlay. feature-workspace-aside mounts lazily inside the
               sheet via @if so it's not double-mounted alongside the
               inline shell-right (which CSS-hides at this breakpoint). -->
          <hlm-sheet #rightSheet>
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              hlmSheetTrigger
              hlmTooltip="Open workspace panel"
              position="bottom"
              class="size-7 rounded-md text-muted-foreground"
            >
              <ng-icon hlm name="lucidePanelRight" size="sm" />
            </button>
            <hlm-sheet-content
              *hlmSheetPortal="let ctx"
              side="right"
              class="w-[min(28rem,90vw)] p-0"
            >
              @if (ctx.state() === 'open') {
                <app-feature-workspace-aside class="h-full w-full" />
              }
            </hlm-sheet-content>
          </hlm-sheet>
        } @else {
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            hlmTooltip="Toggle right sidebar"
            position="bottom"
            class="size-7 rounded-md text-muted-foreground"
            (click)="toggleRightPanel.emit(); $any($event.currentTarget).blur()"
          >
            <ng-icon hlm name="lucidePanelRight" size="sm" />
          </button>
        }
      </div>
    </app-shell-top-bar>

    <ng-template #repoMenu>
      <hlm-dropdown-menu class="w-52">
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openRepoFolder.emit()"
        >
          <ng-icon hlm name="lucideFolderOpen" size="xs" />
          <span>Open repository folder</span>
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openRepoRemote.emit()"
        >
          <ng-icon hlm name="lucideGithub" size="xs" />
          <span>Open on GitHub</span>
        </button>
      </hlm-dropdown-menu>
    </ng-template>

    <ng-template #statusMenu>
      <hlm-dropdown-menu class="w-44">
        @for (s of statuses; track s.id) {
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="workspaceStatusChange.emit(s.id)"
          >
            <mz-status-icon [status]="s.id" />
            {{ s.label }}
            @if (workspaceStatus() === s.id) {
              <ng-icon hlm name="lucideCheck" size="xs" class="ms-auto" />
            }
          </button>
        }
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class WorkspaceToolbar {
  protected readonly layout = inject(LayoutService);

  readonly projectIcon = input.required<string | null>();
  readonly projectName = input.required<string>();
  // Source-repository location. `repoPath` (the local folder) is always
  // available; `repoUrl` (github.com) only when the project has a GitHub
  // remote. The project crumb opens a dropdown (folder / GitHub) when a
  // remote exists, else opens the folder directly.
  readonly repoPath = input<string | null>(null);
  readonly repoUrl = input<string | null>(null);
  readonly workspaceTitle = input.required<string>();
  // The workspace's own git branch (e.g. "mozart/eminem"). Shown on the
  // crumb tooltip, not as a raw label, so the header stays warm.
  readonly currentBranch = input.required<string>();
  // The branch this workspace forked from and opens its PR against.
  // Rendered as a read-only chip (the old editable picker was decorative
  // — it never persisted; PR/merge read the stored base).
  readonly baseBranch = input<string>('main');
  readonly isStreaming = input<boolean>(false);
  // When set, rendered before the breadcrumb (used to inject window controls
  // + sidebar toggle when the left panel is collapsed).
  readonly leadingSlot = input<TemplateRef<unknown> | null>(null);

  // Open in IDE / Commit live on the toolbar. Create PR lives in the
  // right-aside merge menu (MergeActionMenu), not here. Placeholder
  // Lucide icons today; real IDE brand icons land via the OpenInTool
  // catalog.
  readonly availableTools = input<readonly OpenInTool[]>([]);
  readonly lastUsedTool = input<OpenInTool | null>(null);
  // PR opened from this workspace (persisted). When set, the header
  // shows a "PR #N" chip that opens it in the browser via `openPr`.
  readonly prUrl = input<string | null>(null);
  readonly prNumber = input<number | null>(null);
  readonly runStatus = input<RunStatus>('idle');
  readonly hasRunCommand = input<boolean>(false);
  // Linear-style workspace status surfaced as a dropdown between
  // Commit and Open-in IDE. Null hides the button (no active
  // workspace, or the facade hasn't resolved one yet).
  readonly workspaceStatus = input<UiWorkspaceStatus | null>(null);
  // Toolbar-level read-only state. Disables Commit and refuses to enter
  // rename mode. Open in IDE stays enabled (read-only browsing in an
  // external editor is fine).
  readonly frozen = input<boolean>(false);
  // Working tree has uncommitted changes → the Commit button goes brand-
  // colored to signal "you have changes to commit".
  readonly hasUncommittedChanges = input<boolean>(false);
  // Behind/ahead of the workspace branch vs. `origin/<base>`. Null until
  // the cheap-local probe resolves (the chip is hidden until then). When
  // `behind > 0` the chip goes brand-colored and offers "Update from
  // <base>"; otherwise it reads "Up to date".
  readonly baseFreshness = input<BaseFreshness | null>(null);
  // True while an update-from-base merge is running → disables the chip.
  readonly updatingFromBase = input<boolean>(false);

  readonly toggleRightPanel = output<void>();
  readonly workspaceTitleChange = output<string>();
  readonly openIn = output<OpenInTool>();
  readonly commit = output<void>();
  readonly updateFromBase = output<void>();
  readonly openPr = output<void>();
  readonly openRepoFolder = output<void>();
  readonly openRepoRemote = output<void>();
  readonly run = output<void>();
  readonly stopRun = output<void>();
  readonly workspaceStatusChange = output<UiWorkspaceStatus>();

  protected readonly statuses = UI_WORKSPACE_STATUSES;

  // Reveals the real git branch + fork source on hover so the friendly
  // workspace name in the crumb maps to git truth without cluttering it.
  protected readonly branchTooltip = computed(() => {
    const branch = this.currentBranch();
    const base = this.baseBranch();
    if (!branch) return '';
    return base
      ? `branch: ${branch} · forked from ${base}`
      : `branch: ${branch}`;
  });

  protected statusLabel(s: UiWorkspaceStatus): string {
    return getUiStatusMeta(s).label;
  }

  protected readonly renaming = signal(false);
  private readonly renameInput =
    viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    effect(() => {
      if (this.renaming()) {
        queueMicrotask(() => {
          const el = this.renameInput()?.nativeElement;
          if (el) {
            el.focus();
            el.select();
          }
        });
      }
    });
  }

  protected startRename(event: Event): void {
    event.stopPropagation();
    if (this.frozen()) return;
    this.renaming.set(true);
  }

  protected commitRename(value: string): void {
    if (!this.renaming()) return;
    const next = value.trim();
    if (next && next !== this.workspaceTitle()) {
      this.workspaceTitleChange.emit(next);
    }
    this.renaming.set(false);
  }

  protected cancelRename(): void {
    this.renaming.set(false);
  }
}
