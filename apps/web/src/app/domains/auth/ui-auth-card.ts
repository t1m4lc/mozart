import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmEmptyImports } from '@spartan-ui/empty';
import { HlmTypographyImports } from '@spartan-ui/typography';

// Dumb component : centered logo + heading + slot for content. Used by
// every apps/web page so they all share the same vertical rhythm.
//
// The page passes its specific content (buttons, spinner, etc.) into
// the default ng-content slot ; the heading + subtitle text is also
// projected by the page (different per route).
@Component({
  selector: 'app-ui-auth-card',
  imports: [HlmEmptyImports, HlmTypographyImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-screen w-full items-center justify-center',
  },
  template: `
    <hlm-empty class="border-none p-0">
      <hlm-empty-media>
        <img src="/assets/shared/logos/mozart-logo.svg" alt="Mozart" class="size-16" />
      </hlm-empty-media>

      <hlm-empty-header>
        <h1 hlmH1 class="text-3xl">
          <ng-content select="[card-title]" />
        </h1>
        <p hlmLead class="text-base">
          <ng-content select="[card-subtitle]" />
        </p>
      </hlm-empty-header>

      <hlm-empty-content>
        <ng-content />
      </hlm-empty-content>
    </hlm-empty>
  `,
})
export class UiAuthCard {}
