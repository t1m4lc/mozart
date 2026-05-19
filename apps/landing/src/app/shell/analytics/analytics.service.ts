import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { PostHog } from 'posthog-js';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private posthog: PostHog | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.initPromise) return this.initPromise;

    const key = import.meta.env.VITE_POSTHOG_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
    if (!key) return;

    this.initPromise = import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        cross_subdomain_cookie: true,
        persistence: 'localStorage+cookie',
        capture_pageview: 'history_change',
        capture_pageleave: 'if_capture_pageview',
        autocapture: false,
        capture_performance: false,
        disable_session_recording: true,
      });
      this.posthog = posthog;
    });
    return this.initPromise;
  }

  capture(event: string, props?: Record<string, unknown>): void {
    this.posthog?.capture(event, props);
  }

  identify(userId: string, props?: Record<string, unknown>): void {
    this.posthog?.identify(userId, props);
  }

  distinctId(): string | null {
    return this.posthog?.get_distinct_id() ?? null;
  }
}
