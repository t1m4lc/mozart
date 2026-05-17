import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowRight,
  lucideDownload,
} from '@ng-icons/lucide';

@Component({
  selector: 'app-hero',
  imports: [HlmButton, HlmIconImports, NgIcon, RouterLink],
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
        AI Agents move fast. Mozart gives direction.
      </h1>

      <p class="text-muted-foreground mb-6 max-w-2xl text-sm">
        Run parallel Agent in isolated Workspaces. Review every diff. Ship
        faster without losing control.
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
export class HeroComponent {}
