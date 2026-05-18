import { injectContentFiles, injectContentFilesMap } from '@analogjs/content';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BlogAttributes, isBlogFile, toBlogEntry } from '../content/blog';
import { injectCurrentPath } from '../shell/current-path';
import { injectSeo } from '../shell/seo';
import { BlogAuthorsComponent } from './blog/_layout/blog-authors.component';
import { TocHeading, extractHeadings } from './docs/_layout/toc';
import { TocComponent } from './docs/_layout/toc.component';

@Component({
  selector: 'app-blog-layout',
  imports: [BlogAuthorsComponent, RouterOutlet, TocComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section class="font-sans w-full py-12 sm:py-14">
      @if (currentPost(); as post) {
        <article class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div
            class="lg:grid lg:grid-cols-[1fr_minmax(0,42rem)_1fr] lg:items-start lg:gap-x-8"
          >
            @if (post.authors.length > 0) {
              <aside
                class="hidden lg:block lg:self-stretch"
                aria-label="Author"
              >
                <div class="lg:h-[calc(100%-70vh)]">
                  <div class="sticky top-24">
                    <p
                      class="text-muted-foreground text-mono mb-3 text-xs font-medium tracking-wider uppercase"
                    >
                      Written by
                    </p>
                    <app-blog-authors [authors]="post.authors" />
                  </div>
                </div>
              </aside>
            } @else {
              <div class="hidden lg:block" aria-hidden="true"></div>
            }

            <div class="mx-auto w-full max-w-2xl min-w-0">
              <header>
                <div class="text-muted-foreground mb-3 text-sm">
                  <time [attr.datetime]="post.date">
                    {{ post.formattedDate }}
                  </time>
                </div>
                <h1
                  class="text-foreground mb-3 text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  {{ post.title }}
                </h1>
                @if (post.description) {
                  <p class="text-foreground/70 mb-10 text-lg leading-relaxed">
                    {{ post.description }}
                  </p>
                }
              </header>
              <router-outlet />
            </div>

            <aside
              class="hidden xl:block xl:self-stretch"
              aria-label="Table of contents"
            >
              <div
                class=" sticky top-24 max-h-[calc(100vh-5rem)] overflow-y-auto"
              >
                <app-toc [headings]="headings()" />
              </div>
            </aside>
          </div>

          @if (post.authors.length > 0) {
            <footer class="border-border mx-auto mt-12 max-w-2xl border-t pt-8">
              <p
                class="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase"
              >
                Written by
              </p>
              <app-blog-authors [authors]="post.authors" />
            </footer>
          }
        </article>
      } @else {
        <div class="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8">
          <router-outlet />
        </div>
      }
    </section>
  `,
})
export default class BlogLayoutPage {
  private readonly path = injectCurrentPath();
  private readonly seo = injectSeo();
  private readonly filesMap = injectContentFilesMap();
  private readonly entries = injectContentFiles<BlogAttributes>((f) =>
    isBlogFile(f.filename),
  ).map(toBlogEntry);

  protected readonly currentPost = computed(() => {
    const url = this.path();
    if (!url.startsWith('/blog/')) return null;
    const slug = url.slice('/blog/'.length);
    if (!slug) return null;
    return this.entries.find((e) => e.slug === slug) ?? null;
  });

  protected readonly headings = signal<readonly TocHeading[]>([]);

  constructor() {
    effect(() => {
      const post = this.currentPost();
      if (!post) {
        this.headings.set([]);
        return;
      }
      void this.loadHeadings(post.slug);
      this.seo({
        title: `${post.title} — Mozart`,
        description: post.description || 'A note from the Mozart team.',
        path: `/blog/${post.slug}`,
        type: 'article',
        image: post.heroImage,
      });
    });
  }

  private async loadHeadings(slug: string): Promise<void> {
    const key = Object.keys(this.filesMap).find((k) =>
      k.endsWith(`/blog/${slug}.md`),
    );
    if (!key) {
      this.headings.set([]);
      return;
    }
    try {
      const raw = await this.filesMap[key]();
      this.headings.set(extractHeadings(raw).filter((h) => h.level === 2));
    } catch {
      this.headings.set([]);
    }
  }
}
