import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucideSquare, lucideX } from '@ng-icons/lucide';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Component({
  selector: 'app-non-mac-window-controls',
  imports: [NgIcon, HlmButtonImports, HlmIconImports],
  providers: [provideIcons({ lucideSquare, lucideMinus, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center' },
  template: `
    <!-- Windows / Linux: Chrome-style ghost buttons. -->
    <span
      class="inline-flex items-center gap-0.5"
      data-tauri-drag-region="false"
      aria-label="Window controls"
    >
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="text-muted-foreground hover:text-foreground rounded-full"
        aria-label="Minimize"
        data-tauri-drag-region="false"
        (click)="minimize()"
      >
        <ng-icon hlm name="lucideMinus" size="sm" class="translate-y-0.5" />
      </button>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="text-muted-foreground hover:text-foreground rounded-full"
        aria-label="Maximize"
        data-tauri-drag-region="false"
        (click)="toggleMaximize()"
      >
        <ng-icon hlm name="lucideSquare" size="sm" />
      </button>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="text-muted-foreground hover:text-foreground rounded-full"
        aria-label="Close"
        data-tauri-drag-region="false"
        (click)="close()"
      >
        <ng-icon hlm name="lucideX" size="sm" />
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
