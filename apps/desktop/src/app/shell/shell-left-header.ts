import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { OsService } from '../core/os.service';
import { ShellLayoutService } from '../core/shell-layout.service';
import { MacWindowControls } from './mac-window-controls';

@Component({
  selector: 'app-shell-left-header',
  imports: [NgIcon, MacWindowControls, HlmButtonImports, HlmTooltipImports],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (!isMac) {
      <app-mac-window-controls />
    }
    <button
      hlmBtn
      variant="ghost"
      size="icon-xs"
      type="button"
      hlmTooltip="Toggle left sidebar"
      position="bottom"
      class="size-6 text-muted-foreground"
      data-tauri-drag-region="false"
      (click)="layout.toggleLeftPanel()"
    >
      <ng-icon hlm name="lucidePanelLeft" size="sm" />
    </button>
  `,
})
export class ShellLeftHeader {
  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(ShellLayoutService);
}
