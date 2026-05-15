import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  GET_STARTED_PROJECT_ADAPTER,
  type GetStartedResult,
} from '../domains/onboarding/data/get-started-project.adapter';
import { ProjectsFacade } from '../domains/projects';
import { WorkspacesFacade } from '../domains/workspaces';

// Phase 6 / Atom 6 — `/tour` route. Materializes the bundled
// "Get started" project on mount, then mounts the highlight overlay
// (wired in Atom 7) against the freshly-created workspace. For now
// the page renders a status card while the bootstrap runs ; the
// overlay slot is left empty until Atom 7 lands the tour content.
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
      @case ('ready') {
        <div class="space-y-4 text-center">
          <h1 class="text-2xl font-semibold">You're all set 🎉</h1>
          <p class="text-sm text-muted-foreground">
            The Get started project is ready under
            <code class="font-mono">~/Mozart/get-started/</code>.
          </p>
          <button hlmBtn type="button" (click)="onContinue()">
            Open it
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

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<string>('');
  private readonly _result = signal<GetStartedResult | null>(null);
  protected readonly result = computed(() => this._result());

  constructor() {
    void this.bootstrap();
  }

  protected onSkip(): void {
    void this.router.navigate(['/']);
  }

  protected onContinue(): void {
    const r = this._result();
    if (!r) {
      void this.router.navigate(['/']);
      return;
    }
    void this.router.navigate(['/workspaces', r.workspace.id]);
  }

  private async bootstrap(): Promise<void> {
    try {
      const result = await this.adapter.ensure();
      // Refresh facades so the new project + workspace show in the
      // sidebar when the user lands on /workspaces/:id.
      await this.projects.loadAll();
      await this.workspaces.loadAll();
      this._result.set(result);
      this.state.set('ready');
    } catch (err) {
      console.error('[tour] bootstrap failed:', err);
      this.error.set(err instanceof Error ? err.message : String(err));
      this.state.set('failed');
    }
  }
}
