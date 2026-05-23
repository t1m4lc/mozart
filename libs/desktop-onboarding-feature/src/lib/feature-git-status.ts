import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert } from '@ng-icons/lucide';
import { GIT_CHECK_ADAPTER } from '@mozart/desktop-onboarding-data-access';

// Read-only Git status card surfaced under /settings. Re-probes
// git --version on mount via the shared adapter. Used by Atom 8.
@Component({
  selector: 'app-feature-git-status',
  imports: [HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideCheck, lucideCircleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-4">
      @switch (_state()) {
        @case ('probing') {
          <span class="text-sm text-muted-foreground">Checking…</span>
        }
        @case ('found') {
          <ng-icon hlm name="lucideCheck" size="sm" class="text-emerald-600" />
          <span class="text-sm">Git {{ _version() }} detected</span>
        }
        @case ('missing') {
          <ng-icon
            hlm
            name="lucideCircleAlert"
            size="sm"
            class="text-red-600"
          />
          <span class="text-sm">Git not detected on PATH</span>
        }
      }
    </div>
  `,
})
export class FeatureGitStatus {
  private readonly adapter = inject(GIT_CHECK_ADAPTER);

  protected readonly _state = signal<'probing' | 'found' | 'missing'>('probing');
  protected readonly _version = signal<string | null>(null);

  constructor() {
    void this.probe();
  }

  private async probe(): Promise<void> {
    try {
      const v = await this.adapter.probe();
      if (v) {
        this._version.set(v);
        this._state.set('found');
      } else {
        this._state.set('missing');
      }
    } catch {
      this._state.set('missing');
    }
  }
}
