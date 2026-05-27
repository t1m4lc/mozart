import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';
import { provideFileRouter } from '@analogjs/router';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { POSTHOG_HOST, POSTHOG_KEY } from '@mozart/shared-util-analytics';
import { provideTheme } from '@mozart/shared-util-theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay()),
    provideFileRouter(
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withViewTransitions(),
    ),
    provideContent(withMarkdownRenderer(), withPrismHighlighter()),
    provideTheme({ theme: 'mozart', mode: 'light' }),
    { provide: POSTHOG_KEY, useValue: import.meta.env['VITE_POSTHOG_KEY'] ?? '' },
    { provide: POSTHOG_HOST, useValue: import.meta.env['VITE_POSTHOG_HOST'] ?? '' },
  ],
};
