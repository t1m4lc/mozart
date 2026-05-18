import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTheme } from './provide-theme';
import { ThemeService } from './theme.service';

describe('ThemeService SSR safety', () => {
  it('init() is a no-op when PLATFORM_ID is server', () => {
    TestBed.configureTestingModule({
      providers: [
        provideTheme({ theme: 'mozart', mode: 'light' }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const service = TestBed.inject(ThemeService);

    expect(() => service.init()).not.toThrow();
    expect(() => service.setMode('dark')).not.toThrow();
    expect(() => service.setTheme('zinc')).not.toThrow();
    expect(service.activeTheme()).toBe('zinc');
  });

  it('reads default mode without touching localStorage on the server', () => {
    TestBed.configureTestingModule({
      providers: [
        provideTheme({ theme: 'mozart', mode: 'dark' }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const service = TestBed.inject(ThemeService);

    expect(service.isDark()).toBe(true);
  });
});
