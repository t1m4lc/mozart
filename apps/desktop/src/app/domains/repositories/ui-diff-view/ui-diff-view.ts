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
import { lucideRefreshCw } from '@ng-icons/lucide';
import {
  parseUnifiedDiff,
  type DiffLine,
  type DiffLineKind,
} from '../util-diff-parser/util-diff-parser';

const LINE_CLASS: Record<DiffLineKind, string> = {
  add: 'bg-green-500/10 text-green-700 dark:text-green-400',
  remove: 'bg-red-500/10 text-red-700 dark:text-red-400',
  hunk: 'bg-muted/60 text-muted-foreground',
  meta: 'text-muted-foreground/70',
  context: 'text-foreground/80',
};

@Component({
  selector: 'app-diff-view',
  imports: [NgIcon, HlmButtonImports, HlmIconImports, HlmTooltipImports],
  providers: [provideIcons({ lucideRefreshCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <div
      class="flex h-8 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
    >
      <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
        @if (path()) {
          {{ path() }}
        } @else {
          Diff
        }
      </span>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="size-6 text-muted-foreground"
        hlmTooltip="Refresh diff"
        position="left"
        [disabled]="!path() || loading()"
        (click)="refresh.emit()"
      >
        <ng-icon hlm name="lucideRefreshCw" size="xs" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      @if (!path()) {
        <p class="px-3 py-3 text-xs text-muted-foreground">
          Select a file to see its changes.
        </p>
      } @else if (loading() && lines().length === 0) {
        <p class="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
      } @else if (error(); as err) {
        <p class="px-3 py-3 text-xs text-destructive">
          Failed to load diff: {{ err }}
        </p>
      } @else if (lines().length === 0) {
        <p class="px-3 py-3 text-xs text-muted-foreground">No changes.</p>
      } @else {
        <pre
          class="m-0 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all"
        >@for (line of lines(); track $index) {<span [class]="lineClass(line.kind)" class="block px-2">{{ line.text || nbsp }}</span>}</pre>
      }
    </div>
  `,
})
export class DiffView {
  // U+00A0 NBSP — preserves line height on empty diff lines. Lifted
  // out of the template because angular-eslint flags NBSP literals
  // in templates as "irregular whitespace".
  protected readonly nbsp = ' ';

  readonly path = input<string | null>(null);
  readonly diffText = input<string>('');
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly refresh = output<void>();

  protected readonly lines = computed<readonly DiffLine[]>(() =>
    parseUnifiedDiff(this.diffText()),
  );

  protected lineClass(kind: DiffLineKind): string {
    return LINE_CLASS[kind];
  }
}
