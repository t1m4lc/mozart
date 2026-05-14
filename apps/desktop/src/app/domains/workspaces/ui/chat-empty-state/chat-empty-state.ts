import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolder,
  lucideGitBranch,
  lucideInfo,
  lucideSparkles,
  lucideTerminal,
} from '@ng-icons/lucide';

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
  imports: [NgIcon, HlmIconImports],
  providers: [
    provideIcons({
      lucideInfo,
      lucideGitBranch,
      lucideFolder,
      lucideTerminal,

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
    <div class="w-full p-6">
      <ol class="flex w-full flex-col">
        <!-- Step 1 — context info -->
        <li class="relative flex w-full items-center gap-3 pb-5">
          <span
            class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
            aria-hidden="true"
          ></span>
          <span
            class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [--ng-icon__stroke-width:1.5]"
          >
            <ng-icon hlm name="lucideInfo" size="10px" />
          </span>
          <p class="text-sm font-light leading-none text-foreground">
            You are starting a fresh Mozart chat in
            <span class="font-medium">{{ projectName() }}</span
            >.
          </p>
        </li>

        <!-- Step 2 — branch -->
        <li class="relative flex w-full items-center gap-3 pb-5">
          <span
            class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
            aria-hidden="true"
          ></span>
          <span
            class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground [--ng-icon__stroke-width:1.5]"
          >
            <ng-icon hlm name="lucideGitBranch" size="10px" />
          </span>
          <p class="text-sm font-light leading-none text-muted-foreground">
            Branched
            <code
              class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
              >{{ sourceBranch() }}</code
            >
            from
            <code
              class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
              >{{ targetBranch() }}</code
            >.
          </p>
        </li>

        <!-- Step 3 — files -->
        <li class="relative flex w-full items-center gap-3 pb-5">
          <span
            class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
            aria-hidden="true"
          ></span>
          <span
            class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground [--ng-icon__stroke-width:1.5]"
          >
            <ng-icon hlm name="lucideFolder" size="10px" />
          </span>
          <p class="text-sm font-light leading-none text-muted-foreground">
            The workspace
            <code
              class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
              >{{ workspaceName() }}</code
            >
            is ready with
            <span class="font-medium text-foreground">{{
              numberOfFiles()
            }}</span>
            files.
          </p>
        </li>

        <!-- Step 4 — setup -->
        <li class="relative flex w-full items-center gap-3 pb-5">
          <span
            class="absolute left-[9.5px] top-5 bottom-0 w-px bg-border"
            aria-hidden="true"
          ></span>
          <span
            class="z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground [--ng-icon__stroke-width:1.5]"
          >
            <ng-icon hlm name="lucideTerminal" size="10px" />
          </span>
          <p class="text-sm font-light leading-none text-muted-foreground">
            Setup script completed.
          </p>
        </li>

        <!-- Final beat — call to action -->
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
}
