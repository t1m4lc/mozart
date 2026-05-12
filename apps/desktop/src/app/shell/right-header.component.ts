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
  host: { 'data-tauri-drag-region': '' },
  imports: [NgIcon, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucideMinus, lucideSquare, lucideX })],
  template: `
    <div
      class="right-segment"
      aria-label="Window controls"
      data-tauri-drag-region
    >
      <span class="spacer" data-tauri-drag-region></span>
      @if (!isMacOS) {
        <span class="window-controls" data-tauri-drag-region="false">
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="wc-btn"
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
            class="wc-btn"
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
            class="wc-btn"
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
    :host {
      display: block;
      height: 100%;
    }
    .right-segment {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 100%;
      padding: 0 12px;
      background: hsl(var(--card));
      border-bottom: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .spacer {
      flex: 1 1 auto;
    }
    .window-controls {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    /* hlmBtn variant="ghost" size="icon-xs" owns sizing + hover; we
       only tint icon color so the controls match the muted palette. */
    .wc-btn {
      color: hsl(var(--muted-foreground));
    }
    .wc-btn:hover {
      color: hsl(var(--foreground));
    }
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
