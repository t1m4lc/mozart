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
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileCode, lucidePencil, lucideX } from '@ng-icons/lucide';
import { LlmIcon } from './llm-icon';
import type { WorkspaceTab } from './workspace-tab.model';

// Renders one tab. Chat variant supports rename (dblclick on title or
// pen icon) and close (✕); file variant is read-only.
@Component({
  selector: 'app-tab-item',
  imports: [NgIcon, LlmIcon, HlmButtonImports, HlmIconImports],
  providers: [provideIcons({ lucideFileCode, lucidePencil, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'group/tab relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 transition-[width,background-color] duration-150 text-muted-foreground hover:bg-accent/60 aria-selected:bg-brand/15 aria-selected:text-foreground',
    '[class.w-36]': '!renaming()',
    '[class.w-56]': 'renaming()',
    '[class.pr-2]': "renaming() || (tab().kind !== 'chat')",
    '[class.pr-12]': "!renaming() && tab().kind === 'chat'",
    '[attr.role]': '"tab"',
    '[attr.aria-selected]': 'active()',
    '(click)': 'activate.emit()',
  },
  template: `
    @if (tab().kind === 'chat') {
      <app-llm-icon [llmId]="$any(tab()).llmId" />
    } @else {
      <ng-icon
        hlm
        name="lucideFileCode"
        size="11px"
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
        (dblclick)="onTitleDblClick($event)"
      >
        {{ tab().title }}
      </span>
    }

    @if (tab().kind === 'chat' && !renaming()) {
      <div
        class="absolute right-1 top-1/2 -translate-y-1/2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/tab:opacity-100"
      >
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-label="Rename tab"
          class="size-4 rounded-full text-muted-foreground"
          (click)="startRename($event)"
        >
          <ng-icon hlm name="lucidePencil" size="8px" />
        </button>

        @if (showClose()) {
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label="Close tab"
            class="size-4 rounded-full text-muted-foreground"
            [disabled]="$any(tab()).isStreaming"
            (click)="onClose($event)"
          >
            <ng-icon hlm name="lucideX" size="9px" />
          </button>
        }
      </div>
    }

    <!-- TODO: fixme remove border bottom of parent by go on top of it  -->
    @if (active()) {
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 -bottom-px h-1 bg-brand shadow-[0_0_12px_hsl(var(--brand)/0.75)]"
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
