import { injectContentFiles } from '@analogjs/content';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BlogAttributes,
  isBlogFile,
  sortBlogEntriesNewestFirst,
  toBlogEntry,
} from '../../content/blog';
import { injectSeo } from '../../shell/seo';

@Component({
  selector: 'app-blog-index',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-16">
      <h1
        class="font-mono text-foreground text-5xl font-semibold tracking-tight sm:text-6xl"
      >
        Blog
      </h1>
      <p
        class="font-mono text-foreground/70 mt-4 max-w-lg text-base sm:text-lg"
      >
        Notes, updates, and stories from the Mozart team.
      </p>
    </header>

    @if (posts.length === 0) {
      <p class="text-foreground/60">No posts yet.</p>
    } @else {
      <ul class="flex flex-col gap-4">
        @for (post of posts; track post.slug) {
          <li>
            <a
              [routerLink]="['/blog', post.slug]"
              class="group border-border bg-card hover:border-foreground/25 hover:bg-muted/60 flex flex-col gap-3 rounded-xl border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-8"
            >
              <div
                class="text-muted-foreground font-mono text-xs tracking-wider uppercase"
              >
                <time [attr.datetime]="post.date">
                  {{ post.formattedDate }}
                </time>
              </div>
              <h2
                class="text-foreground group-hover:text-primary text-2xl font-semibold tracking-tight transition-colors sm:text-3xl"
              >
                {{ post.title }}
              </h2>
              @if (post.description) {
                <p
                  class="text-foreground/70 text-sm leading-relaxed sm:text-base"
                >
                  {{ post.description }}
                </p>
              }
              <span
                class="text-foreground/50 group-hover:text-foreground mt-2 inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              >
                Read post
                <span
                  aria-hidden="true"
                  class="transition-transform duration-200 group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
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

  private readonly seo = injectSeo();

  constructor() {
    this.seo({
      title: 'Blog — Mozart',
      description: 'Notes, updates, and stories from the Mozart team.',
      path: '/blog',
      type: 'website',
    });
  }
}
