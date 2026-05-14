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
  effect,
  input,
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
  NEW_CHAT_TITLE,
  type ChatTab,
  type WorkspaceTab,
} from './workspace-tab.model';

let tabIdCounter = 0;
const nextTabId = (): string => `tab-${++tabIdCounter}`;

const makeChatTab = (title: string): ChatTab => ({
  id: nextTabId(),
  kind: 'chat',
  title,
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
  // Streaming flag pushed from the page (one chat per workspace in
  // Phase 1, so the flag mirrors onto the first chat tab). Drives the
  // tab icon -> cli-loader swap.
  readonly streaming = input<boolean>(false);

  // Initialize with one empty chat tab so the workspace always has at
  // least one active conversation. The first tab is the "Start" tab —
  // empty state shows the workspace-init checklist. Subsequent tabs
  // (via `addChatTab`) get the lighter "Untitled" treatment.
  private readonly initialTab = makeChatTab(DEFAULT_CHAT_TITLE);

  protected readonly tabs = signal<readonly WorkspaceTab[]>([this.initialTab]);
  // Public readonly so the page can react to tab-active changes
  // (currently used to refocus the composer on switch).
  readonly activeTabId = signal<string>(this.initialTab.id);

  constructor() {
    // Mirror the page-level streaming signal onto the first chat tab.
    // Phase 2's "smart tab bar" wiring will let each tab carry its own
    // streaming state; until then this is the single source of truth.
    effect(() => {
      const isStreaming = this.streaming();
      this.tabs.update((list) =>
        list.map((t, i) =>
          i === 0 && t.kind === 'chat' ? { ...t, isStreaming } : t,
        ),
      );
    });
  }

  // Exposed publicly so the page can pick the right empty-state variant.
  // True when the active tab is the leading (first) tab in the strip.
  readonly activeTabIsFirst = computed(() => {
    const list = this.tabs();
    return list.length > 0 && list[0].id === this.activeTabId();
  });

  protected readonly chatTabCount = computed(
    () => this.tabs().filter((t) => t.kind === 'chat').length,
  );
  protected readonly atMaxTabs = computed(() => this.tabs().length >= MAX_TABS);

  protected setActive(id: string): void {
    this.activeTabId.set(id);
  }

  protected addChatTab(): void {
    if (this.atMaxTabs()) return;
    // Number new tabs incrementally: Untitled, Untitled2, Untitled3…
    // Numbering is local to the tab bar instance.
    const taken = new Set(this.tabs().map((t) => t.title));
    let title = NEW_CHAT_TITLE;
    for (let i = 2; taken.has(title); i++) {
      title = `${NEW_CHAT_TITLE}${i}`;
    }
    const tab = makeChatTab(title);
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
