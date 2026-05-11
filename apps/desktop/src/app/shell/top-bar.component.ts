/**
 * `TopBarComponent` — 32 px tall application chrome strip and custom titlebar.
 *
 * Two visual variants, selected at construction time:
 *
 * - **macOS variant** (traffic lights on the LEFT):
 *   three 12×12 px round buttons in macOS order (close = red, minimize = yellow,
 *   maximize = green), followed by the brand mark "◆ Mozart". Glyphs (× / − / +)
 *   are hidden by default and revealed when the controls cluster is hovered.
 *
 * - **Other variant** (Linux / Windows — controls on the RIGHT):
 *   brand mark on the left, three `hlmBtn ghost icon-xs` buttons on the right
 *   with ASCII glyphs (─ □ ✕).
 *
 * All three buttons call `getCurrentWindow().minimize() / .toggleMaximize() / .close()`.
 *
 * The whole `.bar` is a Tauri drag region (via `data-tauri-drag-region`);
 * each control button opts out with `data-tauri-drag-region="false"` so it
 * remains clickable.
 *
 * ## Variant override (for dev / QA testing on a non-target OS)
 *
 * The effective OS is resolved once at construction by {@link resolveEffectiveOS}
 * using the following precedence (highest first):
 *
 * 1. **URL hash query** — append `#os=macos` or `#os=other` (or `?os=macos`
 *    within the hash, since the app uses hash routing). Example:
 *    `http://localhost:1420/#os=macos`.
 * 2. **localStorage** — `localStorage.setItem('mozart.platform.override', 'macos')`
 *    (persistent across reloads; clear with `removeItem`).
 * 3. **userAgent sniff** — falls back to detecting `Mac|iPhone|iPad|iPod` in
 *    `navigator.userAgent`.
 *
 * No state, no DI; pure presentational landmark (`role="banner"`).
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

function resolveEffectiveOS(): 'macos' | 'other' {
  // URL hash query override (highest precedence for dev/QA on any OS):
  //   open the app with #os=macos or #os=other in the URL (the app uses hash routing)
  const hashMatch = window.location.hash.match(/[?&#]os=(macos|other)\b/);
  if (hashMatch) return hashMatch[1] as 'macos' | 'other';

  // localStorage override (persistent across reloads; set from DevTools):
  //   localStorage.setItem('mozart.platform.override', 'macos')
  const ls = window.localStorage.getItem('mozart.platform.override');
  if (ls === 'macos' || ls === 'other') return ls;

  // Fallback: userAgent sniff
  return /Mac|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ? 'macos' : 'other';
}

@Component({
  selector: 'app-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tauri-drag-region': '' },
  imports: [],
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
        <span class="brand brand-mac" aria-label="Mozart" data-tauri-drag-region>
          <span class="diamond" aria-hidden="true" data-tauri-drag-region>&#9670;</span>
          <span class="name" data-tauri-drag-region>Mozart</span>
        </span>
        <span class="spacer" data-tauri-drag-region></span>
      } @else {
        <span class="brand" aria-label="Mozart" data-tauri-drag-region>
          <span class="diamond" aria-hidden="true" data-tauri-drag-region>&#9670;</span>
          <span class="name" data-tauri-drag-region>Mozart</span>
        </span>
        <span class="spacer" data-tauri-drag-region></span>
        <span class="window-controls" data-tauri-drag-region="false">
          <button
            type="button"
            class="wc-btn wc-min"
            aria-label="Minimize"
            data-tauri-drag-region="false"
            (click)="minimize()"
          ></button>
          <button
            type="button"
            class="wc-btn wc-max"
            aria-label="Maximize"
            data-tauri-drag-region="false"
            (click)="toggleMaximize()"
          ></button>
          <button
            type="button"
            class="wc-btn wc-close"
            aria-label="Close"
            data-tauri-drag-region="false"
            (click)="close()"
          ></button>
        </span>
      }
    </header>
  `,
  styles: `
    :host { display: block; }
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
    .bar button { cursor: pointer; }
    .brand { display: inline-flex; align-items: center; gap: 6px; }
    .brand-mac { margin-left: 12px; }
    .diamond { color: hsl(var(--foreground)); font-size: 14px; line-height: 1; }
    .name { font-size: 13px; font-weight: 600; }
    .spacer { flex: 1 1 auto; }

    /* Linux/Windows window controls — VS Code / Chrome inspired:
       transparent default, round background on hover. Minimize glyph
       sits low on the button (matching Win10/11 + VSCode), maximize is a
       small square outline, close shows × and turns red on hover. */
    .window-controls { display: inline-flex; align-items: center; gap: 2px; }
    .wc-btn {
      width: 28px;
      height: 24px;
      border: 0;
      background: transparent;
      padding: 0;
      margin: 0;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: hsl(var(--foreground));
      transition: background 120ms ease;
    }
    .wc-btn:hover {
      background: hsl(var(--muted) / 0.6);
      border-radius: 9999px;
    }
    .wc-close:hover {
      background: var(--status-error, #ef4444);
      color: #ffffff;
    }
    /* Minimize: 10px-wide line sitting near the bottom of the button. */
    .wc-min::before {
      content: '';
      width: 10px;
      height: 1.5px;
      background: currentColor;
      position: absolute;
      bottom: 7px;
      left: 50%;
      transform: translateX(-50%);
    }
    /* Maximize: 9px square outline, centered. */
    .wc-max::before {
      content: '';
      width: 9px;
      height: 9px;
      border: 1.5px solid currentColor;
      box-sizing: border-box;
    }
    /* Close: × glyph centered. */
    .wc-close::before {
      content: '\\00d7';
      font-size: 14px;
      line-height: 1;
      font-weight: 600;
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
    .mac-close { background: #ff5f57; }
    .mac-minimize { background: #febc2e; }
    .mac-maximize { background: #28c840; }
    .mac-btn::before {
      content: '';
      color: #2a2a2d;
      visibility: hidden;
      line-height: 1;
      font-size: 9px;
      font-weight: 700;
    }
    .mac-close::before { content: '\\00d7'; font-size: 11px; }
    .mac-minimize::before { content: '\\2212'; }
    .mac-maximize::before { content: '+'; font-size: 11px; }
    .window-controls-mac:hover .mac-btn::before { visibility: visible; }
  `,
})
export class TopBarComponent {
  protected readonly isMacOS = resolveEffectiveOS() === 'macos';
  protected minimize = (): Promise<void> => getCurrentWindow().minimize();
  protected toggleMaximize = (): Promise<void> => getCurrentWindow().toggleMaximize();
  protected close = (): Promise<void> => getCurrentWindow().close();
}
