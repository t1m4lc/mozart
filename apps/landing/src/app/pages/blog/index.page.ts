import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import {
  BlogAttributes,
  isBlogFile,
  sortBlogEntriesNewestFirst,
  toBlogEntry,
} from './_layout/blog-content';

@Component({
  selector: 'app-blog-index',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-12">
      <h1
        class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Blog
      </h1>
      <p class="text-foreground/70 mt-2 text-base">
        Notes, updates, and stories from the Mozart team.
      </p>
    </header>

    @if (posts.length === 0) {
      <p class="text-foreground/60">No posts yet.</p>
    } @else {
      <ul class="border-border divide-border flex flex-col divide-y border-t border-b">
        @for (post of posts; track post.slug) {
          <li>
            <a
              [routerLink]="['/blog', post.slug]"
              class="group block py-8 transition-colors"
            >
              <div class="text-muted-foreground mb-2 text-sm">
                <time [attr.datetime]="post.date">{{ post.formattedDate }}</time>
              </div>
              <h2
                class="text-foreground group-hover:text-primary mb-2 text-2xl font-semibold tracking-tight transition-colors"
              >
                {{ post.title }}
              </h2>
              @if (post.description) {
                <p class="text-foreground/70 text-base">
                  {{ post.description }}
                </p>
              }
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export default class BlogIndexPage {
  protected readonly posts = sortBlogEntriesNewestFirst(
    injectContentFiles<BlogAttributes>((f) => isBlogFile(f.filename)).map(
      toBlogEntry,
    ),
  );
}
