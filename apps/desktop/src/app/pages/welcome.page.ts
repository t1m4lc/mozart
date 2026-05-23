import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TopBar } from '../core/window-controls/top-bar';
import { FeatureWelcome } from '@mozart/desktop-auth-feature';

// Route-level wrapper for /welcome. Composes the shared `TopBar`
// (Mozart logo + OS-correct window controls) with the centered
// FeatureWelcome card. The TopBar is overlaid via absolute positioning
// so it doesn't shift the vertical centering of the card.
@Component({
  selector: 'app-welcome-page',
  imports: [TopBar, FeatureWelcome],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block h-screen w-full overflow-hidden bg-background' },
  template: `
    <app-top-bar class="absolute inset-x-0 top-0" />
    <app-feature-welcome />
  `,
})
export class WelcomePage {}
