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
    <section class="mx-auto max-w-xl px-4 pt-12 sm:px-8">
      <a
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
      </a>

      <div class="mb-6">
        <svg
          role="img"
          aria-label="Mozart"
          viewBox="0 0 255 53"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          class="text-foreground block h-12 w-auto sm:h-14"
        >
          <path
            d="M11 0H0v11h11zM39 0H28v11h11zM11 14H0v11h11zM25 14H14v11h11zM39 14H28v11h11zM11 28H0v11h11zM39 28H28v11h11zM11 42H0v11h11zM39 42H28v11h11zM56 0H45v11h11zM70 0H59v11h11zM84 0H73v11h11zM56 14H45v11h11zM84 14H73v11h11zM56 28H45v11h11zM84 28H73v11h11zM56 42H45v11h11zM84 42H73v11h11zM101 0H90v11h11zM115 0h-11v11h11zM129 0h-11v11h11zM129 14h-11v11h11zM115 21h-11v11h11zM101 28H90v11h11zM115 42h-11v11h11zM129 42h-11v11h11zM101 42H90v11h11zM70 42H59v11h11zM160 0h-11v11h11zM146 14h-11v11h11zM145 0h-11v11h11zM174 14h-11v11h11zM174 0h-11v11h11zM146 28h-11v11h11zM160 21h-11v11h11zM174 28h-11v11h11zM146 42h-11v11h11zM174 42h-11v11h11zM191 0h-11v11h11zM205 0h-11v11h11zM191 14h-11v11h11zM213 14h-11v11h11zM191 28h-11v11h11zM205 28h-11v11h11zM191 42h-11v11h11zM219 42h-11v11h11zM227 0h-11v11h11zM241 0h-11v11h11zM255 0h-11v11h11zM241 14h-11v11h11zM241 28h-11v11h11zM241 42h-11v11h11z"
          />
        </svg>
      </div>

      <h1 class="text-foreground mb-3 text-xl font-bold tracking-tight">
        Run a team of AI coding agents on your machine.
      </h1>

      <p class="text-muted-foreground mb-6 max-w-2xl text-sm">
        Spin up parallel Agent Runs in isolated Workspaces. Review each diff
        before it lands. Local-first, free forever, you stay in control.
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a
          hlmBtn
          variant="default"
          size="lg"
          routerLink="/download"
          class="group justify-between"
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
