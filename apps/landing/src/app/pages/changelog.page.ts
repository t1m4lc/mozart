import { injectContentFiles } from '@analogjs/content';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  ChangelogAttributes,
  isChangelogFile,
  toChangelogEntry,
} from '../content/changelog';
import { injectCurrentPath } from '../shell/current-path';
import { injectSeo } from '../shell/seo';
import { ChangelogEntryShellComponent } from './changelog/_layout/changelog-entry-shell.component';

@Component({
  selector: 'app-changelog-layout',
  imports: [ChangelogEntryShellComponent, RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section
      class="font-sans mx-auto w-full max-w-5xl px-4 py-16 sm:px-8 sm:py-24"
    >
      @if (currentDetail(); as entry) {
        <nav class="mb-8">
          <button
            (click)="back()"
            class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Changelog
          </button>
        </nav>
        <app-changelog-entry-shell [entry]="entry">
          <h1
            slot="heading"
            class="text-foreground mb-6 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {{ entry.title }}
          </h1>
          <router-outlet />
        </app-changelog-entry-shell>
      } @else {
        <router-outlet />
      }
    </section>
  `,
})
export default class ChangelogLayoutPage {
  private readonly location = inject(Location);
  private readonly path = injectCurrentPath();
  private readonly seo = injectSeo();
  private readonly entries = injectContentFiles<ChangelogAttributes>((f) =>
    isChangelogFile(f.filename),
  ).map(toChangelogEntry);

  protected readonly currentDetail = computed(() => {
    const url = this.path();
    if (!url.startsWith('/changelog/')) return null;
    const slug = url.slice('/changelog/'.length);
    if (!slug) return null;
    return this.entries.find((e) => e.slug === slug) ?? null;
  });

  protected back(): void {
    this.location.back();
  }

  constructor() {
    effect(() => {
      const entry = this.currentDetail();
      if (!entry) return;
      this.seo({
        title: `v${entry.version} ${entry.title} | Mozart`,
        description: `Mozart v${entry.version} (${entry.formattedDate}): ${entry.title}.`,
        path: `/changelog/${entry.slug}`,
        type: 'article',
      });
    });
  }
}
