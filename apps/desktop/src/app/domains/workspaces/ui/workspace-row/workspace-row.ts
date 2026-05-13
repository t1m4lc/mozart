import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideGitBranch,
  lucideLoader,
  lucidePin,
} from '@ng-icons/lucide';
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
  providers: [
    provideIcons({ lucideArchive, lucideGitBranch, lucideLoader, lucidePin }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block relative group/ws-item' },
  template: `
    @if (workspace().pending) {
      <div
        hlmSidebarMenuButton
        aria-busy="true"
        aria-disabled="true"
        class="relative cursor-default gap-1.5 rounded-sm px-2 text-muted-foreground"
      >
        <ng-icon
          hlm
          name="lucideLoader"
          size="xs"
          class="animate-spin text-muted-foreground"
        />
        <span class="animate-pulse">{{ workspace().name }}</span>
      </div>
    } @else if (editing()) {
      <div class="relative flex h-8 items-center gap-1.5 rounded-md px-2">
        <ng-icon
          hlm
          name="lucideGitBranch"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />
        @if (workspace().pinned) {
          <ng-icon
            hlm
            name="lucidePin"
            size="10px"
            class="shrink-0 text-brand"
          />
        }
        <input
          #renameInput
          type="text"
          [value]="workspace().name"
          class="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-sm font-normal leading-none text-foreground outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30"
          (click)="$event.stopPropagation()"
          (keydown.enter)="commitRename($any($event.target).value)"
          (keydown.escape)="cancelRename()"
          (blur)="commitRename($any($event.target).value)"
        />
      </div>
    } @else {
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
        @if (workspace().pinned) {
          <ng-icon hlm name="lucidePin" size="10px" class="text-brand" />
        }
        <span>{{ workspace().name }}</span>
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
                size="xs"
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
    }
  `,
})
export class WorkspaceRow {
  readonly workspace = input.required<Workspace>();
  readonly editing = input<boolean>(false);
  readonly archive = output<void>();
  readonly renameCommit = output<string>();
  readonly renameCancel = output<void>();

  private readonly renameInput =
    viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    effect(() => {
      if (this.editing()) {
        queueMicrotask(() => {
          const el = this.renameInput()?.nativeElement;
          if (el) {
            el.focus();
            el.select();
          }
        });
      }
    });
  }

  protected commitRename(value: string): void {
    if (!this.editing()) return;
    const next = value.trim();
    if (next && next !== this.workspace().name) {
      this.renameCommit.emit(next);
    } else {
      this.renameCancel.emit();
    }
  }

  protected cancelRename(): void {
    this.renameCancel.emit();
  }
}
