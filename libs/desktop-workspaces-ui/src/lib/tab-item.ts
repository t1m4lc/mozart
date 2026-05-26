import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { MzLoader } from '@mozart-ui/loader';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileCode, lucidePencil, lucideX } from '@ng-icons/lucide';
import { LlmIcon } from './llm-icon';
import type { WorkspaceTab } from '@mozart/desktop-workspaces-util';

// Renders one tab. Chat variant supports rename (dblclick on title or
// pen icon) and close (✕); file variant is read-only.
@Component({
  selector: 'app-tab-item',
  imports: [NgIcon, LlmIcon, MzLoader, HlmButtonImports, HlmIconImports],
  providers: [provideIcons({ lucideFileCode, lucidePencil, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'group/tab relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 px-2 first:pl-2 transition-[width,background-color] duration-150 text-muted-foreground hover:bg-accent/60 aria-selected:bg-brand/10 aria-selected:text-foreground',
    '[class.w-36]': '!renaming()',
    '[class.w-56]': 'renaming()',
    '[class.pr-2]': 'renaming() || !showActions()',
    '[class.pr-12]': '!renaming() && showActions()',
    '[attr.role]': '"tab"',
    '[attr.aria-selected]': 'active()',
    '(click)': 'activate.emit()',
  },
  template: `
    @if (tab().kind === 'chat') {
      @if ($any(tab()).isStreaming) {
        <mz-loader size="xs" variant="simple" class="text-brand" />
      } @else {
        <app-llm-icon [llmId]="$any(tab()).llmId" />
      }
    } @else {
      <ng-icon
        hlm
        name="lucideFileCode"
        size="xs"
        class="shrink-0 text-muted-foreground"
      />
    }

    @if (renaming()) {
      <input
        #renameInput
        type="text"
        [value]="tab().title"
        class="h-5 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 text-xs font-light leading-none text-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
        (click)="$event.stopPropagation()"
        (dblclick)="$event.stopPropagation()"
        (keydown.enter)="commitRename($any($event.target).value)"
        (keydown.escape)="cancelRename()"
        (blur)="commitRename($any($event.target).value)"
      />
    } @else {
      <span
        class="min-w-0 flex-1 truncate text-xs font-light text-foreground"
        [class.italic]="isPreviewTab()"
        (dblclick)="onTitleDblClick($event)"
      >
        {{ tab().title }}
      </span>
    }

    @if (showActions() && !renaming()) {
      <div
        class="absolute right-1 top-1/2 -translate-y-1/2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/tab:opacity-100"
      >
        @if (isChat()) {
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label="Rename tab"
            class="size-4 rounded-full text-muted-foreground"
            (click)="startRename($event)"
          >
            <ng-icon hlm name="lucidePencil" size="3xs" />
          </button>
        }

        @if (showClose()) {
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label="Close tab"
            class="size-4 rounded-full text-muted-foreground"
            [disabled]="isChatStreaming()"
            (click)="onClose($event)"
          >
            <ng-icon hlm name="lucideX" size="3xs" />
          </button>
        }
      </div>
    }

    <!-- TODO: fixme remove border bottom of parent by go on top of it  -->
    @if (active()) {
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 -bottom-px h-0.75 bg-brand shadow-[0_0_8px_hsl(var(--brand)/0.45)]"
      ></span>
    }
  `,
})
export class TabItem {
  readonly tab = input.required<WorkspaceTab>();
  readonly active = input.required<boolean>();
  // Hide the close button entirely when there is only one chat tab left
  // (prevents closing the last chat).
  readonly showClose = input<boolean>(true);

  readonly activate = output<void>();
  readonly dismiss = output<void>();
  readonly rename = output<string>();

  protected readonly renaming = signal(false);
  private readonly renameInput =
    viewChild<ElementRef<HTMLInputElement>>('renameInput');

  // Only chat tabs can be renamed — exposed for host bindings.
  protected readonly isChat = computed(() => this.tab().kind === 'chat');
  // Italic title for VS Code-style preview file tabs (single-click in
  // the tree opens a preview; double-click or first edit pins it).
  protected readonly isPreviewTab = computed(() => {
    const t = this.tab();
    return t.kind === 'file' && t.isPreview;
  });
  // Actions slot (rename pen + close ×) is shown for any tab; rename
  // is gated chat-only inside the slot. Without this, file tabs never
  // rendered their close button (the prior chat-only outer guard
  // short-circuited the entire slot).
  protected readonly showActions = computed(
    () => this.isChat() || this.tab().kind === 'file',
  );
  protected readonly isChatStreaming = computed(() => {
    const t = this.tab();
    return t.kind === 'chat' && t.isStreaming;
  });

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

  protected onTitleDblClick(event: Event): void {
    if (!this.isChat()) return;
    event.stopPropagation();
    this.renaming.set(true);
  }

  protected startRename(event: Event): void {
    event.stopPropagation();
    this.renaming.set(true);
  }

  protected commitRename(value: string): void {
    if (!this.renaming()) return;
    const next = value.trim();
    if (next && next !== this.tab().title) {
      this.rename.emit(next);
    }
    this.renaming.set(false);
  }

  protected cancelRename(): void {
    this.renaming.set(false);
  }

  protected onClose(event: Event): void {
    event.stopPropagation();
    this.dismiss.emit();
  }
}
