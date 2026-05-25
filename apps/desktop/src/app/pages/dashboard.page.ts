import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonMacWindowControls } from '@mozart/desktop-core-ui';
import { AddProjectFlow } from '@mozart/desktop-shell-feature';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderOpen,
  lucideGithub,
  lucidePanelLeft,
  lucideZap,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmCardImports } from '@spartan-ui/card';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';

// Phase 1 dashboard. Renders when no workspace is selected (`/`).
// Welcome hero above a 3-card grid : Open project / Open GitHub
// project / Quick start. Quick start is gated behind a "Coming soon"
// badge for v0.1.0-beta.1 (IMP-006) — the underlying dialog flow is still
// reachable from sidebar entry points until that path is also gated.
@Component({
  selector: 'app-dashboard-page',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmCardImports,
    HlmIconImports,
    HlmTooltipImports,
    NonMacWindowControls,
  ],
  providers: [
    provideIcons({
      lucideFolderOpen,
      lucideGithub,
      lucidePanelLeft,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex h-full items-center justify-center p-8' },
  template: `
    <app-non-mac-window-controls class="absolute right-3 top-2.5" />

    @if (!layout.leftPanelOpen()) {
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        hlmTooltip="Toggle left sidebar"
        position="bottom"
        class="absolute left-2 top-2 size-7 rounded-md text-muted-foreground"
        (click)="layout.toggleLeftPanel(); $any($event.currentTarget).blur()"
      >
        <ng-icon hlm name="lucidePanelLeft" size="xs" />
      </button>
    }

    <div class="flex w-full max-w-4xl flex-col gap-6">
      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <button
          type="button"
          hlmCard
          class="cursor-pointer p-6 text-left transition hover:bg-accent"
          (click)="onOpenProject()"
        >
          <div
            class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted"
          >
            <ng-icon hlm name="lucideFolderOpen" size="base" />
          </div>
          <h2 class="text-base font-medium">Open project</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Add an existing folder as a Mozart project.
          </p>
        </button>

        <button
          type="button"
          hlmCard
          class="cursor-pointer p-6 text-left transition hover:bg-accent"
          (click)="onOpenGithubProject()"
        >
          <div
            class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted"
          >
            <ng-icon hlm name="lucideGithub" size="base" />
          </div>
          <h2 class="text-base font-medium">Open GitHub project</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Clone a repo from GitHub and start working.
          </p>
        </button>

        <div hlmCard class="relative p-6 opacity-60" aria-disabled="true">
          <span
            class="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Coming soon
          </span>
          <div
            class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted"
          >
            <ng-icon hlm name="lucideZap" size="base" />
          </div>
          <h2 class="text-base font-medium">Quick start</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Use a project template to get started faster.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class DashboardPage {
  private readonly addProjectFlow = inject(AddProjectFlow);
  protected readonly layout = inject(LayoutService);

  // No imperative "clear active workspace" needed — `RouterFacade`
  // derives `activeWorkspaceId` from the URL, which is `/` while this
  // page is mounted, so it's already null.

  protected async onOpenProject(): Promise<void> {
    try {
      await this.addProjectFlow.openPickerAndOpen();
    } catch (err) {
      console.error('add project flow failed', err);
    }
  }

  protected async onOpenGithubProject(): Promise<void> {
    try {
      await this.addProjectFlow.openCloneDialog();
    } catch (err) {
      console.error('clone repo flow failed', err);
    }
  }
}
