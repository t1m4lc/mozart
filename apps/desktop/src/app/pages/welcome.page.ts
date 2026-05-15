import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeatureWelcome } from '../domains/auth';

// Thin route-level wrapper for /welcome. All real UX lives inside
// FeatureWelcome ; this page only owns the route binding.
@Component({
  selector: 'app-welcome-page',
  imports: [FeatureWelcome],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-feature-welcome />`,
})
export class WelcomePage {}
