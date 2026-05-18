import { Component, OnInit } from '@angular/core';
import { injectSeo } from '../shell/seo';
import { SITE_CONFIG } from '../shell/site-config';

@Component({
  selector: 'app-download',
  template: `
    <main class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <span class="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest">
        Coming soon
      </span>
      <h1 class="text-4xl font-bold tracking-tight">Mozart desktop downloads</h1>
      <p class="text-muted-foreground max-w-sm">
        Mozart is in private beta. Desktop binaries will be available here
        when we open access. Request early access to get notified when builds ship.
      </p>
      <a [href]="betaHref" target="_blank" rel="noopener" class="text-sm font-medium underline underline-offset-4">
        Get early access →
      </a>
    </main>
  `,
})
export default class DownloadPageComponent implements OnInit {
  private readonly setSeo = injectSeo();
  protected readonly betaHref = SITE_CONFIG.downloads.beta;

  ngOnInit() {
    this.setSeo({
      title: 'Download Mozart — Coming soon',
      description:
        'Mozart desktop downloads. Mac, Windows, and Linux binaries coming with the public beta.',
      path: '/download',
    });
  }
}
