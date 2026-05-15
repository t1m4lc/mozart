import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert, lucideRefreshCw } from '@ng-icons/lucide';
import { OsService } from '../../core/os.service';
import { GIT_CHECK_ADAPTER } from './data/git-check.adapter';
import { OnboardingFacade } from './data/onboarding.facade';
import { GIT_INSTALL_INSTRUCTIONS } from './util-git-install-instructions';

type ProbeState = 'idle' | 'probing' | 'found' | 'missing';

// Step 2 of the onboarding wizard. Probes `git --version` on mount,
// renders ✅ X.Y.Z when found, or ❌ with OS-specific install copy
// when missing. The Continue button is disabled until a probe returns
// `found` ; Verify re-runs the probe (e.g. after the user runs the
// install command in a terminal).
@Component({
  selector: 'app-feature-onboarding-step-git',
  imports: [HlmButtonImports, HlmIconImports, NgIcon],
  providers: [
    provideIcons({ lucideCheck, lucideCircleAlert, lucideRefreshCw }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6">
      <div class="space-y-1 text-center">
        <h2 class="text-xl font-semibold">Install Git</h2>
        <p class="text-sm text-muted-foreground">
          Mozart uses Git to create isolated workspaces for each task.
        </p>
      </div>

      <div
        class="flex items-center justify-center gap-3 rounded-md border px-4 py-3"
        [class.border-emerald-500/40]="state() === 'found'"
        [class.bg-emerald-500/10]="state() === 'found'"
        [class.border-red-500/40]="state() === 'missing'"
        [class.bg-red-500/10]="state() === 'missing'"
      >
        @switch (state()) {
          @case ('probing') {
            <span class="text-sm text-muted-foreground">Checking…</span>
          }
          @case ('found') {
            <ng-icon hlm name="lucideCheck" size="sm" class="text-emerald-600" />
            <span class="text-sm">Git {{ version() }} detected</span>
          }
          @case ('missing') {
            <ng-icon
              hlm
              name="lucideCircleAlert"
              size="sm"
              class="text-red-600"
            />
            <span class="text-sm">Git not found on this machine</span>
          }
          @default {
            <span class="text-sm text-muted-foreground">Idle</span>
          }
        }
      </div>

      @if (state() === 'missing') {
        <div class="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
          <div class="font-medium">{{ instructions().label }}</div>
          @if (instructions().command) {
            <pre
              class="overflow-x-auto rounded bg-background p-2 font-mono text-xs"
            >{{ instructions().command }}</pre>
          }
          @if (instructions().note) {
            <p class="text-xs text-muted-foreground">{{ instructions().note }}</p>
          }
        </div>
      }

      <div class="flex items-center justify-between gap-3">
        <button
          hlmBtn
          variant="ghost"
          type="button"
          [disabled]="state() === 'probing'"
          (click)="onVerify()"
        >
          <ng-icon hlm name="lucideRefreshCw" size="xs" />
          Verify
        </button>
        <button
          hlmBtn
          type="button"
          [disabled]="state() !== 'found'"
          (click)="facade.advance()"
        >
          Continue
        </button>
      </div>
    </div>
  `,
})
export class FeatureOnboardingStepGit {
  protected readonly facade = inject(OnboardingFacade);
  private readonly adapter = inject(GIT_CHECK_ADAPTER);
  private readonly os = inject(OsService);

  protected readonly state = signal<ProbeState>('idle');
  protected readonly version = signal<string | null>(null);
  protected readonly instructions = computed(
    () => GIT_INSTALL_INSTRUCTIONS[this.os.detect()],
  );

  constructor() {
    void this.probe();
  }

  protected onVerify(): void {
    void this.probe();
  }

  private async probe(): Promise<void> {
    this.state.set('probing');
    try {
      const v = await this.adapter.probe();
      if (v) {
        this.version.set(v);
        this.state.set('found');
        this.facade.markStep('git', 'done');
      } else {
        this.version.set(null);
        this.state.set('missing');
        this.facade.markStep('git', 'pending');
      }
    } catch (err) {
      console.warn('[onboarding] git probe failed:', err);
      this.state.set('missing');
      this.facade.markStep('git', 'pending');
    }
  }
}
