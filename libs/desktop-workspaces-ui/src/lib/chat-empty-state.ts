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
 *   - 'start'    -> workspace setup state (first tab). Mirrors the
 *                   auto-run install lifecycle: a loader while setup
 *                   runs, a ready line on success / when nothing was
 *                   needed, and a clear error + retry on failure.
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
          <p class="text-sm font-light leading-relaxed text-foreground">
            {{ statusLabel() }}
          </p>
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
  // Emitted from the failed-state Retry button. Parent re-runs setup.
  readonly retry = output<void>();

  protected readonly statusLabel = computed<string>(() => {
    switch (this.installState()) {
      case 'running':
        return 'Preparing your workspace… Mozart is installing dependencies and setting up the project.';
      case 'no_package':
        return 'Workspace ready. No setup step was required for this project.';
      case 'failed': {
        const mgr = this.installManager();
        const what = mgr
          ? `install dependencies with ${mgr}`
          : 'install dependencies';
        return `Setup failed — Mozart couldn't ${what}. Check the Setup tab for details, then retry.`;
      }
      default:
        return 'Workspace ready. Dependencies installed successfully.';
    }
  });
}
