import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FeatureWorkspaceFiles } from './feature-workspace-files';
import { FeatureWorkspaceProcesses } from './feature-workspace-processes/feature-workspace-processes';

// Right-aside composer. Pure layout: stacks the two halves vertically.
//   - Top    : <app-feature-workspace-files>     — All files / Changes
//   - Bottom : <app-feature-workspace-processes> — Setup / Run / Terminal
// Each child owns its own state, watchers, and tab styling.
@Component({
  selector: 'app-feature-workspace-aside',
  imports: [FeatureWorkspaceFiles, FeatureWorkspaceProcesses],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-background' },
  template: `
    <app-feature-workspace-files />
    <app-feature-workspace-processes />
  `,
})
export class FeatureWorkspaceAside {}
