import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
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
      [isActive]="active()"
      [routerLink]="['/workspaces', workspace().id]"
      class="cursor-pointer rounded-sm gap-1.5 px-2"
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
  readonly active = input<boolean>(false);
  readonly archive = output<void>();
}
