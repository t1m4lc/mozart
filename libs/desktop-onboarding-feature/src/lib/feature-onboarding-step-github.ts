import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideGitPullRequest,
  lucideGithub,
  lucideKey,
  lucideRefreshCw,
} from '@ng-icons/lucide';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';

// Step 4 of the onboarding wizard. Optional GitHub connection — reuses
// the existing Phase 4f PAT flow via `UiGithubConnectDialog`. The
// Finish button is always enabled : when the user hasn't connected
// GitHub, it implicitly marks the step as skipped before completing.
// `complete()` writes the local mirror flag, ensures the bundled
// Get-started workspace exists, and drops the user into it (no
// auto-tour — Settings → Replay tour is the explicit entry point).
@Component({
  selector: 'app-feature-onboarding-step-github',
  imports: [HlmButtonImports, HlmIconImports, NgIcon],
  providers: [
    provideIcons({
      lucideCheck,
      lucideGitPullRequest,
      lucideGithub,
      lucideKey,
      lucideRefreshCw,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6">
      <div class="mx-auto max-w-md space-y-2 text-center">
        <h2 class="text-xl font-semibold tracking-tight">Connect GitHub</h2>
        <p class="text-muted-foreground text-sm">
          Optional. You can connect later from Settings.
        </p>
      </div>

      <div class="flex flex-col items-center gap-3">
        @if (profile.githubConnected()) {
          <div
            class="border-brand/40 bg-brand-subtle flex items-center gap-2 rounded-md border px-4 py-3"
            role="status"
          >
            <span
              class="bg-brand inline-block size-2 shrink-0 rounded-full"
              aria-hidden="true"
            ></span>
            <ng-icon hlm name="lucideCheck" size="sm" class="text-brand" />
            <span class="text-sm">
              Connected as <strong>{{ profile.githubLogin() }}</strong>
            </span>
          </div>
        } @else {
          <button
            hlmBtn
            type="button"
            variant="secondary"
            class="w-full max-w-xs"
            (click)="onConnect()"
          >
            <ng-icon hlm name="lucideGithub" size="sm" />
            Connect Github
          </button>
        }
      </div>

      <ul
        class="mx-auto max-w-sm text-muted-foreground flex-col items-center justify-baseline gap-4 text-xs"
      >
        <li class="space-x-2">
          <ng-icon hlm name="lucideRefreshCw" size="xs" class="mt-1" />
          <span>Sync new projects directly to remote Git</span>
        </li>
        <li class="space-x-2">
          <ng-icon hlm name="lucideGitPullRequest" size="xs" class="mt-1" />
          <span>Push branches and open Pull Requests</span>
        </li>
        <li class="space-x-2">
          <ng-icon hlm name="lucideKey" size="xs" class="mt-1" />
          <span>Detect repository ownership for auto-naming</span>
        </li>
      </ul>

      <div class="flex items-center justify-between gap-3">
        <button hlmBtn variant="ghost" type="button" (click)="facade.back()">
          Back
        </button>
        <button hlmBtn type="button" (click)="onFinish()">
          {{ profile.githubConnected() ? 'Finish' : 'Skip and finish' }}
        </button>
      </div>
    </div>
  `,
})
export class FeatureOnboardingStepGithub {
  protected readonly facade = inject(OnboardingFacade);
  protected readonly profile = inject(ProfileFacade);
  private readonly dialog = inject(HlmDialogService);

  constructor() {
    void this.profile.initializeGithub();
    // Mirror `profile.githubConnected()` into the facade's step-status
    // map. Effect form is used because `markStep` is also called
    // imperatively from the Skip handler — see TODO.md (signals
    // cleanup) for the deferred facade refactor that would let this
    // become a reactive binding.
    effect(() => {
      this.facade.markStep(
        'github',
        this.profile.githubConnected() ? 'done' : 'pending',
      );
    });
  }

  @HostListener('document:keyup.enter')
  protected onEnterKey(): void {
    this.onFinish();
  }

  protected async onConnect(): Promise<void> {
    const { UiGithubConnectDialog } = await import(
      '@mozart/desktop-profile-feature'
    );
    this.dialog.open(UiGithubConnectDialog, {});
  }

  protected onFinish(): void {
    // If the user hasn't connected GitHub, record the step as skipped
    // before completing — Settings will then surface the same
    // "Connect GitHub" entry-point.
    if (!this.profile.githubConnected()) {
      this.facade.markStep('github', 'skipped');
    }
    this.facade.complete();
  }
}
