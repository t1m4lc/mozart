import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectSeo } from '../shell/seo';

@Component({
  selector: 'app-download',
  imports: [RouterLink],
  template: `
    <main class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <span class="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest">
        Coming soon
      </span>
      <h1 class="text-4xl font-bold tracking-tight">Mozart desktop downloads</h1>
      <p class="text-muted-foreground max-w-sm">
        Mozart is in private beta. Desktop binaries will be available here
        when we open access. Join the Discord to get early access.
      </p>
      <a routerLink="/discord" class="text-sm font-medium underline underline-offset-4">
        Join the Discord →
      </a>
    </main>
  `,
})
export default class DownloadPageComponent implements OnInit {
  private readonly setSeo = injectSeo();

  ngOnInit() {
    this.setSeo({
      title: 'Download Mozart — Coming soon',
      description:
        'Mozart desktop downloads. Mac, Windows, and Linux binaries coming with the public beta.',
      path: '/download',
    });
  }
}
