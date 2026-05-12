/**
 * `RightHeaderComponent` — RIGHT segment of the 3-segment shell header.
 *
 * Per the S1.ui.2 shell re-architecture, this component sits directly
 * above the right-panel column (sized to `var(--right-panel-width)`).
 *
 * Platform split:
 *   - Windows / Linux: standard window controls (minimize / maximize /
 *     close) live here, rendered with `hlmBtn variant="ghost"
 *     size="icon-xs"`.
 *   - macOS: this segment is empty + draggable. The traffic-light
 *     cluster lives in `<app-top-bar>` (the LEFT segment) so it follows
 *     Apple's HIG (top-left of the window).
 *
 * Drag region: every non-interactive area carries
 * `data-tauri-drag-region`; the 3 win/linux control buttons carry
 * `data-tauri-drag-region="false"` so clicks reach the handlers.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucideSquare, lucideX } from '@ng-icons/lucide';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { OsService } from '../services/os.service';

@Component({
  selector: 'app-right-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-tauri-drag-region': '',
    class: 'block h-full',
  },
  imports: [NgIcon, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucideMinus, lucideSquare, lucideX })],
  template: `
    <div
      class="flex items-center gap-2 h-full px-3 bg-card border-b border-border text-foreground"
      aria-label="Window controls"
      data-tauri-drag-region
    >
      <span class="flex-auto" data-tauri-drag-region></span>
      @if (!isMacOS) {
        <span class="inline-flex items-center gap-0.5" data-tauri-drag-region="false">
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Minimize"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Minimize'"
            (click)="minimize()"
          >
            <ng-icon name="lucideMinus" class="wc-icon" />
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Maximize"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Maximize'"
            (click)="toggleMaximize()"
          >
            <ng-icon name="lucideSquare" class="wc-icon" />
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="text-muted-foreground hover:text-foreground"
            aria-label="Close"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Close'"
            (click)="close()"
          >
            <ng-icon name="lucideX" class="wc-icon" />
          </button>
        </span>
      }
    </div>
  `,
  styles: `
    .wc-icon {
      --ng-icon__size: 14px;
    }
  `,
})
export class RightHeaderComponent {
  protected readonly isMacOS = inject(OsService).isMac();
  protected minimize = (): Promise<void> => getCurrentWindow().minimize();
  protected toggleMaximize = (): Promise<void> =>
    getCurrentWindow().toggleMaximize();
  protected close = (): Promise<void> => getCurrentWindow().close();
}
