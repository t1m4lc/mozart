import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleSlash,
  lucideGitPullRequest,
  lucideGithub,
  lucideKey,
} from '@ng-icons/lucide';
import { ProfileFacade, UiGithubConnectDialog } from '../profile';
import { OnboardingFacade } from './data/onboarding.facade';

// Step 4 of the onboarding wizard. Optional GitHub connection — reuses
// the existing Phase 4f PAT flow via `UiGithubConnectDialog`. Skip is
// always available. The `complete()` path writes the local mirror flag
// + navigates to /tour.
@Component({
  selector: 'app-feature-onboarding-step-github',
  imports: [HlmButtonImports, HlmIconImports, NgIcon],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleSlash,
      lucideGitPullRequest,
      lucideGithub,
      lucideKey,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6">
      <div class="space-y-1 text-center">
        <h2 class="text-xl font-semibold">Connect GitHub</h2>
        <p class="text-sm text-muted-foreground">
          Optional — you can do this later from Settings.
        </p>
      </div>

      <ul class="space-y-2 text-sm">
        <li class="flex items-start gap-2">
          <ng-icon
            hlm
            name="lucideGithub"
            size="sm"
            class="mt-0.5 text-muted-foreground"
          />
          <span>Create private repositories for new projects</span>
        </li>
        <li class="flex items-start gap-2">
          <ng-icon
            hlm
            name="lucideGitPullRequest"
            size="sm"
            class="mt-0.5 text-muted-foreground"
          />
          <span>Push branches and open Pull Requests</span>
        </li>
        <li class="flex items-start gap-2">
          <ng-icon
            hlm
            name="lucideKey"
            size="sm"
            class="mt-0.5 text-muted-foreground"
          />
          <span>Detect repository ownership for auto-naming</span>
        </li>
      </ul>

      @if (profile.githubConnected()) {
        <div
          class="flex items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
        >
          <ng-icon hlm name="lucideCheck" size="sm" class="text-emerald-600" />
          <span class="text-sm">
            Connected as <strong>{{ profile.githubLogin() }}</strong>
          </span>
        </div>
      } @else if (skipped()) {
        <div
          class="flex items-center justify-center gap-2 rounded-md border border-muted bg-muted/40 px-4 py-3"
        >
          <ng-icon hlm name="lucideCircleSlash" size="sm" class="text-muted-foreground" />
          <span class="text-sm text-muted-foreground">
            Skipped — you can connect later from Settings.
          </span>
        </div>
      }

      <div class="flex items-center justify-between gap-3">
        <button
          hlmBtn
          variant="ghost"
          type="button"
          (click)="facade.back()"
        >
          Back
        </button>
        <div class="flex items-center gap-2">
          @if (!profile.githubConnected() && !skipped()) {
            <button
              hlmBtn
              variant="ghost"
              type="button"
              (click)="onSkip()"
            >
              Skip for now
            </button>
          }
          @if (!profile.githubConnected() && !skipped()) {
            <button
              hlmBtn
              variant="outline"
              type="button"
              (click)="onConnect()"
            >
              Connect GitHub
            </button>
          }
          <button
            hlmBtn
            type="button"
            [disabled]="!canFinish()"
            (click)="facade.complete()"
          >
            Finish
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FeatureOnboardingStepGithub {
  protected readonly facade = inject(OnboardingFacade);
  protected readonly profile = inject(ProfileFacade);
  private readonly dialog = inject(HlmDialogService);

  protected readonly skipped = signal<boolean>(false);

  protected readonly canFinish = () =>
    this.profile.githubConnected() || this.skipped();

  constructor() {
    void this.profile.initializeGithub();
    // Keep facade's step-status mirror in sync.
    effect(() => {
      if (this.profile.githubConnected()) {
        this.facade.markStep('github', 'done');
      } else if (this.skipped()) {
        this.facade.markStep('github', 'skipped');
      } else {
        this.facade.markStep('github', 'pending');
      }
    });
  }

  protected onConnect(): void {
    this.dialog.open(UiGithubConnectDialog, {});
  }

  protected onSkip(): void {
    this.skipped.set(true);
  }
}
