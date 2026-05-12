/**
 * `TopBarComponent` — LEFT segment of the 3-segment shell header.
 *
 * Per the S1.ui.2 shell re-architecture, the header is now split into
 * three column-aligned segments (sidebar / center / right-panel). This
 * component owns the LEFT segment only — sized to `var(--sidebar-width)`
 * so it sits directly above the sidebar's existing internal nav strip.
 *
 * Platform split:
 *   - macOS: traffic-light buttons (close / minimize / maximize) live
 *     here. Apple's standard system colors are intentional raw `#hex`
 *     values with no design-token equivalent — see the inline comment
 *     above the cluster for the rationale carried over from S1.ui.0.
 *   - Windows / Linux: this segment is empty + draggable. The window
 *     controls (minimize / maximize / close) live in
 *     `<app-right-header>` (the RIGHT segment).
 *
 * The brand wordmark + diamond glyph were dropped per the S1.ui.2
 * decision to remove the brand string from the rendered UI.
 *
 * Drag region: every non-interactive area carries
 * `data-tauri-drag-region`; every interactive control (the 3 mac
 * buttons) carries `data-tauri-drag-region="false"` so clicks reach the
 * handlers instead of starting a window drag.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { OsService } from '../services/os.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-tauri-drag-region': '',
    class: 'block h-full',
  },
  imports: [HlmTooltipImports],
  template: `
    <header
      role="banner"
      class="flex items-center gap-2 h-full px-3 bg-card border-b border-border text-foreground"
      aria-label="Window controls"
      data-tauri-drag-region
    >
      @if (isMacOS) {
        <!--
          The macOS traffic-light cluster is a platform widget — the
          12×12 colored circles are standard Apple system colors, not
          design tokens from this codebase. The hex literals below are intentional
          and have no theme-token equivalent; they remain raw <button>
          rather than hlmBtn because adopting Spartan would override the
          carefully-tuned circular look + the platform-recognized colors.
          A tooltip is still attached to each control for parity with
          the Windows controls in <app-right-header>.
        -->
        <span class="window-controls-mac inline-flex items-center gap-2" data-tauri-drag-region="false">
          <button
            type="button"
            class="mac-btn mac-close bg-[#ff5f57]"
            aria-label="Close"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Close'"
            (click)="close()"
          ></button>
          <button
            type="button"
            class="mac-btn mac-minimize bg-[#febc2e]"
            aria-label="Minimize"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Minimize'"
            (click)="minimize()"
          ></button>
          <button
            type="button"
            class="mac-btn mac-maximize bg-[#28c840]"
            aria-label="Maximize"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Maximize'"
            (click)="toggleMaximize()"
          ></button>
        </span>
      }
      <span class="flex-auto" data-tauri-drag-region></span>
    </header>
  `,
  styles: `
    .mac-btn {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
      color: transparent;
    }
    .mac-btn::before {
      content: '';
      color: #2a2a2d;
      visibility: hidden;
      line-height: 1;
      font-size: 9px;
      font-weight: 700;
    }
    .mac-close::before {
      content: '\\00d7';
      font-size: 11px;
    }
    .mac-minimize::before {
      content: '\\2212';
    }
    .mac-maximize::before {
      content: '+';
      font-size: 11px;
    }
    .window-controls-mac:hover .mac-btn::before {
      visibility: visible;
    }
  `,
})
export class TopBarComponent {
  protected readonly isMacOS = inject(OsService).isMac();
  protected minimize = (): Promise<void> => getCurrentWindow().minimize();
  protected toggleMaximize = (): Promise<void> =>
    getCurrentWindow().toggleMaximize();
  protected close = (): Promise<void> => getCurrentWindow().close();
}
