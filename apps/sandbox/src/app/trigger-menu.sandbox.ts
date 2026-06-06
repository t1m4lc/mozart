import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BrnCommand } from '@spartan-ng/brain/command';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmCommandImports } from '@spartan-ui/command';
import {
  MzTriggerMenu,
  serializeEditable,
  type TokenInsertFn,
  type TriggerMenuContext,
} from '@mozart-ui/trigger-menu';
import { MzComposerAtMenu, type AtMenuFileItem } from '@mozart-ui/composer';

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

// Same headless-cmdk wiring as the real composer menu: the trigger directive
// keeps focus in the field and forwards arrow/enter via `ctx.onNavKey`, which
// drives cmdk's keyManager (filter + scroll-into-view + empty for free).
@Component({
  selector: 'app-slash-menu',
  imports: [HlmCommandImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <hlm-command
      [search]="ctx().query()"
      role="listbox"
      class="bg-popover text-popover-foreground min-w-64 max-w-80 rounded-md border shadow-md"
      (mousedown)="$event.preventDefault()"
    >
      <div hlmCommandList>
        @for (group of ctx().data; track group.label) {
          <hlm-command-group>
            <span hlmCommandGroupLabel>{{ group.label }}</span>
            @for (item of group.items; track item.name) {
              <button
                hlmCommandItem
                [value]="item.name"
                (selected)="ctx().select(item)"
              >
                <span class="flex flex-col items-start gap-0.5 text-left">
                  <span class="text-sm font-medium">/{{ item.name }}</span>
                  <span class="text-muted-foreground text-xs">
                    {{ item.description }}
                  </span>
                </span>
              </button>
            }
          </hlm-command-group>
        }
        <div hlmCommandEmpty *hlmCommandEmptyState>No matches</div>
      </div>
    </hlm-command>
  `,
})
export class SlashMenu {
  readonly ctx = input.required<TriggerMenuContext<readonly SlashGroup[]>>();

  private readonly _command = viewChild.required(BrnCommand);
  private readonly _destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const km = this._command().keyManager;
      this.ctx().onNavKey((key) => {
        if (key === 'up') km.setPreviousItemActive();
        else if (key === 'down') km.setNextItemActive();
        else km.activeItem?.selected.emit();
      });
      const report = () =>
        this.ctx().setActiveDescendant(km.activeItem?.id() ?? null);
      km.change.pipe(takeUntilDestroyed(this._destroyRef)).subscribe(report);
      report();
    });
  }
}

@Component({
  selector: 'app-trigger-menu-sandbox',
  imports: [
    RouterLink,
    HlmButtonImports,
    MzTriggerMenu,
    SlashMenu,
    MzComposerAtMenu,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-6 p-6 max-w-2xl">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">MzTriggerMenu sandbox</h1>
          <p class="text-xs text-muted-foreground">
            Generic Notion-style trigger behavior. Type <code>/</code> in either
            field to open the skill menu (single-select), or <code>&#64;</code>
            in the textarea to open the multi-select file menu — Space/click
            toggles rows, the filter and selection are independent, Enter
            commits every checked file as a pill. Backspace/Delete beside a
            token removes the whole token.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/">← Back</a>
      </header>

      <ng-template #slashMenu let-ctx>
        <app-slash-menu [ctx]="ctx" />
      </ng-template>

      <ng-template #fileMenu let-ctx>
        <mz-composer-at-menu [ctx]="ctx" [items]="_files" />
      </ng-template>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">Basic input (single line)</span>
        <div
          class="mz-field min-h-9 w-full overflow-x-auto rounded-md border border-input bg-background px-3 py-1.5 text-sm leading-6 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring"
          contenteditable="true"
          data-placeholder="Type / to open the menu…"
          mzTriggerMenu
          [triggers]="[
            {
              trigger: '/',
              menu: slashMenu,
              context: _groups,
              insert: _toToken,
            },
          ]"
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
          data-placeholder="Ask Mozart to… (/ for commands, @ for files)"
          mzTriggerMenu
          [triggers]="[
            {
              trigger: '/',
              menu: slashMenu,
              context: _groups,
              insert: _toToken,
            },
            {
              trigger: '@',
              menu: fileMenu,
              insert: _fileToToken,
              selectionMode: 'multi',
            },
          ]"
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

  // Static demo files mimicking the feature's merged/ranked output: open tabs
  // first (badge `open`), then changed (status letter), then the tail.
  protected readonly _files: readonly AtMenuFileItem[] = [
    { path: 'libs/mozart-ui/composer/src/lib/mz-composer.ts', badge: 'open' },
    {
      path: 'libs/mozart-ui/trigger-menu/src/lib/mz-trigger-menu.directive.ts',
      badge: 'open',
    },
    { path: 'libs/desktop-files-util/src/lib/merge.ts', badge: 'M' },
    { path: 'README.md' },
    { path: 'package.json' },
    { path: 'docs/specs/spec-composer-at-file-mentions.md' },
  ];

  protected readonly _toToken: TokenInsertFn<SlashItem> = (item) => ({
    label: '/' + item.name,
    value: '/' + item.name,
    data: item,
    className:
      'mx-px rounded bg-primary/10 px-1 py-0.5 align-baseline text-sm font-semibold text-primary',
  });

  protected readonly _fileToToken: TokenInsertFn<AtMenuFileItem> = (item) => ({
    label: '@' + item.path,
    value: '@' + item.path,
    data: item,
    className:
      'mx-px rounded bg-muted px-1 py-0.5 align-baseline text-sm font-medium text-foreground',
  });

  protected _serialize(event: Event): string {
    return serializeEditable(event.target as HTMLElement);
  }

  protected _blockEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter') event.preventDefault();
  }
}
