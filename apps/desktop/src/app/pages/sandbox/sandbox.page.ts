import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';

@Component({
  selector: 'app-sandbox-page',
  imports: [RouterLink, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-6 p-8 max-w-2xl">
      <header class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold">libs/ui sandbox</h1>
        <p class="text-sm text-muted-foreground">
          Dev-only routes to dogfood the design-system components in
          isolation. Pick a component below.
        </p>
      </header>

      <ul class="flex flex-col gap-2">
        <li>
          <a hlmBtn variant="outline" routerLink="/sandbox/composer">
            HlmComposer →
          </a>
        </li>
      </ul>
    </section>
  `,
})
export class SandboxPage {}
