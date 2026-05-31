import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmToasterImports } from '@spartan-ui/sonner';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideWifiOff, lucideX } from '@ng-icons/lucide';
import { map } from 'rxjs/operators';
import { ConnectivityService } from '@mozart/desktop-core-data-access';
import { ReturnRouteService } from '@mozart/desktop-ui-state-data-access';
import { FeatureTour } from '@mozart/desktop-onboarding-feature';
import { ShellLeft } from './shell-left';
import { ShellRight } from './shell-right';

// Root shell composer. Owns the 3-pane horizontal layout
// (left | main | right), the global toaster, the offline notice, and
// the tour overlay gate. Each side panel manages its own collapse +
// content; `<main>` flexes to absorb all remaining width.
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    NgIcon,
    HlmIconImports,
    HlmToasterImports,
    FeatureTour,
    ShellLeft,
    ShellRight,
  ],
  providers: [provideIcons({ lucideWifiOff, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'block h-screen w-screen select-none bg-background text-foreground [&_.cm-editor]:select-text [&_.xterm]:select-text [&_input]:select-text [&_textarea]:select-text',
  },
  template: `
    <div class="flex h-full">
      <app-shell-left />

      <main class="min-w-[30rem] flex-1 overflow-auto">
        <router-outlet />
      </main>

      <app-shell-right />
    </div>

    <hlm-toaster position="bottom-right" [style]="toasterStyle" />

    @if (showOfflineNotice()) {
      <div
        role="status"
        class="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 py-1 pl-2.5 pr-1 text-xs text-amber-900 shadow-sm dark:text-amber-200"
      >
        <ng-icon hlm name="lucideWifiOff" size="xs" />
        <span>Offline</span>
        <button
          type="button"
          class="ml-0.5 rounded-full p-0.5 hover:bg-amber-500/20"
          aria-label="Dismiss"
          (click)="dismissOffline()"
        >
          <ng-icon hlm name="lucideX" size="xs" />
        </button>
      </div>
    }

    @if (tourActive()) {
      <!-- Tour overlay renders synchronously when the ?tour=on query
           param is present. Previously @defer (on idle) but that
           added a perceptible blank moment between nav + overlay. -->
      <app-feature-tour />
    }
  `,
})
export class AppShell {
  protected readonly connectivity = inject(ConnectivityService);
  private readonly route = inject(ActivatedRoute);
  // Eagerly construct so it subscribes to NavigationEnd from the
  // first paint — Settings reads its `previous()` to power Back-to-app.
  private readonly _returnRoute = inject(ReturnRouteService);

  // User-dismissed offline pill. Resets on every connectivity flip so
  // a fresh outage re-surfaces the notice.
  private readonly offlineDismissed = linkedSignal<boolean, boolean>({
    source: () => this.connectivity.connected(),
    computation: () => false,
  });
  protected readonly showOfflineNotice = computed(
    () => !this.connectivity.connected() && !this.offlineDismissed(),
  );

  protected dismissOffline(): void {
    this.offlineDismissed.set(true);
  }

  /** Tour overlay visibility — driven by the `?tour=on` query param
   *  attached by `/tour` when it redirects to the workspace. */
  protected readonly tourActive = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('tour') === 'on')),
    { initialValue: false },
  );

  // HlmToaster's default userStyle feeds the sonner CSS variables raw
  // HSL components (e.g. `var(--popover)` -> `0 0% 100%`), which is not
  // a valid CSS color and renders the toast transparent. We wrap each
  // token in `hsl(...)` so the rendered toast picks up the theme's
  // popover background, foreground, and border. libs/ui is read-only,
  // so the override happens here at the consumer.
  protected readonly toasterStyle: Record<string, string> = {
    '--normal-bg': 'hsl(var(--popover))',
    '--normal-text': 'hsl(var(--popover-foreground))',
    '--normal-border': 'hsl(var(--border))',
    '--border-radius': 'var(--radius)',
  };
}
