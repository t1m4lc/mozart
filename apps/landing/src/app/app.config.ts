import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';
import { provideFileRouter } from '@analogjs/router';
import { provideTheme } from '@mozart/shared-util-theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(),
    provideContent(withMarkdownRenderer(), withPrismHighlighter()),
    provideTheme({ theme: 'stone', mode: 'light' }),
  ],
};
