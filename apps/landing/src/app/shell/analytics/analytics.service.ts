import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { PostHog } from 'posthog-js';
import {
  buildPostHogConfig,
  resolvePostHogKey,
} from './analytics-core';
import { InternalDeviceService } from './internal-device.service';

type QueuedCapture = readonly [string, Record<string, unknown> | undefined];

/**
 * Thin imperative shell around PostHog. Responsibilities are kept narrow:
 *   - decide whether to init (delegated to resolvePostHogKey)
 *   - init PostHog with the canonical config (delegated to buildPostHogConfig)
 *   - register `is_internal_device` as a super-property so every event carries it
 *   - queue captures fired before init completes
 *   - expose capture / identify / distinctId
 *
 * Cookie reads, URL parsing, and server-side validation live elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly internalDevice = inject(InternalDeviceService);
  private posthog: PostHog | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly queue: QueuedCapture[] = [];

  async init(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.initPromise) return this.initPromise;

    const key = resolvePostHogKey({
      key: import.meta.env.VITE_POSTHOG_KEY,
      isDev: import.meta.env.DEV,
      forceEnable: import.meta.env.VITE_POSTHOG_FORCE_ENABLE,
    });
    if (!key) {
      if (import.meta.env.DEV) {
        console.info(
          '[analytics] PostHog disabled in dev. Set VITE_POSTHOG_FORCE_ENABLE=1 in .env.local to override.',
        );
      }
      return;
    }

    const config = buildPostHogConfig(import.meta.env.VITE_POSTHOG_HOST);

    this.initPromise = (async () => {
      const [{ default: posthog }, isInternal] = await Promise.all([
        import('posthog-js'),
        this.internalDevice.resolve(),
      ]);
      posthog.init(key, config);
      // Super-property: tags every outgoing event with is_internal_device.
      posthog.register({ is_internal_device: isInternal });
      // Person property: powers PostHog's "Filter out internal and test users"
      // Settings UI, including CDP destinations. Same value, different scope.
      posthog.setPersonProperties({ is_internal_device: isInternal });
      this.posthog = posthog;
      for (const [event, props] of this.queue) posthog.capture(event, props);
      this.queue.length = 0;
    })();
    return this.initPromise;
  }

  capture(event: string, props?: Record<string, unknown>): void {
    if (!this.isBrowser) return;
    if (this.posthog) {
      this.posthog.capture(event, props);
    } else {
      this.queue.push([event, props]);
    }
  }

  identify(userId: string, props?: Record<string, unknown>): void {
    this.posthog?.identify(userId, props);
  }

  distinctId(): string | null {
    return this.posthog?.get_distinct_id() ?? null;
  }
}
