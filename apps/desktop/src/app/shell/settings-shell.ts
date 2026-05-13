import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';

@Component({
  selector: 'app-settings-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    NgIcon,
    HlmIconImports,
    HlmSidebarImports,
  ],
  providers: [provideIcons({ lucideArrowLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-screen bg-background text-foreground' },
  template: `
    <div hlmSidebarWrapper class="h-full">
      <hlm-sidebar collapsible="none" class="w-64 shrink-0 border-r border-sidebar-border">
        <div hlmSidebarHeader class="gap-2">
          <a
            hlmSidebarMenuButton
            routerLink="/workspaces"
            class="text-muted-foreground hover:text-foreground"
          >
            <ng-icon hlm name="lucideArrowLeft" size="sm" />
            <span>Back to app</span>
          </a>
        </div>
        <div hlmSidebarContent>
          <ul hlmSidebarMenu>
            <li hlmSidebarMenuItem>
              <a
                hlmSidebarMenuButton
                routerLink="/settings"
                routerLinkActive
                [routerLinkActiveOptions]="{ exact: true }"
                #generalLink="routerLinkActive"
                [attr.data-active]="generalLink.isActive"
              >
                <span>General</span>
              </a>
            </li>
          </ul>
        </div>
      </hlm-sidebar>
      <main hlmSidebarInset class="flex-1 min-w-0 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class SettingsShell {}
