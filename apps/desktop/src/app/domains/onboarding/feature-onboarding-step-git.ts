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
import { lucideRefreshCw } from '@ng-icons/lucide';
import { OsService } from '../../core/os.service';
import { GIT_CHECK_ADAPTER } from './data/git-check.adapter';
import { OnboardingFacade } from './data/onboarding.facade';
import { GIT_INSTALL_INSTRUCTIONS } from './util-git-install-instructions';

type ProbeState = 'idle' | 'probing' | 'found' | 'missing';

const STATE_DOT_CLASS: Record<ProbeState, string> = {
  idle: 'bg-muted',
  probing: 'bg-brand/60 animate-pulse',
  found: 'bg-brand',
  missing: 'bg-destructive',
};

// Step 2 of the onboarding wizard. Probes `git --version` on mount,
// renders ✅ X.Y.Z when found, or ❌ with OS-specific install copy
// when missing. The Continue button is disabled until a probe returns
// `found` ; Verify re-runs the probe (e.g. after the user runs the
// install command in a terminal).
@Component({
  selector: 'app-feature-onboarding-step-git',
  imports: [HlmButtonImports, HlmIconImports, NgIcon],
  providers: [
    provideIcons({ lucideRefreshCw }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6">
      <div class="space-y-1 text-center">
        <h2 class="text-xl font-semibold">Install Git</h2>
        <p class="text-muted-foreground text-sm">
          Mozart uses Git to create isolated workspaces for each task.
        </p>
      </div>

      <div
        class="bg-muted/30 flex items-center gap-3 rounded-md border border-border/60 px-4 py-3"
        role="status"
      >
        <span
          [class]="'inline-block size-2 shrink-0 rounded-full ' + stateDot()"
          aria-hidden="true"
        ></span>
        <div class="flex-1 text-sm">
          @switch (state()) {
            @case ('probing') {
              <span>Checking your installation…</span>
            }
            @case ('found') {
              <span class="font-medium">Git {{ version() }} detected.</span>
            }
            @case ('missing') {
              <span class="font-medium">Git isn't installed yet.</span>
            }
            @default {
              <span>Checking your installation…</span>
            }
          }
        </div>
        @if (state() === 'missing') {
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            (click)="onVerify()"
          >
            <ng-icon hlm name="lucideRefreshCw" size="xs" />
            Retry
          </button>
        }
      </div>

      @if (state() === 'missing') {
        <div class="bg-muted/30 space-y-2 rounded-md border border-border/60 p-4 text-sm">
          <div class="font-medium">{{ instructions().label }}</div>
          @if (instructions().command) {
            <pre
              class="bg-background overflow-x-auto rounded p-2 font-mono text-xs"
            >{{ instructions().command }}</pre>
          }
          @if (instructions().note) {
            <p class="text-muted-foreground text-xs">{{ instructions().note }}</p>
          }
        </div>
      }

      <div class="flex items-center justify-between gap-3">
        <span></span>
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
  protected readonly stateDot = computed(() => STATE_DOT_CLASS[this.state()]);
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
