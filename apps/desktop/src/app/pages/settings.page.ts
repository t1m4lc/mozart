import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full p-6' },
  template: `
    <h1 class="text-lg font-medium">Settings</h1>
    <!-- TODO: settings content -->
  `,
})
export class SettingsPage {}
