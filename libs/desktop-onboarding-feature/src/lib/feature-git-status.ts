import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { GIT_CHECK_ADAPTER } from '@mozart/desktop-onboarding-data-access';

// Read-only Git status card surfaced under /settings. Re-probes
// git --version on mount via the shared adapter. Used by Atom 8.
@Component({
  selector: 'app-feature-git-status',
  imports: [HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideCircleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 px-4 py-3">
      @switch (_state()) {
        @case ('probing') {
          <span class="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-brand/60 animate-pulse" aria-hidden="true"></span>
          <span class="text-sm text-muted-foreground">Checking…</span>
        }
        @case ('found') {
          <span class="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-green-500" aria-hidden="true"></span>
          <div class="min-w-0 flex-1">
            <p class="text-sm">Git {{ _version() }} detected</p>
            @if (_identity(); as id) {
              <p class="truncate text-xs text-muted-foreground">
                {{ id.name }}
                @if (id.email) {
                  <span>&lt;{{ id.email }}&gt;</span>
                }
              </p>
            } @else {
              <p class="text-xs text-muted-foreground">
                <code class="font-mono">user.name</code> /
                <code class="font-mono">user.email</code> not set — workspaces
                won't be creatable until they are.
              </p>
            }
          </div>
        }
        @case ('missing') {
          <ng-icon
            hlm
            name="lucideCircleAlert"
            size="sm"
            class="mt-0.5 text-destructive"
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
  protected readonly _identity = signal<{
    readonly name: string;
    readonly email: string;
  } | null>(null);

  constructor() {
    void this.probe();
  }

  private async probe(): Promise<void> {
    try {
      const v = await this.adapter.probe();
      if (!v) {
        this._state.set('missing');
        return;
      }
      this._version.set(v);
      this._state.set('found');
      // Identity is best-effort — null means user.name / user.email
      // aren't configured globally. The UI surfaces that state inline.
      try {
        const id = await this.adapter.identity();
        this._identity.set(id);
      } catch (err) {
        console.warn('[git-status] identity probe failed:', err);
      }
    } catch {
      this._state.set('missing');
    }
  }
}
