import { injectContentFiles, injectContentFilesMap } from '@analogjs/content';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  DocsAttributes,
  groupDocsEntries,
  isDocsFile,
  toDocsEntry,
} from '../content/docs';
import { injectCurrentPath } from '../shell/current-path';
import { injectSeo } from '../shell/seo';
import { DocsPrevNextComponent } from './docs/_layout/docs-prev-next.component';
import { DocsShellComponent } from './docs/_layout/docs-shell.component';
import { TocHeading, extractHeadings } from './docs/_layout/toc';
import { TocComponent } from './docs/_layout/toc.component';

@Component({
  selector: 'app-docs-layout',
  imports: [
    DocsPrevNextComponent,
    DocsShellComponent,
    RouterOutlet,
    TocComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <app-docs-shell>
      @if (currentDetail(); as entry) {
        <header class="font-sans mb-8">
          <span
            class="bg-muted border-border text-muted-foreground mb-4 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
          >
            {{ entry.groupTitle }}
          </span>
          <h1
            class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {{ entry.title }}
          </h1>
          @if (entry.description) {
            <p class="text-foreground/70 mt-2 text-base">
              {{ entry.description }}
            </p>
          }
        </header>
      }
      <router-outlet />
      @if (currentDetail()) {
        <app-docs-prev-next [prev]="prev()" [next]="next()" />
      }
      <app-toc slot="toc" [headings]="headings()" />
    </app-docs-shell>
  `,
})
export default class DocsLayoutPage {
  private readonly path = injectCurrentPath();
  private readonly seo = injectSeo();
  private readonly filesMap = injectContentFilesMap();
  private readonly entries = injectContentFiles<DocsAttributes>((f) =>
    isDocsFile(f.filename),
  ).map(toDocsEntry);

  private readonly flatEntries = groupDocsEntries(this.entries).flatMap(
    (g) => g.entries,
  );

  protected readonly currentDetail = computed(() => {
    const url = this.path();
    if (!url.startsWith('/docs/')) return null;
    const slug = url.slice('/docs/'.length);
    if (!slug) return null;
    return this.flatEntries.find((e) => e.slug === slug) ?? null;
  });

  private readonly currentIndex = computed(() => {
    const detail = this.currentDetail();
    if (!detail) return -1;
    return this.flatEntries.findIndex((e) => e.slug === detail.slug);
  });

  protected readonly prev = computed(() => {
    const idx = this.currentIndex();
    return idx > 0 ? this.flatEntries[idx - 1] : null;
  });

  protected readonly next = computed(() => {
    const idx = this.currentIndex();
    if (idx === -1) return null;
    return idx < this.flatEntries.length - 1 ? this.flatEntries[idx + 1] : null;
  });

  protected readonly headings = signal<readonly TocHeading[]>([]);

  constructor() {
    effect(() => {
      const detail = this.currentDetail();
      if (!detail) {
        this.headings.set([]);
        return;
      }
      void this.loadHeadings(detail.slug);
      this.seo({
        title: `${detail.title} | Mozart docs`,
        description:
          detail.description ||
          `${detail.title}: ${detail.groupTitle} documentation for Mozart.`,
        path: `/docs/${detail.slug}`,
        type: 'article',
      });
    });
  }

  private async loadHeadings(slug: string): Promise<void> {
    const key = Object.keys(this.filesMap).find((k) =>
      k.endsWith(`/docs/${slug}.md`),
    );
    if (!key) {
      this.headings.set([]);
      return;
    }
    try {
      const raw = await this.filesMap[key]();
      this.headings.set(extractHeadings(raw).filter((h) => h.level === 2));
    } catch {
      this.headings.set([]);
    }
  }
}
