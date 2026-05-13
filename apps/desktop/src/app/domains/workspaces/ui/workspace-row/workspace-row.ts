import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArchive, lucideGitBranch } from '@ng-icons/lucide';
import type { Workspace } from '../../data/workspace.model';

@Component({
  selector: 'app-workspace-row',
  imports: [
    NgIcon,
    RouterLink,
    RouterLinkActive,
    HlmButtonImports,
    HlmPopoverImports,
    HlmSidebarImports,
  ],
  providers: [provideIcons({ lucideArchive, lucideGitBranch })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block relative group/ws-item' },
  template: `
    <a
      hlmSidebarMenuButton
      [routerLink]="['/workspaces', workspace().id]"
      routerLinkActive="bg-brand/15 text-foreground
                        before:absolute before:left-0 before:top-0.5 before:bottom-0.5
                        before:w-1 before:rounded-r-full before:bg-brand
                        before:shadow-[0_0_10px_hsl(var(--brand)/0.7)]
                        [&_ng-icon]:text-brand!"
      class="relative cursor-pointer rounded-sm gap-1.5 px-2"
    >
      <ng-icon
        hlm
        name="lucideGitBranch"
        size="xs"
        class="text-muted-foreground"
      />
      <span>{{ workspace().title }}</span>
    </a>

    <div hlmPopover>
      <button
        hlmPopoverTrigger
        type="button"
        aria-label="Archive workspace"
        class="absolute right-1 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-md
               text-muted-foreground opacity-0 transition-opacity
               hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
               group-hover/ws-item:opacity-100"
      >
        <ng-icon hlm name="lucideArchive" size="xs" />
      </button>
      <ng-template hlmPopoverPortal>
        <div hlmPopoverContent class="w-40 p-2">
          <p class="text-xs text-muted-foreground/80">Archive workspace?</p>
          <div class="mt-1.5 flex justify-end">
            <button
              hlmBtn
              size="sm"
              variant="destructive"
              type="button"
              (click)="archive.emit()"
            >
              Archive
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class WorkspaceRow {
  readonly workspace = input.required<Workspace>();
  readonly archive = output<void>();
}
