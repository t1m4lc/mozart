import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ONBOARDING_ADAPTER } from './onboarding.adapter';
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  type StepStatus,
} from './onboarding.model';

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

  /** Persist the completion flag + navigate to `/tour`. Called from the
   *  GitHub step's Continue button (Atom 4). */
  async complete(): Promise<void> {
    try {
      await this.adapter.set(true);
      this._isCompleted.set(true);
    } catch (err) {
      console.error('[onboarding] complete failed:', err);
      // Soft-fail : still let the user reach the tour. The local mirror
      // will be retried on next bootstrap.
    }
    void this.router.navigate(['/tour']);
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
