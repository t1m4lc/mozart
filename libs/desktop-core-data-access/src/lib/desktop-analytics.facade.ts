import { Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from '@mozart/shared-util-analytics';
import { AnalyticsConfigPort } from './analytics-config.port';

// Single entry point for ALL desktop analytics. Every event goes through
// `track()` so the `telemetry_opt_in` consent flag is the one chokepoint —
// no caller touches the shared `AnalyticsService` directly. Reuses the shared
// wrapper (one PostHog instance, same config) and adds the two desktop-only
// concerns: the `install_id` bootstrap distinct_id and the consent gate.
//
// TODO(public-launch): consent defaults to `true` for the private beta with no
// opt-in UI. Before GA, surface consent in onboarding + settings and decide
// whether the default flips. See docs/engineering/analytics/ANALYTICS_ROADMAP.md
// P3.3 (release guard).
@Injectable({ providedIn: 'root' })
export class DesktopAnalyticsFacade {
  private readonly analytics = inject(AnalyticsService);
  private readonly config = inject(AnalyticsConfigPort);

  private installId: string | null = null;
  private readonly _optedIn = signal(true);
  readonly optedIn = computed(() => this._optedIn());

  /** Read install_id + consent, then init PostHog (only when opted in) with
   *  the install_id as the anonymous distinct_id. Idempotent + fail-safe. */
  async bootstrap(): Promise<void> {
    try {
      const [installId, optIn] = await Promise.all([
        this.config.getOrCreateInstallId(),
        this.config.getTelemetryOptIn(),
      ]);
      this.installId = installId;
      this._optedIn.set(optIn);
      if (!optIn) return;
      await this.analytics.init({ bootstrapDistinctId: installId });
    } catch (err) {
      console.error('[analytics] desktop bootstrap failed:', err);
    }
  }

  /** The consent chokepoint. No desktop capture bypasses this. */
  track(event: string, props?: Record<string, unknown>): void {
    if (!this._optedIn()) return;
    this.analytics.capture(event, { surface: 'desktop', ...props });
  }

  /** Merge the anonymous install into the identified Clerk user. */
  identifyUser(userId: string): void {
    if (!this._optedIn()) return;
    this.analytics.identify(
      userId,
      this.installId ? { install_id: this.installId } : undefined,
    );
  }

  /** Clear identity on logout so the next user isn't merged into this one. */
  reset(): void {
    this.analytics.reset();
  }

  /** Persist + apply a consent change (wired to the P3 consent UX later). */
  async setOptIn(value: boolean): Promise<void> {
    await this.config.setTelemetryOptIn(value);
    this._optedIn.set(value);
    if (!value) this.analytics.reset();
  }
}
