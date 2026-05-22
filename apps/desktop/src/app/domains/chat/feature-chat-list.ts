import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmEmptyImports } from '@mozart/ui/empty';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageSquare, lucidePlus } from '@ng-icons/lucide';
import dayjs from 'dayjs';
import { WorkspacesFacade, workspaceRouteCommands } from '../workspaces';
import { ChatFacade } from './data/chat.facade';
import type { Chat } from './data/chat.model';

type Bucket = 'today' | 'yesterday' | 'this_week' | 'older';

interface BucketGroup {
  readonly id: Bucket;
  readonly label: string;
  readonly chats: readonly Chat[];
}

const BUCKET_ORDER: readonly Bucket[] = [
  'today',
  'yesterday',
  'this_week',
  'older',
];

const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  older: 'Older',
};

function bucketFor(createdAt: number, now: number): Bucket {
  const days = dayjs(now)
    .startOf('day')
    .diff(dayjs(createdAt).startOf('day'), 'day');
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'this_week';
  return 'older';
}

@Component({
  selector: 'app-feature-chat-list',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmButtonImports,
    HlmEmptyImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideMessageSquare, lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div class="flex h-8 items-center gap-0.5">
      <span class="text-sidebar-foreground/70 flex-1 text-xs font-medium">
        Chats
      </span>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        disabled
        hlmTooltip="Coming in Phase 2"
        position="bottom"
        aria-label="New ask chat"
        class="size-7 rounded-md text-muted-foreground"
      >
        <ng-icon hlm name="lucidePlus" size="xs" />
      </button>
    </div>

    @if (groups().length === 0) {
      <div hlmEmpty class="gap-1 rounded-md border p-3">
        <p class="text-xs text-muted-foreground">No chats yet.</p>
        <p class="text-xs text-muted-foreground/70">
          Open a workspace to start one.
        </p>
      </div>
    } @else {
      <ul class="flex flex-col gap-1">
        @for (group of groups(); track group.id) {
          <li class="flex flex-col gap-0.5">
            <span
              class="px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {{ group.label }}
            </span>
            @for (chat of group.chats; track chat.id) {
              <a
                hlmBtn
                variant="ghost"
                size="sm"
                class="relative h-7 w-full justify-start gap-2 truncate px-2 text-sm font-normal text-foreground"
                [routerLink]="chatRoute(chat.workspaceId)"
                routerLinkActive="bg-brand/15 text-foreground before:absolute before:left-0 before:top-1 before:bottom-1 before:w-1 before:rounded-r-full before:bg-brand before:shadow-[0_0_10px_hsl(var(--brand)/0.7)] [&_ng-icon]:text-brand!"
              >
                <ng-icon
                  hlm
                  name="lucideMessageSquare"
                  size="xs"
                  class="shrink-0 text-muted-foreground"
                />
                <span class="truncate">{{ chat.title }}</span>
              </a>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class FeatureChatList {
  private readonly facade = inject(ChatFacade);
  private readonly workspaces = inject(WorkspacesFacade);

  protected readonly groups = computed<readonly BucketGroup[]>(() => {
    const now = Date.now();
    const empty: Record<Bucket, Chat[]> = {
      today: [],
      yesterday: [],
      this_week: [],
      older: [],
    };
    for (const chat of this.facade.allChats()) {
      empty[bucketFor(chat.createdAt, now)].push(chat);
    }
    const result: BucketGroup[] = [];
    for (const id of BUCKET_ORDER) {
      if (empty[id].length === 0) continue;
      result.push({ id, label: BUCKET_LABELS[id], chats: empty[id] });
    }
    return result;
  });

  protected chatRoute(workspaceId: string): readonly string[] {
    const workspace = this.workspaces.workspaceById(workspaceId)();
    if (!workspace) return ['/'];
    return workspaceRouteCommands(workspace.projectId, workspace.id);
  }
}
