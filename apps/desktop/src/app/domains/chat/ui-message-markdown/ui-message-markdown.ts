import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { marked } from 'marked';

// Chat-scoped markdown renderer. Takes a raw markdown string, runs it through
// `marked` (GitHub Flavored Markdown), and injects the resulting HTML
// into a styled container. Trusted-content only — the source is the
// workspace file system, not arbitrary user input, so we don't pull
// DOMPurify in. If/when Mozart starts rendering remote markdown
// (issue bodies, PR descriptions, …) wire DOMPurify here.
//
// Styling : Tailwind utilities applied to descendant tags via
// `:where()` selectors so a single class wraps every common element.
// Avoids depending on `@tailwindcss/typography` for one component.
@Component({
  selector: 'app-message-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full overflow-auto select-text' },
  styles: [
    `
      .md :where(h1) {
        font-size: 1.5rem;
        font-weight: 600;
        margin-block: 1rem 0.5rem;
      }
      .md :where(h2) {
        font-size: 1.25rem;
        font-weight: 600;
        margin-block: 1rem 0.5rem;
      }
      .md :where(h3) {
        font-size: 1.05rem;
        font-weight: 600;
        margin-block: 0.75rem 0.375rem;
      }
      .md :where(h4, h5, h6) {
        font-size: 1rem;
        font-weight: 600;
        margin-block: 0.5rem 0.25rem;
      }
      .md :where(p) {
        margin-block: 0.5rem;
        line-height: 1.55;
      }
      .md :where(ul) {
        list-style: disc;
        padding-inline-start: 1.25rem;
        margin-block: 0.5rem;
      }
      .md :where(ol) {
        list-style: decimal;
        padding-inline-start: 1.25rem;
        margin-block: 0.5rem;
      }
      .md :where(li) {
        margin-block: 0.25rem;
      }
      .md :where(a) {
        color: hsl(var(--brand));
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .md :where(a):hover {
        text-decoration-thickness: 2px;
      }
      .md :where(strong) {
        font-weight: 600;
      }
      .md :where(em) {
        font-style: italic;
      }
      .md :where(code) {
        font-family: var(--font-mono);
        font-size: 0.85em;
        background: hsl(var(--muted) / 0.4);
        padding: 0.1em 0.35em;
        border-radius: 3px;
      }
      .md :where(pre) {
        background: hsl(var(--muted) / 0.4);
        padding: 0.75rem 1rem;
        border-radius: 6px;
        overflow-x: auto;
        margin-block: 0.75rem;
      }
      .md :where(pre code) {
        background: transparent;
        padding: 0;
        font-size: 0.85em;
      }
      .md :where(blockquote) {
        border-inline-start: 3px solid hsl(var(--border));
        padding-inline-start: 0.75rem;
        color: hsl(var(--muted-foreground));
        margin-block: 0.5rem;
      }
      .md :where(hr) {
        border: 0;
        border-top: 1px solid hsl(var(--border));
        margin-block: 1rem;
      }
      .md :where(table) {
        border-collapse: collapse;
        margin-block: 0.75rem;
        font-size: 0.875em;
      }
      .md :where(th, td) {
        border: 1px solid hsl(var(--border));
        padding: 0.375rem 0.625rem;
        text-align: start;
      }
      .md :where(th) {
        background: hsl(var(--muted) / 0.4);
        font-weight: 600;
      }
      .md :where(img) {
        max-width: 100%;
        border-radius: 6px;
      }
    `,
  ],
  template: `
    <article
      class="md text-foreground max-w-3xl px-4 py-3 text-sm"
      [innerHTML]="html()"
    ></article>
  `,
})
export class MessageMarkdown {
  readonly source = input<string>('');

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly html = computed<SafeHtml>(() => {
    const raw = this.source();
    if (!raw) return this.sanitizer.bypassSecurityTrustHtml('');
    // `marked.parse` is async-capable but the sync overload returns a
    // string for plain markdown ; we don't use any async extensions.
    const result = marked.parse(raw, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(result);
  });
}
