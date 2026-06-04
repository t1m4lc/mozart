import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmDialogImports } from '@spartan-ui/dialog';

type FeatureStatus = 'Now' | 'Next' | 'Vision';
interface Feature {
  readonly title: string;
  readonly description: string;
  readonly status: FeatureStatus;
}

const ROADMAP_FEATURES: readonly Feature[] = [
  {
    title: 'Run agents safely in parallel',
    description:
      'Start multiple Claude Code or Codex runs in isolated local Workspaces, then review each diff before anything reaches your main branch.',
    status: 'Now',
  },
  {
    title: 'Make Mozart fit your project',
    description:
      'Save project settings, instructions, reusable context, and preferred defaults so every new Workspace starts with the right setup.',
    status: 'Next',
  },
  {
    title: 'Plan bigger changes across agents',
    description:
      'Break larger requests into scoped tasks, run them across isolated Workspaces, and coordinate review before merge.',
    status: 'Vision',
  },
  {
    title: 'Spend less time on prompt plumbing',
    description:
      'Let Mozart choose useful context and models for the task, reducing repeated setup and noisy agent runs.',
    status: 'Vision',
  },
] as const;

export const ROADMAP_DIALOG_CLASS =
  // Default desktop look: roomy 4xl-width card. On phones, expand to a true
  // fullscreen sheet (no rounded corners, no margins, fills the viewport)
  // so long descriptions stop getting trapped inside a tiny scroll well.
  'flex flex-col gap-0 sm:max-w-4xl sm:max-h-[92dvh] ' +
  'max-sm:!w-screen max-sm:!h-[100dvh] max-sm:!max-w-none ' +
  'max-sm:!rounded-none max-sm:!border-0 max-sm:!mx-0 max-sm:!my-0 ' +
  'max-sm:!p-0';

@Component({
  selector: 'app-roadmap-dialog',
  imports: [HlmDialogImports, NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-border max-sm:border-b max-sm:p-6 sm:pb-4">
      <h3 hlmDialogTitle>Mozart roadmap</h3>
      <p hlmDialogDescription>
        Mozart is evolving from an agent runner into a project operating system
        for planning, running, reviewing, and merging AI-assisted work.
      </p>
    </header>

    <div
      class="min-h-0 flex-1 overflow-y-auto max-sm:px-6 max-sm:pb-6 sm:mt-5 sm:pr-1"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        @for (feature of features; track feature.title) {
          <article class="border-border bg-card rounded-lg border p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-foreground text-sm font-medium">
                  {{ feature.title }}
                </p>
                <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {{ feature.description }}
                </p>
              </div>

              <span
                class="shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                [ngClass]="{
                  'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400':
                    feature.status === 'Now',
                  'border-brand/20 bg-brand/10 text-brand dark:text-brand':
                    feature.status === 'Next',
                  'border-muted-foreground/20 bg-muted text-muted-foreground':
                    feature.status === 'Vision',
                }"
              >
                {{ feature.status }}
              </span>
            </div>
          </article>
        }
      </div>

      <div class="border-border bg-muted/40 mt-5 rounded-lg border p-4 text-sm">
        <p class="text-foreground font-medium">
          Want to shape what comes next?
        </p>
        <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
          Join the Discord to share product feedback, request features, or help
          prioritize the roadmap.
        </p>

        <a
          href="/discord"
          class="text-foreground hover:text-foreground/70 mt-3 inline-flex text-xs font-medium underline decoration-dotted underline-offset-4"
        >
          Join Discord →
        </a>
      </div>
    </div>
  `,
})
export class RoadmapDialogComponent {
  protected readonly features = ROADMAP_FEATURES;
}
