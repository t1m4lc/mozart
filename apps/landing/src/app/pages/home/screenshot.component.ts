import { ChangeDetectionStrategy, Component } from '@angular/core';

// Source: libs/mozart-assets/src/landing/screenshots/...
// Exposed at /assets/* by the mozartAssetsPlugin in apps/landing/vite.config.ts.
const SCREENSHOT_SRC =
  '/assets/landing/screenshots/mozart-desktop-screenshot-v0.0.1-beta.1.png';

// Intrinsic dimensions of the PNG (2880×1800 = 16:10). Setting width/height
// lets the browser reserve the box before the image decodes — no layout
// shift below the fold while the hero is still painting.
const SCREENSHOT_WIDTH = 2880;
const SCREENSHOT_HEIGHT = 1800;

@Component({
  selector: 'app-screenshot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto mt-16 mb-24 max-w-7xl px-4 sm:px-8">
      <figure
        class="border-border bg-card relative overflow-hidden rounded-2xl border shadow-2xl"
      >
        <img
          [src]="src"
          [width]="width"
          [height]="height"
          alt="Mozart desktop — parallel Workspaces, agent timeline, and diff review running side by side. (screenshot v0.0.1-beta.1)"
          loading="lazy"
          decoding="async"
          class="block h-auto w-full"
        />
      </figure>
      <figcaption
        class="sr-only text-muted-foreground/20 mt-3 text-center font-mono text-xs tracking-wider"
      >
        mozart-desktop &middot; v0.0.1-beta.1
      </figcaption>
    </div>
  `,
})
export class ScreenshotComponent {
  protected readonly src = SCREENSHOT_SRC;
  protected readonly width = SCREENSHOT_WIDTH;
  protected readonly height = SCREENSHOT_HEIGHT;
}
