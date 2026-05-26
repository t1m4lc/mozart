import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideFolderCog,
  lucidePlus,
} from '@ng-icons/lucide';
import type { Project } from '@mozart/desktop-projects-util';

@Component({
  selector: 'app-project-row',
  imports: [NgIcon, HlmButtonImports, HlmIconImports, HlmTooltipImports],
  providers: [
    provideIcons({ lucideChevronRight, lucideFolderCog, lucidePlus }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block group/trig relative h-8 flex' },
  template: `
    <button
      type="button"
      tabindex="-1"
      [attr.aria-current]="active() ? 'true' : null"
      (mouseenter)="hoverChange.emit(true)"
      (mouseleave)="hoverChange.emit(false)"
      (click)="toggleExpanded.emit()"
      class="flex h-full w-full items-center gap-1.5 rounded-md pl-0 pr-12 text-sm outline-none
             hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
             aria-[current=true]:text-brand
             aria-[current=true]:[--ng-icon__stroke-width:1.75]"
    >
      @if (hovered()) {
        <span class="flex size-5 shrink-0 items-center justify-center">
          <ng-icon
            hlm
            name="lucideChevronRight"
            size="sm"
            class="text-muted-foreground transition-transform duration-200"
            [class.rotate-90]="expanded()"
          />
        </span>
      } @else if (project().icon) {
        <span
          class="flex size-5 shrink-0 items-center justify-center text-sm leading-none"
        >
          {{ project().icon }}
        </span>
      } @else {
        <div
          class="flex size-5 shrink-0 items-center justify-center rounded-sm
                 bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
        >
          {{ initial() }}
        </div>
      }

      <span class="flex flex-1 min-w-0 items-baseline gap-1.5">
        <span class="truncate text-left">{{ project().name }}</span>
        @if (!expanded()) {
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {{ workspaceCount() }}
          </span>
        }
      </span>
    </button>

    <!-- Project settings button is hidden until the settings surface
         ships. Restore by uncommenting this block. -->
    <!-- <button
      type="button"
      hlmTooltip="Project settings"
      position="top"
      aria-label="Project settings"
      tabindex="-1"
      (click)="settings.emit(); $event.stopPropagation()"
      class="absolute top-1.5 right-6.5 flex size-5 items-center justify-center rounded-md p-0
             text-muted-foreground opacity-0 outline-none
             hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
             group-hover/trig:opacity-100"
    >
      <ng-icon hlm name="lucideFolderCog" size="xs" />
    </button> -->

    <button
      type="button"
      hlmTooltip="New workspace"
      position="top"
      aria-label="New workspace"
      tabindex="-1"
      (click)="newWorkspace.emit(); $event.stopPropagation()"
      class="absolute top-1.5 right-1 flex size-5 items-center justify-center rounded-md p-0
             text-muted-foreground outline-none
             hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <ng-icon hlm name="lucidePlus" size="xs" />
    </button>
  `,
})
export class ProjectRow {
  readonly project = input.required<Project>();
  readonly workspaceCount = input<number>(0);
  readonly hovered = input<boolean>(false);
  readonly expanded = input<boolean>(false);
  /** True when this project owns the currently-active workspace.
   *  Drives the brand-tinted aria-current styling. */
  readonly active = input<boolean>(false);

  readonly toggleExpanded = output<void>();
  readonly hoverChange = output<boolean>();
  readonly newWorkspace = output<void>();
  readonly settings = output<void>();

  protected readonly initial = computed(() => {
    const name = this.project().name;
    return (name.split(/[_\-\s]/)[0]?.[0] ?? name[0] ?? '?').toUpperCase();
  });
}
