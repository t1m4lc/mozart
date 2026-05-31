import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { HlmButton } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { injectSeo } from '../shell/seo';
import {
  DOWNLOAD_DIALOG_CLASS,
  DownloadDialogComponent,
} from '../shell/download-dialog.component';

@Component({
  selector: 'app-download',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <span
        class="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium uppercase tracking-widest"
      >
        Private beta
      </span>
      <h1 class="text-4xl font-bold tracking-tight">
        Mozart desktop downloads
      </h1>
      <p class="text-muted-foreground max-w-sm">
        Mozart is in private beta. Enter your access code to download the build
        for your platform — auto-updates land on every release after that.
      </p>
      <button hlmBtn size="lg" type="button" (click)="openDownload()">
        Get the beta build
      </button>
    </main>
  `,
})
export default class DownloadPageComponent implements OnInit {
  private readonly setSeo = injectSeo();
  private readonly dialog = inject(HlmDialogService);

  ngOnInit() {
    this.setSeo({
      title: 'Download Mozart',
      description:
        'Download the Mozart desktop app for Mac, Windows, and Linux. Private beta — access code required.',
      path: '/download',
    });
  }

  protected openDownload(): void {
    this.dialog.open(DownloadDialogComponent, {
      contentClass: DOWNLOAD_DIALOG_CLASS,
      context: { section: 'download' },
    });
  }
}
