import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectSeo } from '../shell/seo';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <main class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <p class="text-muted-foreground text-sm font-medium uppercase tracking-widest">404</p>
      <h1 class="text-4xl font-bold tracking-tight">Page not found</h1>
      <p class="text-muted-foreground max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <a routerLink="/" class="text-sm font-medium underline underline-offset-4">
        Back to home
      </a>
    </main>
  `,
})
export default class NotFoundPageComponent implements OnInit {
  private readonly setSeo = injectSeo();

  ngOnInit() {
    this.setSeo({
      title: 'Page not found — Mozart',
      description: "The page you're looking for doesn't exist.",
      path: '/404',
      noindex: true,
    });
  }
}
