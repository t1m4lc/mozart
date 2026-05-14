import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageSquare, lucidePlus } from '@ng-icons/lucide';
import type { Chat } from '../data/chat.model';
import { ChatFacade } from '../data/chat.facade';

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

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function bucketFor(createdAt: number, now: number): Bucket {
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = startOfDay(now);
  const startOfYesterday = startOfToday - dayMs;
  const startOfWeek = startOfToday - 6 * dayMs;
  if (createdAt >= startOfToday) return 'today';
  if (createdAt >= startOfYesterday) return 'yesterday';
  if (createdAt >= startOfWeek) return 'this_week';
  return 'older';
}

// Sidebar Chats group. Renders every open chat across every workspace,
// grouped chronologically (Today / Yesterday / This week / Older).
// Click a row -> navigate to /workspaces/<workspaceId>. The "+ New ask
// chat" affordance is disabled in Phase 1 with a tooltip — true
// non-contextualised chats land in Phase 2 with a system workspace.
@Component({
  selector: 'app-feature-chat-list',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmButtonImports,
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
      <p class="px-2 py-3 text-xs text-muted-foreground">
        No chats yet. Start one from a workspace.
      </p>
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
                class="h-7 w-full justify-start gap-2 truncate px-2 text-sm font-normal text-foreground"
                [routerLink]="['/workspaces', chat.workspaceId]"
                routerLinkActive="bg-accent"
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
}
