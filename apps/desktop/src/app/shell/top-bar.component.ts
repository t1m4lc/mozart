import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucideSquare, lucideX } from '@ng-icons/lucide';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { OsService } from '../services/os.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tauri-drag-region': '' },
  imports: [NgIcon],
  providers: [provideIcons({ lucideMinus, lucideSquare, lucideX })],
  template: `
    <header role="banner" class="bar" data-tauri-drag-region>
      @if (isMacOS) {
        <span class="window-controls-mac" data-tauri-drag-region="false">
          <button
            type="button"
            class="mac-btn mac-close"
            aria-label="Close"
            data-tauri-drag-region="false"
            (click)="close()"
          ></button>
          <button
            type="button"
            class="mac-btn mac-minimize"
            aria-label="Minimize"
            data-tauri-drag-region="false"
            (click)="minimize()"
          ></button>
          <button
            type="button"
            class="mac-btn mac-maximize"
            aria-label="Maximize"
            data-tauri-drag-region="false"
            (click)="toggleMaximize()"
          ></button>
        </span>
        <span
          class="brand brand-mac"
          aria-label="Mozart"
          data-tauri-drag-region
        >
          <span class="diamond" aria-hidden="true" data-tauri-drag-region
            >&#9670;</span
          >
          <span class="name" data-tauri-drag-region>Mozart</span>
        </span>
        <span class="spacer" data-tauri-drag-region></span>
      } @else {
        <span class="brand" aria-label="Mozart" data-tauri-drag-region>
          <span class="diamond" aria-hidden="true" data-tauri-drag-region
            >&#9670;</span
          >
          <span class="name" data-tauri-drag-region>Mozart</span>
        </span>
        <span class="spacer" data-tauri-drag-region></span>
        <span class="window-controls" data-tauri-drag-region="false">
          <button
            type="button"
            class="wc-btn"
            aria-label="Minimize"
            data-tauri-drag-region="false"
            (click)="minimize()"
          >
            <ng-icon name="lucideMinus" class="wc-icon" />
          </button>
          <button
            type="button"
            class="wc-btn"
            aria-label="Maximize"
            data-tauri-drag-region="false"
            (click)="toggleMaximize()"
          >
            <ng-icon name="lucideSquare" class="wc-icon" />
          </button>
          <button
            type="button"
            class="wc-btn"
            aria-label="Close"
            data-tauri-drag-region="false"
            (click)="close()"
          >
            <ng-icon name="lucideX" class="wc-icon" />
          </button>
        </span>
      }
    </header>
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 12px;
      background: hsl(var(--card));
      border-bottom: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .bar button {
      cursor: pointer;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .brand-mac {
      margin-left: 12px;
    }
    .diamond {
      color: hsl(var(--foreground));
      font-size: 14px;
      line-height: 1;
    }
    .name {
      font-size: 13px;
      font-weight: 600;
    }
    .spacer {
      flex: 1 1 auto;
    }

    .window-controls {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .wc-btn {
      width: 28px;
      height: 24px;
      border: 0;
      background: transparent;
      padding: 0;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: hsl(var(--muted-foreground));
      transition:
        background 120ms ease,
        color 120ms ease;
      border-radius: 9999px;
    }
    .wc-btn:hover {
      background: hsl(var(--muted) / 0.6);
      color: hsl(var(--foreground));
    }
    .wc-icon {
      --ng-icon__size: 14px;
    }

    /* macOS traffic-light cluster */
    .window-controls-mac {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
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
      font-family: var(--font-sans);
    }
    .mac-close {
      background: #ff5f57;
    }
    .mac-minimize {
      background: #febc2e;
    }
    .mac-maximize {
      background: #28c840;
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
