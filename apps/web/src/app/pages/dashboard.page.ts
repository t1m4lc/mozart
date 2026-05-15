import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeatureLaunchMozart } from '../domains/auth';

// /dashboard — thin wrapper around `FeatureLaunchMozart`. Shown after
// the OAuth round-trip resolves ; offers the desktop deep-link.
@Component({
  selector: 'app-dashboard-page',
  imports: [FeatureLaunchMozart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-feature-launch-mozart />`,
})
export class DashboardPage {}
