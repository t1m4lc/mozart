import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSidebarImports } from '@spartan-ui/sidebar';
import { OsService } from '@mozart/shared-util-os';
import { ReturnRouteService } from '@mozart/desktop-ui-state-data-access';
import { MacWindowControls, NonMacWindowControls } from '@mozart/desktop-core-ui';
import { SHELL_LEFT_PANEL_WIDTH } from './shell-panel.constants';

@Component({
  selector: 'app-settings-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    NgIcon,
    HlmIconImports,
    HlmSidebarImports,
    MacWindowControls,
    NonMacWindowControls,
  ],
  providers: [provideIcons({ lucideArrowLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-screen bg-background text-foreground' },
  template: `
    <div hlmSidebarWrapper class="h-full">
      <hlm-sidebar
        collapsible="none"
        class="shrink-0 border-r border-sidebar-border"
        [style.width]="leftPanelWidth"
      >
        <!-- macOS traffic lights pin to the left sidebar top, above
             "Back to app". Non-mac chrome lives in the content header
             instead (top-right of the settings pane). -->
        @if (isMac) {
          <div
            data-tauri-drag-region
            class="flex h-9 shrink-0 items-center px-2"
          >
            <app-mac-window-controls />
          </div>
        }
        <div hlmSidebarHeader class="gap-2">
          <button
            type="button"
            hlmSidebarMenuButton
            (click)="onBack()"
            class="text-muted-foreground hover:text-foreground"
          >
            <ng-icon hlm name="lucideArrowLeft" size="sm" />
            <span>Back to app</span>
          </button>
        </div>
        <div hlmSidebarContent>
          <div hlmSidebarGroup class="px-2 py-1">
            <div hlmSidebarGroupContent>
              <ul hlmSidebarMenu>
                <li hlmSidebarMenuItem>
                  <a
                    hlmSidebarMenuButton
                    routerLink="/settings"
                    routerLinkActive="bg-brand/10 text-foreground [&_ng-icon]:text-brand!"
                    [routerLinkActiveOptions]="{ exact: true }"
                    class="cursor-pointer rounded-sm gap-1.5 pl-1.5 pr-2"
                  >
                    <span>General</span>
                  </a>
                </li>
                <li hlmSidebarMenuItem>
                  <a
                    hlmSidebarMenuButton
                    routerLink="/settings/projects"
                    routerLinkActive="bg-brand/10 text-foreground [&_ng-icon]:text-brand!"
                    class="cursor-pointer rounded-sm gap-1.5 pl-1.5 pr-2"
                  >
                    <span>Projects</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </hlm-sidebar>
      <main hlmSidebarInset class="flex-1 min-w-0 overflow-auto relative">
        @if (!isMac) {
          <div
            data-tauri-drag-region
            class="absolute right-2 top-2 z-10 flex items-center"
          >
            <app-non-mac-window-controls />
          </div>
        }
        <router-outlet />
      </main>
    </div>
  `,
})
export class SettingsShell {
  protected readonly isMac = inject(OsService).isMac();
  private readonly router = inject(Router);
  private readonly returnRoute = inject(ReturnRouteService);

  protected readonly leftPanelWidth = SHELL_LEFT_PANEL_WIDTH;

  protected onBack(): void {
    void this.router.navigateByUrl(this.returnRoute.previous());
  }
}
