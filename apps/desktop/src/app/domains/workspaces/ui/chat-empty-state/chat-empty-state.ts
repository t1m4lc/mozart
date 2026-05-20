import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideGitBranch,
  lucideSparkles,
} from '@ng-icons/lucide';
import type { InstallState } from '../../data/workspace.facade';
import { MzLoader } from '@mozart-ui/loader';

// Step 4 copy lookup. Manager suffix is appended in the template when
// state is `success` or `failed` and a manager name is known.
const SETUP_LABEL: Record<InstallState, string> = {
  idle: 'Setup script completed.',
  no_package: 'No setup needed.',
  running: 'Installing dependencies…',
  success: 'Installed dependencies',
  failed: 'Install failed',
};

/**
 * Rendered in the main chat area when the active chat tab has no
 * messages yet. Two variants:
 *   - 'start'    -> workspace initialization checklist (first tab)
 *   - 'untitled' -> light "waiting for your instructions" line
 * Provisional copy — wired to inputs so it can move to a smart wrapper
 * once the workspace store exposes branch/file/setup metadata.
 */
@Component({
  selector: 'app-chat-empty-state',
  imports: [NgIcon, HlmIconImports, MzLoader],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleAlert,
      lucideGitBranch,
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
          <ng-icon hlm name="lucideSparkles" size="10px" />
        </span>
        <p class="text-sm font-light leading-none text-foreground">
          Ready when you are — what should we do next?
        </p>
      </div>
    } @else {
      <div class="w-full pl-12 pr-6 py-4">
        <ol class="flex w-full flex-col">
          <!-- 1 — branched into project -->
          <li class="relative flex w-full items-center gap-3 pb-4">
            <span
              class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
              aria-hidden="true"
            ></span>
            <span
              class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [--ng-icon__stroke-width:1.5]"
            >
              <ng-icon hlm name="lucideGitBranch" size="10px" />
            </span>
            <p class="text-sm font-light leading-none text-foreground">
              Branched
              <code
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                >{{ sourceBranch() }}</code
              >
              from
              <code
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                >{{ targetBranch() }}</code
              >
              in <span class="font-medium">{{ projectName() }}</span
              >.
            </p>
          </li>

          <!-- 2 — ready (workspace + files + install lifecycle) -->
          <li class="relative flex w-full items-center gap-3 pb-4">
            <span
              class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
              aria-hidden="true"
            ></span>
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
                  <ng-icon hlm name="lucideCircleAlert" size="10px" />
                </span>
              }
              @default {
                <span
                  class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 [--ng-icon__stroke-width:1.5]"
                >
                  <ng-icon hlm name="lucideCheck" size="10px" />
                </span>
              }
            }
            <p class="text-sm font-light leading-none text-muted-foreground">
              <code
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                >{{ workspaceName() }}</code
              >
              ready with
              <span class="font-medium text-foreground">{{
                numberOfFiles()
              }}</span>
              files.
              @if (
                installState() !== 'idle' && installState() !== 'no_package'
              ) {
                {{ setupLabel() }}
                @if (
                  installManager() &&
                  (installState() === 'success' || installState() === 'failed')
                ) {
                  with
                  <span class="font-medium text-foreground">{{
                    installManager()
                  }}</span>
                }
                .
              }
            </p>
          </li>

          <!-- 3 — CTA -->
          <li class="relative flex w-full items-center gap-3">
            <span
              class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [--ng-icon__stroke-width:1.5]"
            >
              <ng-icon hlm name="lucideSparkles" size="10px" />
            </span>
            <p class="text-sm font-light leading-none text-foreground">
              Compose your first instruction and let the magic begin!
            </p>
          </li>
        </ol>
      </div>
    }
  `,
})
export class ChatEmptyState {
  readonly variant = input<'start' | 'untitled'>('start');
  readonly projectName = input.required<string>();
  readonly workspaceName = input.required<string>();
  readonly sourceBranch = input.required<string>();
  readonly targetBranch = input.required<string>();
  readonly numberOfFiles = input.required<number>();
  // Step 4 lifecycle. 'idle' renders the original "Setup script
  // completed." copy; the other states swap icon + label.
  readonly installState = input<InstallState>('idle');
  readonly installManager = input<string>('');

  protected setupLabel(): string {
    return SETUP_LABEL[this.installState()];
  }
}
