import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload } from '@ng-icons/lucide';
import { UpdaterService } from './updater.service';

// Persistent banner shown when UpdaterService.updateReady() flips
// non-null. Same fixed-overlay convention as the offline banner in
// app-shell.ts: top-center, non-blocking, never auto-dismissed —
// the user clicks Restart whenever they're ready.

@Component({
  selector: 'app-update-available-banner',
  imports: [NgIcon, HlmIconImports, HlmButtonImports],
  providers: [provideIcons({ lucideDownload })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (updater.updateReady(); as ready) {
      <div
        role="status"
        class="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center"
      >
        <div
          class="pointer-events-auto flex items-center gap-3 rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-1.5 text-xs text-violet-900 shadow dark:text-violet-200"
        >
          <ng-icon hlm name="lucideDownload" size="xs" />
          <span>Mozart {{ ready.version }} ready to install.</span>
          <button hlmBtn size="xs" variant="ghost" (click)="onRestart()">
            Restart now
          </button>
        </div>
      </div>
    }
  `,
})
export class UpdateAvailableBanner {
  protected readonly updater = inject(UpdaterService);

  protected onRestart(): void {
    void this.updater.restart();
  }
}
