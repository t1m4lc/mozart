import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';
import { GET_STARTED_PROJECT_ADAPTER } from './get-started-project.adapter';
import { ONBOARDING_ADAPTER } from './onboarding.adapter';
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  type StepStatus,
} from '@mozart/desktop-onboarding-util';

// Public API of the `onboarding` domain. Features inject this — never
// the adapter directly. Shape :
//
//   - `isCompleted` — the local mirror of `db/config.onboarding_completed`,
//     hydrated on `bootstrap()` and the source of truth for the route
//     guard. The JWT claim only seeds the initial routing decision
//     (Atom 0) ; once the wizard runs once, the local mirror takes over.
//   - `currentStep` — wizard cursor, mutated by step components calling
//     `advance()` / `back()`.
//   - `stepStatus()` — per-step completion. Steps 2-4 fill these in via
//     `markStep()` from their feature components.
//   - `complete()` — final action of step 4 ; writes the flag, then
//     navigates to `/tour`.
@Injectable({ providedIn: 'root' })
export class OnboardingFacade {
  private readonly adapter = inject(ONBOARDING_ADAPTER);
  private readonly getStartedAdapter = inject(GET_STARTED_PROJECT_ADAPTER);
  private readonly projects = inject(ProjectsFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly router = inject(Router);

  private readonly _isCompleted = signal<boolean>(false);
  private readonly _hydrated = signal<boolean>(false);
  readonly isCompleted = computed(() => this._isCompleted());
  readonly hydrated = computed(() => this._hydrated());

  private readonly _currentStep = signal<OnboardingStep>('welcome');
  readonly currentStep = computed(() => this._currentStep());

  private readonly _statuses = signal<Record<OnboardingStep, StepStatus>>({
    welcome: 'ready',
    git: 'pending',
    provider: 'pending',
    github: 'pending',
  });
  readonly statuses = computed(() => this._statuses());
  readonly stepIndex = computed(
    () => ONBOARDING_STEPS.indexOf(this._currentStep()) + 1,
  );
  readonly totalSteps = ONBOARDING_STEPS.length;

  /** Idempotent boot hydrate — reads the local mirror. Called from
   *  `provideAppInitializer`. After this resolves, `isCompleted()` is
   *  authoritative and the route guard can read it synchronously. */
  async bootstrap(): Promise<void> {
    if (this._hydrated()) return;
    try {
      const value = await this.adapter.get();
      this._isCompleted.set(value);
    } catch (err) {
      console.warn('[onboarding] bootstrap failed:', err);
      this._isCompleted.set(false);
    } finally {
      this._hydrated.set(true);
    }
  }

  /** Advance the cursor to the next step. No-op past the last step —
   *  finalization goes through `complete()`. */
  advance(): void {
    const idx = ONBOARDING_STEPS.indexOf(this._currentStep());
    const next = ONBOARDING_STEPS[idx + 1];
    if (next) this._currentStep.set(next);
  }

  /** Step back. No-op from `welcome`. */
  back(): void {
    const idx = ONBOARDING_STEPS.indexOf(this._currentStep());
    const prev = ONBOARDING_STEPS[idx - 1];
    if (prev) this._currentStep.set(prev);
  }

  /** Direct cursor jump — used by tests and the progress pill if it
   *  becomes clickable. */
  goTo(step: OnboardingStep): void {
    this._currentStep.set(step);
  }

  /** Marks a step's status. Step components call this to drive the
   *  progress pill and the Continue-button enable state. */
  markStep(step: OnboardingStep, status: StepStatus): void {
    this._statuses.update((s) => ({ ...s, [step]: status }));
  }

  /** Persist the completion flag + drop the user into the bundled
   *  "Get started" workspace. Called from the GitHub step's Finish /
   *  Skip-and-finish button.
   *
   *  We do **not** auto-launch the tour : the user typically wants to
   *  look around before being walked through it. The README rendered
   *  in the workspace + the Settings → "Replay tour" button are the
   *  two entry points to start it on demand.
   */
  async complete(): Promise<void> {
    try {
      await this.adapter.set(true);
      this._isCompleted.set(true);
    } catch (err) {
      console.error('[onboarding] complete failed:', err);
      // Soft-fail : continue to the workspace either way. The local
      // mirror will be retried on next bootstrap.
    }

    try {
      const result = await this.getStartedAdapter.ensure();
      await this.projects.loadAll();
      await this.workspaces.loadAll();
      this.workspaces.setActive(result.workspace.id);
      void this.router.navigate(
        workspaceRouteCommands(result.workspace.projectId, result.workspace.id),
      );
    } catch (err) {
      console.error('[onboarding] get-started bootstrap failed:', err);
      // Fall back to the dashboard rather than getting stuck —
      // the user can still add their own project from there.
      void this.router.navigate(['/']);
    }
  }

  /** Used by settings' "Revisit tour" to reset the flag and re-arm the
   *  wizard. Atom 8. */
  async reset(): Promise<void> {
    await this.adapter.set(false);
    this._isCompleted.set(false);
    this._currentStep.set('welcome');
    this._statuses.set({
      welcome: 'ready',
      git: 'pending',
      provider: 'pending',
      github: 'pending',
    });
  }
}
