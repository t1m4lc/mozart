import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeatureConnections } from '../domains/profile';

@Component({
  selector: 'app-settings-page',
  imports: [FeatureConnections],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full p-6' },
  template: `
    <h1 class="text-lg font-medium">Settings</h1>
    <div class="mt-6">
      <app-feature-connections />
    </div>
  `,
})
export class SettingsPage {}
