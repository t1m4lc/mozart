import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
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
    <div class="inline-flex items-center" aria-label="Window controls">
      <button
        type="button"
        class="inline-flex size-7 rounded cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Minimize"
        (click)="minimize()"
      >
        <ng-icon hlm name="lucideMinus" size="xs" class="mt-1.5" />
      </button>
      <button
        type="button"
        class="inline-flex size-7 rounded cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Maximize"
        (click)="toggleMaximize()"
      >
        <ng-icon hlm name="lucideSquare" size="xs" />
      </button>
      <button
        type="button"
        class="inline-flex size-7 rounded cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Close"
        (click)="close()"
      >
        <ng-icon hlm name="lucideX" size="xs" />
      </button>
    </div>
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
