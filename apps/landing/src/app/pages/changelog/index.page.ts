import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarkdownComponent, injectContentFiles } from '@analogjs/content';
import {
  ChangelogAttributes,
  isChangelogFile,
  sortChangelogEntriesNewestFirst,
  toChangelogEntry,
} from './_layout/changelog-content';

@Component({
  selector: 'app-changelog-index',
  imports: [MarkdownComponent, RouterLink],
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

    @if (entries.length === 0) {
      <p class="text-foreground/60">No releases yet.</p>
    } @else {
      <ol class="border-border divide-border flex flex-col divide-y border-t border-b">
        @for (entry of entries; track entry.slug) {
          <li class="py-12 first:pt-8 last:pb-8">
            <header class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h2
                id="v{{ entry.version }}"
                class="text-foreground inline-flex items-baseline gap-3 text-2xl font-semibold tracking-tight"
              >
                <span
                  class="bg-muted border-border text-foreground rounded-sm border px-2 py-0.5 font-mono text-base tracking-wider"
                >
                  v{{ entry.version }}
                </span>
                <span>{{ entry.title }}</span>
              </h2>
              <time
                [attr.datetime]="entry.date"
                class="text-muted-foreground text-sm"
              >
                {{ entry.formattedDate }}
              </time>
              @if (entry.detail) {
                <a
                  [routerLink]="['/changelog', entry.slug]"
                  class="text-primary hover:underline ml-auto text-sm"
                >
                  Permalink →
                </a>
              }
            </header>
            <analog-markdown classes="prose" [content]="entry.content" />
          </li>
        }
      </ol>
    }
  `,
})
export default class ChangelogIndexPage {
  protected readonly entries = sortChangelogEntriesNewestFirst(
    injectContentFiles<ChangelogAttributes>((f) =>
      isChangelogFile(f.filename),
    ).map(toChangelogEntry),
  );
}
