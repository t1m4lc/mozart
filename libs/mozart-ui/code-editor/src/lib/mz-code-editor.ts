import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { mozartThemeFor } from '@mozart-ui/codemirror-theme';
import { languageFromPath, loadLanguageExtension } from './language';
import type { CodeEditorLanguage } from './language';

export type CodeEditorTheme = 'light' | 'dark';

export type { CodeEditorLanguage };

const VALUE_CHANGE_DEBOUNCE_MS = 150;

@Component({
  selector: 'mz-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full w-full min-h-0 select-text flex-col overflow-hidden',
  },
  template: `<div
    #host
    class="min-h-0 flex-1 overflow-auto select-text"
  ></div>`,
})
export class MzCodeEditor {
  readonly value = input<string>('');
  readonly language = input<CodeEditorLanguage | string | null>(null);
  readonly path = input<string | null>(null);
  readonly readOnly = input<boolean>(false);
  readonly theme = input<CodeEditorTheme>('light');
  // Extra paddingBottom on `.cm-content` so the document can scroll
  // past the visible viewport bottom. Used when a fixed UI element
  // overlays the editor's bottom region (e.g. the workspace composer
  // on file tabs) — without this, the last lines are forever hidden
  // behind the overlay. 0 disables; default is no padding for
  // contexts that don't need it (sandbox, etc.).
  readonly scrollPaddingBottom = input<number>(0);

  readonly valueChange = output<string>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly hostRef =
    viewChild.required<ElementRef<HTMLDivElement>>('host');

  private readonly _ready = signal(false);
  private view: EditorView | null = null;

  private readonly languageCompartment = new Compartment();
  private readonly themeCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmitted = '';
  private currentLanguageRequest = 0;

  constructor() {
    afterNextRender(() => this.initEditor());

    effect(() => {
      const v = this.value();
      if (!this._ready() || !this.view) return;
      const current = this.view.state.doc.toString();
      if (v === current) return;
      // External value differs — replace buffer. Local dirty edits sit in
      // the same string; parents that want to preserve them simply do not
      // push a new `value` until the user resets.
      this.lastEmitted = v;
      this.view.dispatch({
        changes: { from: 0, to: current.length, insert: v },
      });
    });

    effect(() => {
      const ro = this.readOnly();
      if (!this._ready() || !this.view) return;
      this.view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(
          EditorState.readOnly.of(ro),
        ),
      });
    });

    effect(() => {
      const theme = this.theme();
      if (!this._ready() || !this.view) return;
      this.view.dispatch({
        effects: this.themeCompartment.reconfigure(mozartThemeFor(theme)),
      });
    });

    effect(() => {
      const lang = this.resolveLanguage();
      if (!this._ready() || !this.view) return;
      void this.applyLanguage(lang);
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  private initEditor(): void {
    const host = this.hostRef().nativeElement;
    const initial = this.value();
    this.lastEmitted = initial;

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      this.languageCompartment.of([]),
      this.themeCompartment.of(mozartThemeFor(this.theme())),
      this.readOnlyCompartment.of(EditorState.readOnly.of(this.readOnly())),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        this.scheduleEmit();
      }),
    ];

    const pb = this.scrollPaddingBottom();
    if (pb > 0) {
      extensions.push(
        EditorView.theme({
          '.cm-content': { paddingBottom: `${pb}px` },
        }),
      );
    }

    const state = EditorState.create({
      doc: initial,
      extensions,
    });

    this.view = new EditorView({ state, parent: host });
    this._ready.set(true);

    void this.applyLanguage(this.resolveLanguage());
  }

  private resolveLanguage(): CodeEditorLanguage {
    const explicit = this.language();
    if (explicit) return explicit as CodeEditorLanguage;
    const p = this.path();
    return p ? languageFromPath(p) : 'text';
  }

  private async applyLanguage(language: CodeEditorLanguage): Promise<void> {
    const requestId = ++this.currentLanguageRequest;
    const ext = await loadLanguageExtension(language);
    if (requestId !== this.currentLanguageRequest) return;
    if (!this.view) return;
    this.view.dispatch({
      effects: this.languageCompartment.reconfigure(ext ?? []),
    });
  }

  private scheduleEmit(): void {
    if (this.debounceTimer != null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.view) return;
      const next = this.view.state.doc.toString();
      if (next === this.lastEmitted) return;
      this.lastEmitted = next;
      this.valueChange.emit(next);
    }, VALUE_CHANGE_DEBOUNCE_MS);
  }

  private teardown(): void {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.view?.destroy();
    this.view = null;
    this._ready.set(false);
  }
}
