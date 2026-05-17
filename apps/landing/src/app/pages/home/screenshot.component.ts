import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-screenshot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto mt-16 mb-24 max-w-7xl px-4 sm:px-8">
      <div
        class="border-border bg-card flex aspect-video items-center justify-center overflow-hidden rounded-2xl border shadow-2xl"
      >
        <span class="text-muted-foreground font-mono text-sm">
          <!-- TODO -->
          [ Mozart desktop — screenshot placeholder ]
        </span>
      </div>
    </div>
  `,
})
export class ScreenshotComponent {}
