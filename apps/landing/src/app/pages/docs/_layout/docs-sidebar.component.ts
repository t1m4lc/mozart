import { injectContentFiles } from '@analogjs/content';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  DocsAttributes,
  groupDocsEntries,
  isDocsFile,
  toDocsEntry,
} from './docs-content';

@Component({
  selector: 'app-docs-sidebar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav aria-label="Documentation" class="flex flex-col gap-5">
      @for (group of groups; track group.slug) {
        <div class="flex flex-col">
          <p
            class="text-foreground/55 mb-1 px-2 text-[11px] font-medium tracking-wide uppercase"
          >
            {{ group.title }}
          </p>
          <ul class="flex flex-col gap-1">
            @for (entry of group.entries; track entry.slug) {
              <li>
                <a
                  [routerLink]="['/docs', entry.slug]"
                  routerLinkActive="bg-primary/10 text-primary"
                  [routerLinkActiveOptions]="{ exact: true }"
                  class="text-foreground/70 hover:bg-muted hover:text-foreground/90 block rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  {{ entry.title }}
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </nav>
  `,
})
export class DocsSidebarComponent {
  protected readonly groups = groupDocsEntries(
    injectContentFiles<DocsAttributes>((f) => isDocsFile(f.filename)).map(
      toDocsEntry,
    ),
  );
}
