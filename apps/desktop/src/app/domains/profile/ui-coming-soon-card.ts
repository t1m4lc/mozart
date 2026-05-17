import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmCardImports } from '@mozart/ui/card';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';

// Placeholder card for integrations that are surfaced in v0.1.0-beta.1 but not
// yet implemented. Visually de-emphasized (opacity-60) and labeled with
// a "Soon" badge. No buttons, no interactive elements.
//
// Icon name must be one of the icons registered via `provideIcons` below;
// extending to a new integration means adding its icon import + entry
// here. Kept lean on purpose — v0.1.0 will replace this with real
// integration cards.
@Component({
  selector: 'app-ui-coming-soon-card',
  imports: [HlmCardImports, HlmBadgeImports, HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div hlmCard class="max-w-2xl opacity-60">
      <div hlmCardHeader>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <ng-icon
              hlm
              [name]="icon()"
              size="sm"
              class="text-muted-foreground"
            />
            <div>
              <h3 hlmCardTitle>{{ name() }}</h3>
              <p hlmCardDescription>{{ description() }}</p>
            </div>
          </div>
          <span hlmBadge variant="secondary">Soon</span>
        </div>
      </div>
    </div>
  `,
})
export class UiComingSoonCard {
  readonly name = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input.required<string>();
}
