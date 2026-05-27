import { InjectionToken } from '@angular/core';

export const POSTHOG_KEY = new InjectionToken<string>('posthog.key', {
  providedIn: 'root',
  factory: () => '',
});

export const POSTHOG_HOST = new InjectionToken<string>('posthog.host', {
  providedIn: 'root',
  factory: () => '',
});
