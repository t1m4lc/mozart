import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';

@Component({
  selector: 'app-sandbox-page',
  imports: [RouterLink, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-6 p-8 max-w-2xl">
      <header class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold">Mozart UI sandbox</h1>
        <p class="text-sm text-muted-foreground">
          Dogfooding surface for the design-system components in
          isolation. Pick a component below.
        </p>
      </header>

      <ul class="flex flex-col gap-2">
        <li>
          <a hlmBtn variant="outline" routerLink="/composer">
            MzComposer →
          </a>
        </li>
        <li>
          <a hlmBtn variant="outline" routerLink="/code-editor">
            MzCodeEditor →
          </a>
        </li>
        <li>
          <a hlmBtn variant="outline" routerLink="/review-progress">
            MzReviewProgress →
          </a>
        </li>
        <li>
          <a hlmBtn variant="outline" routerLink="/hunk-expand-bar">
            MzHunkExpandBar →
          </a>
        </li>
        <li>
          <a hlmBtn variant="outline" routerLink="/file-diff-card">
            MzFileDiffCard →
          </a>
        </li>
        <li>
          <a hlmBtn variant="outline" routerLink="/timeline">
            MzTimeline →
          </a>
        </li>
      </ul>
    </section>
  `,
})
export class SandboxPage {}
