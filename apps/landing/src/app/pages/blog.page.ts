import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { injectCurrentPath } from '../shell/current-path';
import { injectSeo } from '../shell/seo';
import {
  BlogAttributes,
  isBlogFile,
  toBlogEntry,
} from '../content/blog';
import { BlogAuthorsComponent } from './blog/_layout/blog-authors.component';

@Component({
  selector: 'app-blog-layout',
  imports: [BlogAuthorsComponent, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 flex-col' },
  template: `
    <section
      class="font-sans mx-auto w-full max-w-2xl px-4 py-16 sm:px-8 sm:py-24"
    >
      @if (currentPost(); as post) {
        <article>
          <div class="text-muted-foreground mb-3 text-sm">
            <time [attr.datetime]="post.date">{{ post.formattedDate }}</time>
          </div>
          <h1
            class="text-foreground mb-4 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {{ post.title }}
          </h1>
          @if (post.description) {
            <p class="text-foreground/70 mb-8 text-lg leading-relaxed">
              {{ post.description }}
            </p>
          }
          @if (post.heroImage) {
            <img
              [src]="post.heroImage"
              [alt]="post.title"
              width="1200"
              height="800"
              class="border-border bg-muted mb-8 h-auto w-full rounded-lg border"
              loading="lazy"
            />
          }
          <router-outlet />
          @if (post.authors.length > 0) {
            <footer class="border-border mt-12 border-t pt-8">
              <p class="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                Written by
              </p>
              <app-blog-authors [authors]="post.authors" />
            </footer>
          }
        </article>
      } @else {
        <router-outlet />
      }
    </section>
  `,
})
export default class BlogLayoutPage {
  private readonly path = injectCurrentPath();
  private readonly seo = injectSeo();
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

  constructor() {
    effect(() => {
      const post = this.currentPost();
      if (!post) return;
      this.seo({
        title: `${post.title} — Mozart`,
        description: post.description || 'A note from the Mozart team.',
        path: `/blog/${post.slug}`,
        type: 'article',
        image: post.heroImage,
      });
    });
  }
}
