import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { OsService } from '@mozart/shared-util-os';
import { GIT_CHECK_ADAPTER, type GitIdentity } from '@mozart/desktop-onboarding-data-access';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';
import { GIT_INSTALL_INSTRUCTIONS } from '@mozart/desktop-onboarding-util';

type ProbeState = 'idle' | 'probing' | 'found' | 'missing';

const STATE_DOT_CLASS: Record<ProbeState, string> = {
  idle: 'bg-muted',
  probing: 'bg-brand/60 animate-pulse',
  found: 'bg-green-500',
  missing: 'bg-destructive',
};

// Step 2 of the onboarding wizard. Probes `git --version` on mount,
// also reads `git config user.name` + `user.email`, and renders :
//
//   - found  : ● Git X.Y.Z detected · "Name <email>" (or hint to set
//              identity if missing)
//   - missing: ● Git isn't installed yet, OS-specific install card +
//              Retry button
//
// Dev shortcut : `/onboarding?simulateGitMissing=true` overrides the
// probe to simulate the missing path. Lets contributors with Git
// installed walk through the install-card flow without touching their
// system Git.
@Component({
  selector: 'app-feature-onboarding-step-git',
  imports: [HlmButtonImports, HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideRefreshCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6">
      <div class="mx-auto max-w-md space-y-2 text-center">
        <h2 class="text-xl font-semibold tracking-tight">Install Git</h2>
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
              <div class="font-medium">Git {{ version() }} detected.</div>
              @if (identity(); as id) {
                <div class="text-muted-foreground text-xs">
                  Configured as {{ id.name }} &lt;{{ id.email }}&gt;
                </div>
              } @else {
                <div class="text-muted-foreground text-xs">
                  No global identity set — run
                  <code class="bg-muted rounded px-1 py-0.5 text-[10px]">
                    git config --global user.name "Your Name"
                  </code>
                  before creating workspaces.
                </div>
              }
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
        <div
          class="bg-muted/30 space-y-2 rounded-md border border-border/60 p-4 text-sm"
        >
          <div class="font-medium">{{ instructions().label }}</div>
          @if (instructions().command) {
            <pre
              class="bg-background overflow-x-auto rounded p-2 font-mono text-xs"
              >{{ instructions().command }}</pre
            >
          }
          @if (instructions().note) {
            <p class="text-muted-foreground text-xs">
              {{ instructions().note }}
            </p>
          }
        </div>
      }

      <div class="flex items-center justify-between gap-3">
        <span></span>
        <button
          hlmBtn
          type="button"
          [disabled]="state() !== 'found'"
          (click)="onContinue()"
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
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<ProbeState>('idle');
  protected readonly version = signal<string | null>(null);
  protected readonly identity = signal<GitIdentity | null>(null);
  protected readonly stateDot = computed(() => STATE_DOT_CLASS[this.state()]);
  protected readonly instructions = computed(
    () => GIT_INSTALL_INSTRUCTIONS[this.os.current()],
  );

  /** Dev-only override : `?simulateGitMissing=true` forces the
   *  "missing" state. Used to walk through the install card without
   *  uninstalling system Git. */
  private readonly simulateMissing =
    this.route.snapshot.queryParamMap.get('simulateGitMissing') === 'true';

  constructor() {
    void this.probe();
  }

  @HostListener('document:keyup.enter')
  protected onEnterKey(): void {
    if (this.state() === 'found') this.onContinue();
  }

  protected onVerify(): void {
    void this.probe();
  }

  protected onContinue(): void {
    this.facade.advance();
  }

  private async probe(): Promise<void> {
    this.state.set('probing');

    if (this.simulateMissing) {
      console.info(
        '[onboarding] simulateGitMissing=true — forcing missing state',
      );
      this.version.set(null);
      this.identity.set(null);
      this.state.set('missing');
      this.facade.markStep('git', 'pending');
      return;
    }

    try {
      const v = await this.adapter.probe();
      if (v) {
        this.version.set(v);
        this.state.set('found');
        // Identity fetch is best-effort — the step still passes when
        // it returns null ; the UI just shows the configure-identity
        // hint inline.
        try {
          this.identity.set(await this.adapter.identity());
        } catch (err) {
          console.warn('[onboarding] git identity probe failed:', err);
          this.identity.set(null);
        }
        this.facade.markStep('git', 'done');
      } else {
        this.version.set(null);
        this.identity.set(null);
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
