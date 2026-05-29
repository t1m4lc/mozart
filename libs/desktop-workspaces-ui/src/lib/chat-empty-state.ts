import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideRefreshCw,
  lucideSparkles,
} from '@ng-icons/lucide';
import type { InstallState } from '@mozart/desktop-workspaces-util';
import { MzLoader } from '@mozart-ui/loader';

/**
 * Rendered in the main chat area when the active chat tab has no
 * messages yet. Two variants:
 *   - 'start'    -> the single unified "workspace ready" card. Shown by
 *                   every creation path (manual open-project AND the
 *                   generated-workspace / onboarding flow). Merges the
 *                   branch line, the live setup lifecycle, and the
 *                   start-chatting CTA into one screen.
 *   - 'untitled' -> light "waiting for your instructions" line.
 */
@Component({
  selector: 'app-chat-empty-state',
  imports: [NgIcon, HlmButtonImports, HlmIconImports, MzLoader],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideRefreshCw,
      lucideSparkles,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (variant() === 'untitled') {
      <div class="flex w-full items-center gap-3 p-6">
        <span
          class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [--ng-icon__stroke-width:1.5]"
        >
          <ng-icon hlm name="lucideSparkles" size="2xs" />
        </span>
        <p class="text-sm font-light leading-none text-foreground">
          Ready when you are — what should we do next?
        </p>
      </div>
    } @else {
      <div
        class="flex w-full items-start gap-3 px-6 py-4"
        role="status"
        aria-live="polite"
      >
        @switch (installState()) {
          @case ('running') {
            <span
              class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
            >
              <mz-loader size="xs" />
            </span>
          }
          @case ('failed') {
            <span
              class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive [--ng-icon__stroke-width:1.5]"
            >
              <ng-icon hlm name="lucideCircleAlert" size="2xs" />
            </span>
          }
          @default {
            <span
              class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 [--ng-icon__stroke-width:1.5]"
            >
              <ng-icon hlm name="lucideCheck" size="2xs" />
            </span>
          }
        }
        <div class="flex-1 space-y-2">
          @if (branchLine(); as line) {
            <p class="text-xs font-light leading-relaxed text-muted-foreground">
              {{ line }}
            </p>
          }
          <p class="text-sm font-medium leading-relaxed text-foreground">
            {{ headline() }}
          </p>
          @if (detail(); as d) {
            <p class="text-sm font-light leading-relaxed text-muted-foreground">
              {{ d }}
            </p>
          }
          @if (installState() === 'failed') {
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              (click)="retry.emit()"
            >
              <ng-icon hlm name="lucideRefreshCw" size="sm" />
              Retry setup
            </button>
          } @else if (isReady()) {
            <p class="text-sm font-light leading-relaxed text-foreground">
              You can start chatting now.
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class ChatEmptyState {
  readonly variant = input<'start' | 'untitled'>('start');
  // Auto-run install lifecycle for the workspace. Drives the icon, copy
  // and the retry affordance.
  readonly installState = input<InstallState>('idle');
  readonly installManager = input<string>('');
  // Branch context for the ready card. The workspace's own branch (e.g.
  // "mozart/coltrane"), the branch it was forked from (e.g. "main"), and
  // the owning project name. When branch + project are present the card
  // shows a "Branch … from … in …" line above the status.
  readonly branch = input<string>('');
  readonly baseBranch = input<string>('');
  readonly projectName = input<string>('');
  // Emitted from the failed-state Retry button. Parent re-runs setup.
  readonly retry = output<void>();

  protected readonly branchLine = computed<string | null>(() => {
    const branch = this.branch().trim();
    const project = this.projectName().trim();
    if (!branch || !project) return null;
    const base = this.baseBranch().trim();
    return base
      ? `Branch ${branch} from ${base} in ${project}`
      : `Branch ${branch} in ${project}`;
  });

  protected readonly isReady = computed<boolean>(() => {
    const state = this.installState();
    return state === 'success' || state === 'no_package' || state === 'idle';
  });

  protected readonly headline = computed<string>(() => {
    switch (this.installState()) {
      case 'running':
        return 'Setting up your workspace…';
      case 'failed':
        return 'Setup failed';
      default:
        return 'Workspace ready';
    }
  });

  protected readonly detail = computed<string>(() => {
    switch (this.installState()) {
      case 'running':
        return 'Mozart is installing dependencies and preparing the project.';
      case 'no_package':
        return 'No setup step was required for this project.';
      case 'failed': {
        const mgr = this.installManager();
        const what = mgr
          ? `install dependencies with ${mgr}`
          : 'install dependencies';
        return `Mozart couldn't ${what}. Check the Setup tab for details, then retry.`;
      }
      // success / `idle` — the headline already says "Workspace ready" and
      // the ready block below adds the start-chatting CTA, so a detail line
      // here would only repeat the headline.
      default:
        return '';
    }
  });
}
