import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import {
  MzTriggerMenu,
  serializeEditable,
  type TokenInsertFn,
  type TriggerMenuContext,
} from '@mozart-ui/trigger-menu';

interface SlashItem {
  readonly name: string;
  readonly description: string;
}

interface SlashGroup {
  readonly label: string;
  readonly items: readonly SlashItem[];
}

const SLASH_GROUPS: readonly SlashGroup[] = [
  {
    label: 'Claude',
    items: [
      { name: 'review', description: 'Review the current diff for bugs' },
      { name: 'explain', description: 'Explain the selected code' },
    ],
  },
  {
    label: 'Codex',
    items: [
      { name: 'refactor', description: 'Refactor for readability' },
      { name: 'tests', description: 'Generate unit tests for this file' },
    ],
  },
  {
    label: 'Mozart',
    items: [
      { name: 'plan', description: 'Draft an implementation plan' },
      { name: 'scaffold', description: 'Scaffold a new lib or component' },
    ],
  },
];

@Component({
  selector: 'app-slash-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="min-w-64 max-w-80 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      (mousedown)="$event.preventDefault()"
    >
      @for (group of _filtered(); track group.label) {
        <div class="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          {{ group.label }}
        </div>
        @for (item of group.items; track item.name) {
          <button
            type="button"
            class="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left"
            [class.bg-accent]="item === _active()"
            [class.text-accent-foreground]="item === _active()"
            (mouseenter)="_focus(item)"
            (click)="_pick(item)"
          >
            <span class="text-sm font-medium">/{{ item.name }}</span>
            <span class="text-xs text-muted-foreground">{{
              item.description
            }}</span>
          </button>
        }
      } @empty {
        <div class="px-2 py-6 text-center text-sm text-muted-foreground">
          No matches
        </div>
      }
    </div>
  `,
})
export class SlashMenu implements OnInit {
  readonly ctx = input.required<TriggerMenuContext<readonly SlashGroup[]>>();

  protected readonly _filtered = computed<readonly SlashGroup[]>(() => {
    const q = this.ctx().query().toLowerCase();
    return this.ctx()
      .data.map((group) => ({
        ...group,
        items: group.items.filter((i) => i.name.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  });

  protected readonly _flat = computed<readonly SlashItem[]>(() =>
    this._filtered().flatMap((g) => g.items),
  );

  private readonly _activeIndex = linkedSignal<readonly SlashItem[], number>({
    source: this._flat,
    computation: () => 0,
  });

  protected readonly _active = computed(
    () => this._flat()[this._activeIndex()],
  );

  ngOnInit(): void {
    this.ctx().onNavKey((key) => {
      if (key === 'down') {
        this._activeIndex.update((i) =>
          Math.min(this._flat().length - 1, i + 1),
        );
      } else if (key === 'up') {
        this._activeIndex.update((i) => Math.max(0, i - 1));
      } else {
        const item = this._active();
        if (item) this.ctx().select(item);
      }
    });
  }

  protected _focus(item: SlashItem): void {
    this._activeIndex.set(this._flat().indexOf(item));
  }

  protected _pick(item: SlashItem): void {
    this.ctx().select(item);
  }
}

@Component({
  selector: 'app-trigger-menu-sandbox',
  imports: [RouterLink, HlmButtonImports, MzTriggerMenu, SlashMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-6 p-6 max-w-2xl">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">MzTriggerMenu sandbox</h1>
          <p class="text-xs text-muted-foreground">
            Generic Notion-style trigger behavior. Type <code>/</code> in either
            field to open the injected menu, filter as you type, and select an
            item to insert an atomic pill token. Backspace/Delete beside a token
            removes the whole token.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/">← Back</a>
      </header>

      <ng-template #slashMenu let-ctx>
        <app-slash-menu [ctx]="ctx" />
      </ng-template>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">Basic input (single line)</span>
        <div
          class="mz-field min-h-9 w-full overflow-x-auto rounded-md border border-input bg-background px-3 py-1.5 text-sm leading-6 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring"
          contenteditable="true"
          data-placeholder="Type / to open the menu…"
          mzTriggerMenu
          [trigger]="'/'"
          [menu]="slashMenu"
          [context]="_groups"
          [insert]="_toToken"
          (input)="_single.set(_serialize($event))"
          (keydown)="_blockEnter($event)"
        ></div>
        <code class="text-xs text-muted-foreground"
          >value: {{ _single() }}</code
        >
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">Basic textarea (multi line)</span>
        <div
          class="mz-field min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm leading-6 whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring"
          contenteditable="true"
          data-placeholder="Ask Mozart to… (type / for commands)"
          mzTriggerMenu
          [trigger]="'/'"
          [menu]="slashMenu"
          [context]="_groups"
          [insert]="_toToken"
          (input)="_multi.set(_serialize($event))"
        ></div>
        <code class="text-xs text-muted-foreground whitespace-pre-wrap"
          >value: {{ _multi() }}</code
        >
      </div>
    </section>
  `,
  styles: `
    .mz-field:empty::before {
      content: attr(data-placeholder);
      color: hsl(var(--muted-foreground));
      pointer-events: none;
    }
  `,
})
export class TriggerMenuSandbox {
  protected readonly _groups = SLASH_GROUPS;
  protected readonly _single = signal('');
  protected readonly _multi = signal('');

  protected readonly _toToken: TokenInsertFn<SlashItem> = (item) => ({
    label: '/' + item.name,
    value: '/' + item.name,
    data: item,
    className:
      'mx-px rounded bg-primary/10 px-1 py-0.5 align-baseline text-sm font-semibold text-primary',
  });

  protected _serialize(event: Event): string {
    return serializeEditable(event.target as HTMLElement);
  }

  protected _blockEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter') event.preventDefault();
  }
}
