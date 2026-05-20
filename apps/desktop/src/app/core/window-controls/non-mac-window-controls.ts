import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucideSquare, lucideX } from '@ng-icons/lucide';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Component({
  selector: 'app-non-mac-window-controls',
  imports: [NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideSquare, lucideMinus, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  template: `
    <!-- Windows / Linux: VS Code-style compact controls. Smaller hit
         targets than Chrome, sharp (not rounded). All three buttons
         share the same neutral accent hover — the red close button
         read as too aggressive on a dark UI. -->
    <span
      class="inline-flex items-center"
      data-tauri-drag-region="false"
      aria-label="Window controls"
    >
      <button
        type="button"
        class="inline-flex h-7 w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Minimize"
        data-tauri-drag-region="false"
        (click)="minimize()"
      >
        <ng-icon hlm name="lucideMinus" size="xs" />
      </button>
      <button
        type="button"
        class="inline-flex h-7 w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Maximize"
        data-tauri-drag-region="false"
        (click)="toggleMaximize()"
      >
        <ng-icon hlm name="lucideSquare" size="xs" />
      </button>
      <button
        type="button"
        class="inline-flex h-7 w-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Close"
        data-tauri-drag-region="false"
        (click)="close()"
      >
        <ng-icon hlm name="lucideX" size="xs" />
      </button>
    </span>
  `,
})
export class NonMacWindowControls {
  protected minimize(): Promise<void> {
    return getCurrentWindow().minimize();
  }
  protected toggleMaximize(): Promise<void> {
    return getCurrentWindow().toggleMaximize();
  }
  protected close(): Promise<void> {
    return getCurrentWindow().close();
  }
}
