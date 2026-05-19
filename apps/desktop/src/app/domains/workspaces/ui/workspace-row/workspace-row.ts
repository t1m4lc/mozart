import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MzDiffStats } from '@mozart-ui/diff-stats';
import { HlmHoverCardImports } from '@mozart/ui/hover-card';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmLoaderImports } from '@mozart/ui/loader';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitBranch, lucideLoader, lucidePin } from '@ng-icons/lucide';
import type { Workspace } from '../../data/workspace.model';
import { relativeTime } from '../../util-relative-time';

// Maps a UI workspace status to the dot color in the hover popover.
const STATUS_COLOR: Record<string, string> = {
  backlog: 'bg-muted-foreground/40',
  in_progress: 'bg-brand',
  in_review: 'bg-amber-500',
  done: 'bg-emerald-500',
  canceled: 'bg-muted-foreground/30',
};

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  canceled: 'Canceled',
};

function statusDotColor(status: string): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR['backlog'];
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? STATUS_LABEL['backlog'];
}

@Component({
  selector: 'app-workspace-row',
  imports: [
    NgIcon,
    RouterLink,
    RouterLinkActive,
    HlmHoverCardImports,
    HlmSidebarImports,
    HlmIconImports,
    ...HlmLoaderImports,
    MzDiffStats,
  ],
  providers: [
    provideIcons({ lucideGitBranch, lucideLoader, lucidePin }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block relative group/ws-item' },
  template: `
    @if (workspace().pending) {
      <div
        hlmSidebarMenuButton
        aria-busy="true"
        aria-disabled="true"
        class="relative cursor-default gap-1.5 rounded-sm px-2 text-muted-foreground"
      >
        <ng-icon
          hlm
          name="lucideLoader"
          size="xs"
          class="animate-spin text-muted-foreground"
        />
        <span class="animate-pulse">{{ workspace().name }}</span>
      </div>
    } @else if (editing()) {
      <div class="relative flex h-8 items-center gap-1.5 rounded-md px-2">
        <ng-icon
          hlm
          name="lucideGitBranch"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />
        @if (workspace().pinned) {
          <ng-icon
            hlm
            name="lucidePin"
            size="10px"
            class="shrink-0 text-brand"
          />
        }
        <input
          #renameInput
          type="text"
          [value]="workspace().name"
          class="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-sm font-normal leading-none text-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
          (click)="$event.stopPropagation()"
          (keydown.enter)="commitRename($any($event.target).value)"
          (keydown.escape)="cancelRename()"
          (blur)="commitRename($any($event.target).value)"
        />
      </div>
    } @else {
      <hlm-hover-card class="contents">
        <a
          hlmSidebarMenuButton
          hlmHoverCardTrigger
          [showDelay]="800"
          align="right"
          [routerLink]="['/workspaces', workspace().id]"
          routerLinkActive="bg-brand/10 text-foreground [&_ng-icon]:text-brand!"
          class="cursor-pointer rounded-sm gap-1.5 pl-1.5 pr-2"
        >
          @if (isStreaming()) {
            <hlm-loader size="xs" class="text-brand" />
          } @else {
            @if (workspace().pinned) {
              <ng-icon
                hlm
                name="lucidePin"
                size="xs"
                class="text-brand rotate-45"
              />
            }
            <ng-icon
              hlm
              name="lucideGitBranch"
              size="xs"
              class="text-muted-foreground"
            />
          }

          <span
            class="min-w-0 truncate"
            [class.font-semibold]="workspace().unread"
            >{{ displayTitle() }}</span
          >

          <span class="ml-auto flex shrink-0 items-center gap-1">
            <mz-diff-stats
              [added]="diffStats()?.added ?? 0"
              [removed]="diffStats()?.removed ?? 0"
            />
          </span>
        </a>
        <ng-template hlmHoverCardPortal>
          <div hlmHoverCardContent class="w-64">
            <div class="flex items-center gap-2">
              <span
                aria-hidden="true"
                [class]="
                  'inline-block size-2 rounded-full ' +
                  statusDotColor(workspace().status)
                "
              ></span>
              <span class="text-sm font-medium">{{ workspace().name }}</span>
              <span
                class="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                {{ statusLabel(workspace().status) }}
              </span>
            </div>
            @if (chatTitle()) {
              <p class="mt-2 truncate text-xs text-muted-foreground">
                {{ chatTitle() }}
              </p>
            }
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{ relativeTime(lastActivityAt()) }}
            </p>
          </div>
        </ng-template>
      </hlm-hover-card>
    }
  `,
})
export class WorkspaceRow {
  readonly workspace = input.required<Workspace>();
  readonly editing = input<boolean>(false);
  // True while an agent run is streaming for this workspace. Drives
  // the loader-in-place-of-branch-icon affordance.
  readonly isStreaming = input<boolean>(false);
  // Title of the first/active chat for this workspace. Empty string =
  // fall back to workspace name; non-empty + not 'Start' is shown
  // instead of the workspace name in the row (better reflects user
  // intent once they've started a real conversation).
  readonly chatTitle = input<string>('');
  // Latest activity timestamp for the hover popover. When 0, falls
  // back to workspace.createdAt. Driven from ChatFacade's
  // lastActivityByWorkspace signal via the smart parent.
  readonly lastActivity = input<number>(0);
  // Aggregate diff stats vs base branch for this workspace. `null`
  // when stats haven't been fetched yet or this workspace has no
  // changes — either way, the chip stays hidden.
  readonly diffStats = input<{ added: number; removed: number } | null>(null);
  readonly renameCommit = output<string>();
  readonly renameCancel = output<void>();

  // Last meaningful activity timestamp for the hover popover. Falls
  // back to workspace.createdAt when no later activity is tracked.
  protected lastActivityAt(): number {
    return this.lastActivity() || this.workspace().createdAt.getTime();
  }

  // Title rendered in the row: chat title if it differs from the
  // default first-chat name 'Start', otherwise workspace name.
  protected displayTitle(): string {
    const title = this.chatTitle().trim();
    if (title && title !== 'Start') return title;
    return this.workspace().name;
  }

  protected statusDotColor = statusDotColor;
  protected statusLabel = statusLabel;
  protected relativeTime = relativeTime;

  private readonly renameInput =
    viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    effect(() => {
      if (this.editing()) {
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

  protected commitRename(value: string): void {
    if (!this.editing()) return;
    const next = value.trim();
    if (next && next !== this.workspace().name) {
      this.renameCommit.emit(next);
    } else {
      this.renameCancel.emit();
    }
  }

  protected cancelRename(): void {
    this.renameCancel.emit();
  }
}
