import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideFolderCog,
  lucidePlus,
} from '@ng-icons/lucide';
import type { Project } from '../../data/project.model';

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
      (mouseenter)="hoverChange.emit(true)"
      (mouseleave)="hoverChange.emit(false)"
      (click)="toggleExpanded.emit()"
      class="flex h-full w-full items-center gap-1.5 rounded-md pl-0 pr-12 text-sm outline-none
             hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
        <span class="truncate text-left">{{ project().title }}</span>
        @if (!expanded()) {
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {{ project().workspaces.length }}
          </span>
        }
      </span>
    </button>

    <button
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
    </button>

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
  readonly hovered = input<boolean>(false);
  readonly expanded = input<boolean>(false);

  readonly toggleExpanded = output<void>();
  readonly hoverChange = output<boolean>();
  readonly newWorkspace = output<void>();
  readonly settings = output<void>();

  protected readonly initial = computed(() => {
    const title = this.project().title;
    return (title.split(/[_\-\s]/)[0]?.[0] ?? title[0] ?? '?').toUpperCase();
  });
}
