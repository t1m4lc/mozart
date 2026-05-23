import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import {
  MzCodeEditorImports,
  type CodeEditorLanguage,
  type CodeEditorTheme,
} from '@mozart-ui/code-editor';

const INITIAL_SAMPLE = `// MzCodeEditor sandbox sample
import { signal } from '@angular/core';

export function counter(initial = 0) {
  const value = signal(initial);
  const inc = () => value.update((v) => v + 1);
  return { value, inc };
}

// Try editing a line — the right column shows the latest emit.
`;

const LANGUAGE_OPTIONS: readonly CodeEditorLanguage[] = [
  'typescript',
  'javascript',
  'json',
  'css',
  'html',
  'markdown',
  'rust',
  'text',
];

@Component({
  selector: 'app-code-editor-sandbox',
  imports: [RouterLink, HlmButtonImports, MzCodeEditorImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-4 p-6 h-full">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold">MzCodeEditor sandbox</h1>
          <p class="text-xs text-muted-foreground">
            P2.1 — CodeMirror 6 standalone component. Toggle language /
            theme / read-only and watch the debounced
            <code>valueChange</code> emit on the right.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/">← Back</a>
      </header>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        @for (l of _languages; track l) {
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            [class.bg-accent]="l === _language()"
            (click)="_language.set(l)"
          >
            {{ l }}
          </button>
        }

        <span class="ms-2 inline-flex items-center gap-1">
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="_toggleTheme()"
          >
            theme : {{ _theme() }}
          </button>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="_toggleReadOnly()"
          >
            read-only : {{ _readOnly() ? 'on' : 'off' }}
          </button>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="_reset()"
          >
            reset value
          </button>
        </span>
      </div>

      <div class="grid flex-1 min-h-0 grid-cols-[1fr_360px] gap-3">
        <div class="min-h-0 overflow-hidden rounded-md border bg-background">
          <mz-code-editor
            class="h-full"
            [value]="_value()"
            [language]="_language()"
            [readOnly]="_readOnly()"
            [theme]="_theme()"
            (valueChange)="_onValueChange($event)"
          />
        </div>

        <aside
          class="flex min-h-0 flex-col gap-2 overflow-hidden rounded-md border bg-muted/30 p-3"
        >
          <h2 class="text-sm font-medium">Last emitted</h2>
          <p class="text-xs text-muted-foreground">
            Debounced 150ms after typing stops.
          </p>
          <pre
            class="flex-1 min-h-0 overflow-auto rounded bg-background p-2 text-[11px] font-mono"
          >{{ _emitted() }}</pre>
        </aside>
      </div>
    </section>
  `,
})
export class CodeEditorSandbox {
  protected readonly _languages = LANGUAGE_OPTIONS;
  protected readonly _value = signal(INITIAL_SAMPLE);
  protected readonly _emitted = signal(INITIAL_SAMPLE);
  protected readonly _language = signal<CodeEditorLanguage>('typescript');
  protected readonly _theme = signal<CodeEditorTheme>('light');
  protected readonly _readOnly = signal(false);

  protected _onValueChange(next: string): void {
    this._emitted.set(next);
  }

  protected _toggleTheme(): void {
    this._theme.update((m) => (m === 'light' ? 'dark' : 'light'));
  }

  protected _toggleReadOnly(): void {
    this._readOnly.update((r) => !r);
  }

  protected _reset(): void {
    this._value.set(INITIAL_SAMPLE);
    this._emitted.set(INITIAL_SAMPLE);
  }
}
