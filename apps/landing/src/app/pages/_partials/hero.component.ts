import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowRight,
  lucideDownload,
} from '@ng-icons/lucide';

type FeatureStatus = 'Now' | 'Next' | 'Vision';
type Feature = {
  title: string;
  description: string;
  status: FeatureStatus;
};

const roadmapFeatures: Feature[] = [
  {
    title: 'Local AI Workspaces',
    description:
      'Run Agent Runs in isolated local Workspaces with their own branch, terminal, diff context, and Anthropic support today. More providers soon: OpenAI, Mistral AI, local models, and more.',
    status: 'Now',
  },
  // TODO: add GitHub marketplace link.
  {
    title: 'Customization',
    description:
      'Configure Mozart with project settings, custom skills, instructions, reusable resources, and uploaded context. Later, share and discover community skills through the Mozart Marketplace.',
    status: 'Next',
  },
  {
    title: 'Agent Orchestration',
    description:
      'A main agent plans before coding, clarifies intent, splits work into scoped tasks, distributes them across isolated Workspaces, then coordinates review and merge.',
    status: 'Vision',
  },
  {
    title: 'LLM Token Economy',
    description:
      'Reduce cost and noise with routing strategy, auto-model selection, scoped context, RAG, and graph memory.',
    status: 'Vision',
  },
];

@Component({
  selector: 'app-hero',
  imports: [
    HlmButton,
    HlmIconImports,
    NgIcon,
    RouterLink,
    NgClass,
    HlmDialogImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ lucideArrowDown, lucideArrowRight, lucideDownload }),
  ],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-xl px-4 pt-12 pb-4 sm:pb-8 sm:pt-20 sm:px-8">
      <!-- <a
        routerLink="/changelog"
        class="group hover:text-foreground mb-6 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <span class="text-muted-foreground">See what's new in</span>
        <span class="text-foreground font-medium">v0.0.1</span>
        <ng-icon
          hlm
          size="sm"
          name="lucideArrowRight"
          class="transition-transform duration-200 group-hover:translate-x-1"
        />
      </a> -->

      <h1
        class="text-foreground max-w-xl text-2xl font-semibold tracking-tight md:text-3xl mb-3"
      >
        Agents move fast. Mozart gives direction.
      </h1>

      <p class="text-muted-foreground mb-8 max-w-2xl text-sm">
        Run <b>parallel Agents</b> in isolated Workspaces. Review every diff.
        Ship faster <b>without losing control</b> —

        <hlm-dialog>
          <button
            hlmDialogTrigger
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 transition-colors"
          >
            and more
          </button>

          <hlm-dialog-content
            *hlmDialogPortal="let ctx"
            class="max-h-[92dvh] overflow-hidden sm:max-w-4xl"
          >
            <hlm-dialog-header>
              <h3 hlmDialogTitle>Mozart roadmap</h3>
              <p hlmDialogDescription>
                Mozart is evolving from an agent runner into a project operating
                system for planning, running, reviewing, and merging AI-assisted
                work.
              </p>
            </hlm-dialog-header>

            <div class="mt-5 overflow-y-auto pr-1 sm:max-h-[65dvh]">
              <div class="grid gap-3 sm:grid-cols-2">
                @for (feature of roadmapFeatures; track feature.title) {
                  <article class="border-border bg-card rounded-lg border p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-foreground text-sm font-medium">
                          {{ feature.title }}
                        </p>
                        <p
                          class="text-muted-foreground mt-1 text-xs leading-relaxed"
                        >
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

              <div
                class="border-border bg-muted/40 mt-5 rounded-lg border p-4 text-sm"
              >
                <p class="text-foreground font-medium">
                  Want to shape what comes next?
                </p>
                <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
                  Join the Discord to share product feedback, request features,
                  or help prioritize the roadmap.
                </p>

                <a
                  routerLink="/discord"
                  class="text-foreground mt-3 inline-flex text-xs font-medium underline decoration-dotted underline-offset-4 hover:text-foreground/70"
                >
                  Join Discord →
                </a>
              </div>
            </div>
          </hlm-dialog-content> </hlm-dialog
        >.
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a
          hlmBtn
          variant="default"
          size="lg"
          routerLink="/download"
          class="border-primary group justify-between shadow-brand transition-shadow duration-300 hover:shadow-brand-strong"
        >
          Download Mozart
          <span class="relative h-4 w-4">
            <ng-icon
              hlm
              size="sm"
              name="lucideDownload"
              class="absolute inset-0 transition-all duration-200 group-hover:-translate-y-2 group-hover:opacity-0"
            />
            <ng-icon
              hlm
              size="sm"
              name="lucideArrowDown"
              class="absolute inset-0 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
            />
          </span>
        </a>
        <a
          hlmBtn
          variant="outline"
          size="lg"
          routerLink="/docs"
          class="group justify-between"
        >
          Learn how it works
          <ng-icon
            hlm
            size="sm"
            name="lucideArrowRight"
            class="transition-transform duration-200 group-hover:translate-x-1"
          />
        </a>
      </div>
    </section>
  `,
})
export class HeroComponent {
  protected readonly roadmapFeatures = roadmapFeatures;
}
