import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';
import { TabItem } from './tab-item';
import { CHAT_TAB_CAP, type WorkspaceTab } from './workspace-tab.model';

export interface TabRenameEvent {
  readonly tabId: string;
  readonly title: string;
}

/**
 * WorkspaceTabBar — dumb tab strip rendered directly under the breadcrumb.
 *
 * Pure presentational: the host owns the canonical tab list + active id,
 * passes them in, and listens for user intent via outputs. No internal
 * tab state. Drag-and-drop reordering is intentionally left out of v0.1.0-beta.1
 * (no persistence layer for tab order yet).
 */
@Component({
  selector: 'app-workspace-tab-bar',
  imports: [
    NgIcon,
    TabItem,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-sidebar-border bg-sidebar' },
  template: `
    <div role="tablist" class="flex items-stretch">
      <!-- Tabs strip scrolls horizontally when it overflows. Scrollbar
           is hidden so the strip blends with the toolbar; the user
           scrolls via trackpad / shift-wheel / drag. -->
      <div
        class=" flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        @for (tab of tabs(); track tab.id) {
          <app-tab-item
            [tab]="tab"
            [active]="tab.id === activeTabId()"
            [showClose]="tab.kind !== 'chat' || chatTabCount() > 1"
            (activate)="tabActivate.emit(tab.id)"
            (dismiss)="tabClose.emit(tab.id)"
            (rename)="tabRename.emit({ tabId: tab.id, title: $event })"
          />
        }
      </div>

      <div class="flex shrink-0 items-center px-1">
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          hlmTooltip="New chat, same workspace"
          position="bottom"
          aria-label="New chat, same workspace"
          class="size-7 rounded-md text-muted-foreground"
          [disabled]="atChatCap()"
          (click)="tabCreate.emit(); $any($event.currentTarget).blur()"
        >
          <ng-icon hlm name="lucidePlus" size="xs" />
        </button>
      </div>
    </div>
  `,
})
export class WorkspaceTabBar {
  readonly tabs = input.required<readonly WorkspaceTab[]>();
  readonly activeTabId = input.required<string>();

  readonly tabActivate = output<string>();
  readonly tabClose = output<string>();
  readonly tabRename = output<TabRenameEvent>();
  readonly tabCreate = output<void>();

  // Public so the page can pick the right empty-state variant.
  // True when the active tab is the leading (first) tab in the strip.
  readonly activeTabIsFirst = computed(() => {
    const list = this.tabs();
    return list.length > 0 && list[0].id === this.activeTabId();
  });

  protected readonly chatTabCount = computed(
    () => this.tabs().filter((t) => t.kind === 'chat').length,
  );

  // The `+` button creates chats only — gate on chat count, not the
  // total. File tabs (capped separately by FileTabsService) don't
  // consume this budget.
  protected readonly atChatCap = computed(
    () => this.chatTabCount() >= CHAT_TAB_CAP,
  );
}
