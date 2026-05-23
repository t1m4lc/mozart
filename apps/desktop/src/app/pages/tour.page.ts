import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { GET_STARTED_PROJECT_ADAPTER } from '../domains/onboarding';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';

// `/tour` route. Bootstraps the bundled "Get started" project,
// then redirects to `/project/<projectId>/workspace/<workspaceId>?tour=on`. The
// AppShell sees the `?tour=on` query param and mounts
// `<app-feature-tour>` (the highlight overlay) on top of the live
// workspace UI.
@Component({
  selector: 'app-tour-page',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-screen w-screen items-center justify-center' },
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="space-y-2 text-center">
          <h1 class="text-2xl font-semibold">Preparing your tour…</h1>
          <p class="text-sm text-muted-foreground">
            Creating the Get started project.
          </p>
        </div>
      }
      @case ('failed') {
        <div class="space-y-4 text-center">
          <h1 class="text-xl font-semibold text-red-600">
            Couldn't prepare the tour
          </h1>
          <p class="max-w-md text-sm text-muted-foreground">
            {{ error() }}
          </p>
          <button hlmBtn type="button" (click)="onSkip()">
            Continue to Mozart
          </button>
        </div>
      }
    }
  `,
})
export class TourPage {
  private readonly router = inject(Router);
  private readonly adapter = inject(GET_STARTED_PROJECT_ADAPTER);
  private readonly projects = inject(ProjectsFacade);
  private readonly workspaces = inject(WorkspacesFacade);

  protected readonly state = signal<'loading' | 'failed'>('loading');
  protected readonly error = signal<string>('');

  constructor() {
    void this.bootstrap();
  }

  protected onSkip(): void {
    void this.router.navigate(['/']);
  }

  private async bootstrap(): Promise<void> {
    try {
      const result = await this.adapter.ensure();
      await this.projects.loadAll();
      await this.workspaces.loadAll();
      this.workspaces.setActive(result.workspace.id);
      // Redirect into the workspace with the tour query param ; the
      // AppShell mounts the overlay when it sees `?tour=on`.
      void this.router.navigate(
        workspaceRouteCommands(result.workspace.projectId, result.workspace.id),
        { queryParams: { tour: 'on' } },
      );
    } catch (err) {
      console.error('[tour] bootstrap failed:', err);
      this.error.set(err instanceof Error ? err.message : String(err));
      this.state.set('failed');
    }
  }
}
