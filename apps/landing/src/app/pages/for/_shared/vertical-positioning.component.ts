import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideGitBranch,
  lucideHardDrive,
  lucideUnlock,
} from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';

interface Pillar {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
}

const PILLARS: readonly Pillar[] = [
  {
    icon: 'lucideHardDrive',
    title: 'Local-first',
    body: 'Mozart runs on your machine. Your files stay on your device, and nothing leaves it unless you choose.',
  },
  {
    icon: 'lucideGitBranch',
    title: 'Real work, not chat',
    body: "Agents act on your actual files in isolated workspaces and you review every change before accepting it. No copy-paste, no lost context.",
  },
  {
    icon: 'lucideUnlock',
    title: 'No lock-in',
    body: 'Works with Claude Code and Codex today, with more providers on the way. Your data stays yours, not tied to any single cloud.',
  },
] as const;

@Component({
  selector: 'app-vertical-positioning',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideHardDrive, lucideGitBranch, lucideUnlock })],
  host: { class: 'block' },
  template: `
    <section
      class="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 lg:px-8"
    >
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          Why Mozart
        </p>
        <h2 class="text-foreground mb-10 text-2xl font-semibold tracking-tight">
          Different by design
        </h2>

        <div class="grid grid-cols-1 gap-8 sm:grid-cols-3">
          @for (pillar of pillars; track pillar.title) {
            <div class="flex flex-col gap-3">
              <ng-icon
                hlm
                [name]="pillar.icon"
                size="sm"
                class="text-foreground/70"
              />
              <h3 class="text-foreground font-semibold">{{ pillar.title }}</h3>
              <p class="text-muted-foreground text-sm leading-relaxed">
                {{ pillar.body }}
              </p>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class VerticalPositioningComponent {
  protected readonly pillars = PILLARS;
}
