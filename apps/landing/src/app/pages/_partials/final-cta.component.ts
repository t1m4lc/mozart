import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideDownload } from '@ng-icons/lucide';

@Component({
  selector: 'app-final-cta',
  imports: [HlmButton, HlmIconImports, NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideArrowDown, lucideDownload })],
  host: { class: 'block' },
  template: `
    <section class="px-8 pt-16 pb-24">
      <div class="mx-auto flex max-w-xl flex-col gap-4">
        <p
          class="text-foreground text-2xl font-semibold tracking-tight md:text-3xl"
        >
          Local-first. Free forever.
        </p>

        <a
          hlmBtn
          variant="default"
          size="lg"
          routerLink="/download"
          class="group mt-2 max-w-3xs justify-between"
        >
          Download now
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
        <p class="text-muted-foreground/80  max-w-md text-xs">
          We build Mozart with Mozart.
        </p>
      </div>
    </section>
  `,
})
export class FinalCtaComponent {}
