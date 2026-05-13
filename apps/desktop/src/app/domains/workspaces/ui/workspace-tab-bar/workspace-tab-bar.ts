import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus } from '@ng-icons/lucide';
import { TabItem } from './tab-item';
import {
  DEFAULT_CHAT_TITLE,
  MAX_TABS,
  type ChatTab,
  type WorkspaceTab,
} from './workspace-tab.model';

let tabIdCounter = 0;
const nextTabId = (): string => `tab-${++tabIdCounter}`;

const makeEmptyChatTab = (): ChatTab => ({
  id: nextTabId(),
  kind: 'chat',
  title: DEFAULT_CHAT_TITLE,
  llmId: null,
  isStreaming: false,
  hasMessages: false,
});

/**
 * WorkspaceTabBar — dumb tab strip rendered directly under the breadcrumb.
 *
 * Provisional: owns its own tab state internally (signals). A global store
 * is intentionally not wired up yet; once tab state needs to survive
 * navigation / be shared with the chat panel, lift this state out.
 *
 * File-tab future extension point: the model already includes a `FileTab`
 * variant (read-only — no close, no rename, file icon). `addFileTab()` is
 * stubbed for when the file-open flow is wired up.
 */
@Component({
  selector: 'app-workspace-tab-bar',
  imports: [
    NgIcon,
    TabItem,
    CdkDropList,
    CdkDrag,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-b border-sidebar-border bg-sidebar' },
  template: `
    <div role="tablist" class="flex items-stretch overflow-hidden">
      <div
        cdkDropList
        cdkDropListOrientation="horizontal"
        (cdkDropListDropped)="onDrop($event)"
        class="flex items-stretch"
      >
        @for (tab of tabs(); track tab.id) {
          <app-tab-item
            cdkDrag
            [cdkDragData]="tab"
            cdkDragLockAxis="x"
            [tab]="tab"
            [active]="tab.id === activeTabId()"
            [showClose]="tab.kind !== 'chat' || chatTabCount() > 1"
            (activate)="setActive(tab.id)"
            (dismiss)="closeTab(tab.id)"
            (rename)="renameTab(tab.id, $event)"
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
          [disabled]="atMaxTabs()"
          (click)="addChatTab(); $any($event.currentTarget).blur()"
        >
          <ng-icon hlm name="lucidePlus" size="xs" />
        </button>
      </div>
    </div>
  `,
})
export class WorkspaceTabBar {
  // Initialize with one empty chat tab so the workspace always has at
  // least one active conversation.
  private readonly initialTab = makeEmptyChatTab();

  protected readonly tabs = signal<readonly WorkspaceTab[]>([this.initialTab]);
  protected readonly activeTabId = signal<string>(this.initialTab.id);

  protected readonly chatTabCount = computed(
    () => this.tabs().filter((t) => t.kind === 'chat').length,
  );
  protected readonly atMaxTabs = computed(() => this.tabs().length >= MAX_TABS);

  protected setActive(id: string): void {
    this.activeTabId.set(id);
  }

  protected addChatTab(): void {
    if (this.atMaxTabs()) return;
    const tab = makeEmptyChatTab();
    this.tabs.update((list) => [...list, tab]);
    this.activeTabId.set(tab.id);
  }

  protected closeTab(id: string): void {
    const list = this.tabs();
    const target = list.find((t) => t.id === id);
    if (!target) return;
    // Block closing the last remaining chat tab.
    if (target.kind === 'chat' && this.chatTabCount() <= 1) return;
    // Block closing while a prompt is streaming.
    if (target.kind === 'chat' && target.isStreaming) return;

    const idx = list.findIndex((t) => t.id === id);
    const next = list.filter((t) => t.id !== id);
    this.tabs.set(next);

    if (this.activeTabId() === id && next.length > 0) {
      const fallback = next[Math.max(0, idx - 1)];
      this.activeTabId.set(fallback.id);
    }
  }

  protected renameTab(id: string, title: string): void {
    this.tabs.update((list) =>
      list.map((t) => (t.id === id ? { ...t, title } : t)),
    );
  }

  protected onDrop(event: CdkDragDrop<readonly WorkspaceTab[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.tabs.update((list) => {
      const next = [...list];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  // TODO: hook — when the first user prompt is sent in a chat, derive
  // a title from the prompt (AI-generated) and call renameTab(id, newTitle).
  // Not implemented here on purpose.

  // File-tab open path — intentionally unwired. Kept as a stub so the
  // FileTab branch is exercised by future code without a refactor.
  protected addFileTab(filePath: string, title: string): void {
    if (this.atMaxTabs()) return;
    const tab: WorkspaceTab = {
      id: nextTabId(),
      kind: 'file',
      title,
      filePath,
    };
    this.tabs.update((list) => [...list, tab]);
    this.activeTabId.set(tab.id);
  }
}
