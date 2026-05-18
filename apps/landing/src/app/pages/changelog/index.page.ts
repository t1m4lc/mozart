import {
  MarkdownComponent,
  injectContentFiles,
  injectContentFilesMap,
} from '@analogjs/content';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ChangelogAttributes,
  ChangelogEntry,
  isChangelogFile,
  sortChangelogEntriesNewestFirst,
  stripFrontMatter,
  toChangelogEntry,
} from '../../content/changelog';
import { injectSeo } from '../../shell/seo';
import { ChangelogEntryShellComponent } from './_layout/changelog-entry-shell.component';

@Component({
  selector: 'app-changelog-index',
  imports: [ChangelogEntryShellComponent, MarkdownComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-16">
      <h1
        class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Changelog
      </h1>
      <p class="text-foreground/70 mt-2 text-base">
        Every release, newest first.
      </p>
    </header>

    @if (entries().length === 0) {
      <p class="text-foreground/60">No releases yet.</p>
    } @else {
      <ol
        class="border-border divide-border flex flex-col divide-y border-t border-b"
      >
        @for (entry of entries(); track entry.slug) {
          <li class="py-12 first:pt-8 last:pb-8">
            <app-changelog-entry-shell [entry]="entry">
              <h2
                slot="heading"
                id="v{{ entry.version }}"
                class="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                <a
                  [routerLink]="['/changelog', entry.slug]"
                  class="text-foreground hover:text-primary transition-colors"
                >
                  {{ entry.title }}
                </a>
              </h2>
              @if (entry.content) {
                <analog-markdown [content]="entry.content" />
              }
            </app-changelog-entry-shell>
          </li>
        }
      </ol>
    }
  `,
})
export default class ChangelogIndexPage implements OnInit {
  private readonly filesMap = injectContentFilesMap();
  private readonly seo = injectSeo();

  protected readonly entries = signal<readonly ChangelogEntry[]>(
    sortChangelogEntriesNewestFirst(
      injectContentFiles<ChangelogAttributes>((f) =>
        isChangelogFile(f.filename),
      ).map(toChangelogEntry),
    ),
  );

  constructor() {
    this.seo({
      title: 'Changelog | Mozart',
      description: 'Every Mozart release, newest first.',
      path: '/changelog',
      type: 'website',
    });
  }

  async ngOnInit(): Promise<void> {
    const loaded = await Promise.all(
      this.entries().map(async (entry) => {
        const key = Object.keys(this.filesMap).find((k) =>
          k.endsWith(`/changelog/${entry.slug}.md`),
        );
        if (!key) return entry;
        try {
          const raw = await this.filesMap[key]();
          return { ...entry, content: stripFrontMatter(raw) };
        } catch {
          return entry;
        }
      }),
    );
    this.entries.set(loaded);
  }
}
