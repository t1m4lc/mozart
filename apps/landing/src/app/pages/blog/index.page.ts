import { injectContentFiles } from '@analogjs/content';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BlogAttributes,
  BlogEntry,
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
    <div class="w-full">
      <header class="mb-12 sm:mb-16">
        <span
          class="bg-muted border-border text-muted-foreground mb-6 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
        >
          ~/blog
        </span>
        <h1
          class="text-foreground text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          Notes from the cockpit.
        </h1>
        <p class="text-foreground/70 mt-4 max-w-xl text-base sm:text-lg">
          Why we build Mozart, what we ship, and what we learn along the way.
        </p>
      </header>

      @if (posts.length === 0) {
        <p
          class="text-muted-foreground border-border rounded-md border border-dashed px-4 py-6 font-mono text-sm"
        >
          $ ls posts/ → empty. Check back soon.
        </p>
      } @else {
        <ol
          class="border-border divide-border flex flex-col divide-y border-t border-b"
        >
          @for (post of posts; track post.slug) {
            <li class="py-8 first:pt-6 last:pb-6 sm:py-10">
              <article
                class="grid gap-x-8 gap-y-4 md:grid-cols-[10rem_minmax(0,1fr)]"
              >
                <aside class="flex flex-col gap-2">
                  <time
                    [attr.datetime]="post.date"
                    class="bg-muted border-border text-foreground inline-flex w-fit items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs tracking-wider"
                  >
                    {{ isoDate(post.date) }}
                  </time>
                  <span
                    class="text-muted-foreground inline-flex w-fit items-center font-mono text-[11px]"
                  >
                    {{ post.slug }}.md
                  </span>
                </aside>

                <div class="min-w-0">
                  <a
                    [routerLink]="['/blog', post.slug]"
                    class="group inline-flex items-baseline"
                  >
                    <h2
                      class="text-foreground group-hover:text-primary text-2xl font-semibold tracking-tight transition-colors sm:text-3xl"
                    >
                      {{ post.title }}
                    </h2>
                  </a>
                  @if (post.description) {
                    <p
                      class="text-foreground/70 mt-3 text-sm leading-relaxed sm:text-base"
                    >
                      {{ post.description }}
                    </p>
                  }

                  <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                    @if (post.authors.length > 0) {
                      <ul class="flex items-center gap-2">
                        @for (author of post.authors; track author.name) {
                          <li class="flex items-center gap-2">
                            @if (author.avatar) {
                              <img
                                [src]="author.avatar"
                                [alt]="author.name"
                                width="24"
                                height="24"
                                class="border-border bg-muted h-6 w-6 rounded-full border object-cover"
                                loading="lazy"
                              />
                            } @else {
                              <span
                                class="bg-muted text-muted-foreground border-border flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-medium"
                              >
                                {{ initials(author.name) }}
                              </span>
                            }
                            <span class="text-muted-foreground text-xs">
                              {{ author.name }}
                            </span>
                          </li>
                        }
                      </ul>
                    }

                    <a
                      [routerLink]="['/blog', post.slug]"
                      class="text-foreground/70 hover:text-foreground group ml-auto inline-flex items-center gap-1.5 font-mono text-xs transition-colors"
                    >
                      <span aria-hidden="true">$</span>
                      cat {{ post.slug }}.md
                      <span
                        aria-hidden="true"
                        class="transition-transform duration-200 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </a>
                  </div>
                </div>
              </article>
            </li>
          }
        </ol>
      }
    </div>
  `,
})
export default class BlogIndexPage {
  protected readonly posts: readonly BlogEntry[] = sortBlogEntriesNewestFirst(
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

  protected isoDate(date: string): string {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toISOString().slice(0, 10);
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}
