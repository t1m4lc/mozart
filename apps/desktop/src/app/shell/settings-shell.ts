import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { OsService } from '@mozart/shared-util-os';
import { ReturnRouteService } from '../core/return-route.service';
import { MacWindowControls } from '../core/window-controls/mac-window-controls';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';

@Component({
  selector: 'app-settings-shell',
  imports: [
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
      <hlm-sidebar collapsible="none" class="w-64 shrink-0 border-r border-sidebar-border">
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
          <ul hlmSidebarMenu>
            <li hlmSidebarMenuItem class="relative">
              <button
                type="button"
                hlmSidebarMenuButton
                (click)="navigateTo('/settings')"
                [attr.data-active]="generalActive() || null"
                [class.text-foreground]="generalActive()"
                class="relative"
              >
                <span>General</span>
              </button>
              @if (generalActive()) {
                <span
                  aria-hidden="true"
                  class="pointer-events-none absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-brand shadow-[0_0_10px_hsl(var(--brand)/0.7)]"
                ></span>
              }
            </li>
          </ul>
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

  // Track Settings sub-route via Router.events rather than the
  // routerLinkActive directive — the directive requires a paired
  // routerLink on the same element, and we use programmatic navigation
  // (so Back-to-app can return to the prior in-app route).
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly generalActive = computed(
    () => this.currentUrl() === '/settings',
  );

  protected onBack(): void {
    void this.router.navigateByUrl(this.returnRoute.previous());
  }

  protected navigateTo(url: string): void {
    void this.router.navigateByUrl(url);
  }
}
