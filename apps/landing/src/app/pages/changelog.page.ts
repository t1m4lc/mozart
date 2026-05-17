import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { filter, map } from 'rxjs/operators';
import { injectSeo } from '../shell/seo';
import {
  ChangelogAttributes,
  isChangelogFile,
  toChangelogEntry,
} from './changelog/_layout/changelog-content';
import { ChangelogEntryShellComponent } from './changelog/_layout/changelog-entry-shell.component';

@Component({
  selector: 'app-changelog-layout',
  imports: [ChangelogEntryShellComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section
      class="font-sans mx-auto w-full max-w-5xl px-4 py-16 sm:px-8 sm:py-24"
    >
      @if (currentDetail(); as entry) {
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
  private readonly router = inject(Router);
  private readonly seo = injectSeo();
  private readonly entries = injectContentFiles<ChangelogAttributes>((f) =>
    isChangelogFile(f.filename),
  ).map(toChangelogEntry);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly currentDetail = computed(() => {
    const url = (this.url() ?? '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/$/, '');
    if (!url.startsWith('/changelog/')) return null;
    const slug = url.slice('/changelog/'.length);
    if (!slug) return null;
    return this.entries.find((e) => e.slug === slug) ?? null;
  });

  constructor() {
    effect(() => {
      const entry = this.currentDetail();
      if (!entry) return;
      this.seo({
        title: `v${entry.version} ${entry.title} — Mozart`,
        description: `Mozart v${entry.version} (${entry.formattedDate}): ${entry.title}.`,
        path: `/changelog/${entry.slug}`,
        type: 'article',
      });
    });
  }
}
