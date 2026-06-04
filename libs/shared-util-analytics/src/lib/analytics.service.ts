import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { PostHog } from 'posthog-js';
import {
  buildPostHogConfig,
  resolvePostHogKey,
} from './analytics-core';
import { InternalDeviceService } from './internal-device.service';
import { POSTHOG_HOST, POSTHOG_KEY } from './tokens';

type QueuedCapture = readonly [string, Record<string, unknown> | undefined];
type PendingIdentify = {
  readonly userId: string;
  readonly props?: Record<string, unknown>;
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly internalDevice = inject(InternalDeviceService);
  private readonly posthogKey = inject(POSTHOG_KEY);
  private readonly posthogHost = inject(POSTHOG_HOST);
  private posthog: PostHog | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly queue: QueuedCapture[] = [];
  // OAuth is redirect-based, so identify() can fire on the callback page
  // before the lazy SDK import resolves. Hold the last call and apply it
  // on init, mirroring the capture queue — otherwise the merge silently
  // drops and the user stays anonymous.
  private pendingIdentify: PendingIdentify | null = null;

  async init(opts?: { readonly bootstrapDistinctId?: string }): Promise<void> {
    if (!this.isBrowser) return;
    if (this.initPromise) return this.initPromise;

    const key = resolvePostHogKey(this.posthogKey);
    if (!key) return;

    const config = buildPostHogConfig(
      this.posthogHost,
      opts?.bootstrapDistinctId,
    );

    this.initPromise = (async () => {
      const [{ default: posthog }, isInternal] = await Promise.all([
        import('posthog-js'),
        this.internalDevice.resolve(),
      ]);
      posthog.init(key, config);
      posthog.register({ is_internal_device: isInternal });
      posthog.setPersonProperties({ is_internal_device: isInternal });
      this.posthog = posthog;
      // Identify before flushing so queued captures attach to the user.
      if (this.pendingIdentify) {
        const { userId, props } = this.pendingIdentify;
        this.pendingIdentify = null;
        posthog.identify(userId, props);
      }
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
    if (!this.isBrowser) return;
    if (this.posthog) {
      this.posthog.identify(userId, props);
    } else {
      this.pendingIdentify = { userId, props };
    }
  }

  /** Clear PostHog identity on logout so the next person on this device
   *  starts a fresh anonymous id instead of merging into this user. */
  reset(): void {
    if (!this.isBrowser) return;
    this.pendingIdentify = null;
    this.posthog?.reset();
  }

  distinctId(): string | null {
    return this.posthog?.get_distinct_id() ?? null;
  }
}
