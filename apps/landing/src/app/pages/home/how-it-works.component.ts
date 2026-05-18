import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Step {
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'Add your repo.',
    body: 'Mozart clones it and works entirely on your machine.',
  },
  {
    title: 'Spin up Agent Runs.',
    body: 'Each Agent Run gets its own isolated Workspace, powered by your chosen LLM provider.',
  },
  {
    title: 'Conduct.',
    body: 'See progress at a glance, review Changes, merge on your terms.',
  },
] as const;

@Component({
  selector: 'app-how-it-works',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-8 py-12 text-sm">
      <div class="mx-auto max-w-xl">
        <span
          class="bg-muted border-border text-muted-foreground mb-8 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
        >
          How it works
        </span>
        <ol class="space-y-6">
          @for (step of steps; track step.title; let i = $index) {
            <li class="grid grid-cols-[auto_1fr] gap-x-2">
              <span class="text-muted-foreground">{{ i + 1 }}.</span>
              <div class="flex flex-col">
                <span class="text-foreground font-semibold">
                  {{ step.title }}
                </span>
                <span class="text-muted-foreground"> {{ step.body }}</span>
              </div>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
})
export class HowItWorksComponent {
  protected readonly steps = STEPS;
}
