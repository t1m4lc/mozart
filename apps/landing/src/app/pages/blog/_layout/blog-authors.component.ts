import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BlogAuthor } from './blog-content';

@Component({
  selector: 'app-blog-authors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      @for (author of authors(); track author.name) {
        <div class="flex items-center gap-2">
          @if (author.avatar) {
            <img
              [src]="author.avatar"
              [alt]="author.name"
              width="32"
              height="32"
              class="border-border bg-muted h-8 w-8 rounded-full border object-cover"
              loading="lazy"
            />
          } @else {
            <span
              class="bg-muted text-muted-foreground border-border flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium"
            >
              {{ initials(author.name) }}
            </span>
          }
          <span class="flex flex-col text-sm leading-tight">
            <span class="text-foreground font-medium">{{ author.name }}</span>
            @if (author.role) {
              <span class="text-foreground/60 text-xs">{{ author.role }}</span>
            }
          </span>
        </div>
      }
    </div>
  `,
})
export class BlogAuthorsComponent {
  readonly authors = input.required<readonly BlogAuthor[]>();

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}
