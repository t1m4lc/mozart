import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChangelogEntry } from '../../../content/changelog';

@Component({
  selector: 'app-changelog-entry-shell',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="grid gap-x-8 gap-y-6 md:grid-cols-4">
      <aside class="md:col-span-1">
        <div class="flex flex-col gap-1.5 md:sticky md:top-20">
          <a
            [routerLink]="['/changelog', entry().slug]"
            class="bg-muted border-border text-foreground hover:bg-muted/70 inline-flex w-fit items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs tracking-wider transition-colors"
          >
            v{{ entry().version }}
          </a>
          <time
            [attr.datetime]="entry().date"
            class="text-muted-foreground text-sm"
          >
            {{ entry().formattedDate }}
          </time>
        </div>
      </aside>
      <div class="min-w-0 md:col-span-3">
        <ng-content select="[slot=heading]" />
        <div class="prose">
          <ng-content />
        </div>
      </div>
    </article>
  `,
})
export class ChangelogEntryShellComponent {
  readonly entry = input.required<ChangelogEntry>();
}
