import {
  EnvironmentProviders,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { ThemeService } from './theme.service';
import { themes, type ThemeConfig } from './theme.types';

export const THEME_CONFIG = new InjectionToken<ThemeConfig>('THEME_CONFIG');

const DEFAULT_CONFIG: ThemeConfig = {
  theme: 'mozart',
  mode: 'light',
  options: themes,
};

export function provideTheme(
  config: Partial<ThemeConfig> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: THEME_CONFIG, useValue: { ...DEFAULT_CONFIG, ...config } },
    provideAppInitializer(() => {
      inject(ThemeService).init();
    }),
  ]);
}
