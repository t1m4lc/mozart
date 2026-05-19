import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { PostHog } from 'posthog-js';

type QueuedCapture = readonly [string, Record<string, unknown> | undefined];

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private posthog: PostHog | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly queue: QueuedCapture[] = [];

  async init(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.initPromise) return this.initPromise;

    const key = import.meta.env.VITE_POSTHOG_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
    if (!key) return;
    if (import.meta.env.DEV && !import.meta.env.VITE_POSTHOG_FORCE_ENABLE) {
      console.info(
        '[analytics] PostHog disabled in dev. Set VITE_POSTHOG_FORCE_ENABLE=1 in .env.local to override.',
      );
      return;
    }

    this.initPromise = import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        cross_subdomain_cookie: true,
        persistence: 'localStorage+cookie',
        capture_pageview: 'history_change',
        capture_pageleave: false,
        autocapture: false,
        capture_performance: false,
        disable_session_recording: true,
        request_batching: false,
      });
      this.posthog = posthog;
      for (const [event, props] of this.queue) posthog.capture(event, props);
      this.queue.length = 0;
    });
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
