import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmBreadcrumbImports } from '@mozart/ui/breadcrumb';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSheetImports } from '@mozart/ui/sheet';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { LayoutService } from '../../../../core/layout.service';
import { FeatureWorkspaceAside } from '../../feature-workspace-aside';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleStop,
  lucideGitBranch,
  lucideGitCommitVertical,
  lucideGitPullRequest,
  lucidePanelRight,
  lucidePlay,
} from '@ng-icons/lucide';
import { ShellTopBar } from '../../../../shell';
import type { RunStatus } from '../../../runs';
import type { OpenInTool } from '../../data/open-in-tools';
import { BranchPicker } from '../branch-picker/branch-picker';
import { OpenInMenu } from '../open-in-menu/open-in-menu';

@Component({
  selector: 'app-workspace-toolbar',
  imports: [
    NgIcon,
    NgTemplateOutlet,
    BranchPicker,
    OpenInMenu,
    ShellTopBar,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmIconImports,
    HlmSheetImports,
    HlmTooltipImports,
    FeatureWorkspaceAside,
  ],
  providers: [
    provideIcons({
      lucideCircleStop,
      lucideGitBranch,
      lucideGitCommitVertical,
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

      <div class="flex min-w-0 flex-1 items-center gap-1 px-1">
        <nav
          hlmBreadcrumb
          aria-label="Workspace"
          class="min-w-0 overflow-hidden"
          data-tauri-drag-region="false"
        >
          <ol hlmBreadcrumbList>
            <li hlmBreadcrumbItem class="shrink-0">
              <span
                hlmBreadcrumbPage
                class="flex items-center gap-1 text-sm font-normal"
              >
                <span>{{ projectIcon() }}</span>
                <span>{{ projectName() }}</span>
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
                    (dblclick)="startRename($event)"
                  >
                    {{ workspaceTitle() }}
                  </span>
                }
              </span>
              <app-branch-picker
                [value]="targetBranch()"
                [currentBranch]="currentBranch()"
                [branches]="selectableBranches()"
                [disabled]="frozen() || isStreaming()"
                (valueChange)="targetBranchChange.emit($event)"
              />
            </li>
          </ol>
        </nav>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        @if (workspaceTitle()) {
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            class="h-7 px-2 text-xs font-normal text-muted-foreground"
            [hlmTooltip]="
              frozen()
                ? 'Workspace is done — reopen to commit'
                : 'Commit changes'
            "
            position="bottom"
            [disabled]="frozen()"
            (click)="commit.emit()"
          >
            <ng-icon hlm name="lucideGitCommitVertical" size="xs" />
            <span>Commit</span>
          </button>

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
              <ng-icon hlm name="lucidePanelRight" size="xs" />
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
            <ng-icon hlm name="lucidePanelRight" size="xs" />
          </button>
        }
      </div>
    </app-shell-top-bar>
  `,
})
export class WorkspaceToolbar {
  protected readonly layout = inject(LayoutService);

  readonly projectIcon = input.required<string | null>();
  readonly projectName = input.required<string>();
  readonly workspaceTitle = input.required<string>();
  readonly currentBranch = input.required<string>();
  readonly targetBranch = input.required<string>();
  readonly selectableBranches = input.required<readonly string[]>();
  readonly isStreaming = input<boolean>(false);
  // When set, rendered before the breadcrumb (used to inject window controls
  // + sidebar toggle when the left panel is collapsed).
  readonly leadingSlot = input<TemplateRef<unknown> | null>(null);

  // Open in IDE / Commit / Create PR live on the toolbar (moved off
  // the right-aside header). Placeholder Lucide icons today; real IDE
  // brand icons land via the OpenInTool catalog.
  readonly availableTools = input<readonly OpenInTool[]>([]);
  readonly lastUsedTool = input<OpenInTool | null>(null);
  readonly githubConnected = input<boolean>(false);
  readonly runStatus = input<RunStatus>('idle');
  readonly hasRunCommand = input<boolean>(false);
  // Toolbar-level read-only state. Disables Commit, locks the
  // BranchPicker, and refuses to enter rename mode. Open in IDE
  // stays enabled (read-only browsing in an external editor is fine).
  readonly frozen = input<boolean>(false);

  readonly targetBranchChange = output<string>();
  readonly toggleRightPanel = output<void>();
  readonly workspaceTitleChange = output<string>();
  readonly openIn = output<OpenInTool>();
  readonly commit = output<void>();
  readonly createPr = output<void>();
  readonly run = output<void>();
  readonly stopRun = output<void>();

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
