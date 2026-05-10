import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { THEME_CONFIG } from './provide-theme';
import type {
  Theme,
  ThemeMode,
  ThemeModeResolved,
  ThemeOptions,
} from './theme.types';

const KEY_MODE = 'app:color-mode';
const KEY_THEME = 'app:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(THEME_CONFIG);
  private readonly html = this.document.documentElement;
  private readonly media = this.document.defaultView!.matchMedia(
    '(prefers-color-scheme: dark)',
  );
  private readonly onSystemChange = () => this.applyClasses();

  // config fallbacks → then hardcoded defaults
  private readonly defaultTheme = this.config.theme;
  private readonly defaultMode = this.config.mode;

  private _mode = signal<ThemeMode>(this.loadMode());
  private _theme = signal<Theme>(this.loadTheme());
  private _options = signal<ThemeOptions>(this.config.options);

  readonly activeMode = this._mode.asReadonly();
  readonly activeTheme = this._theme.asReadonly();
  readonly options = this._options.asReadonly();

  private readonly resolvedMode = computed<ThemeModeResolved>(() => {
    const m = this._mode();
    if (m === 'light' || m === 'dark') return m;
    return this.media.matches ? 'dark' : 'light';
  });

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    localStorage.setItem(KEY_MODE, mode);
    this.applyClasses();
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
    localStorage.setItem(KEY_THEME, theme);
    this.applyClasses();
  }

  // ── internal ──────────────────────────────────────────────────────────────

  init(): void {
    this.applyClasses();
    this.media.addEventListener('change', this.onSystemChange);
  }

  ngOnDestroy(): void {
    this.media.removeEventListener('change', this.onSystemChange);
  }

  private readonly isDark = computed(() => this.resolvedMode() === 'dark');

  private applyClasses(): void {
    this.html.classList.toggle('dark', this.isDark());

    const body = this.document.body;
    Array.from(body.classList)
      .filter((c) => c.startsWith('theme-'))
      .forEach((c) => body.classList.remove(c));
    body.classList.add(`theme-${this._theme()}`);
  }

  private loadMode(): ThemeMode {
    return (localStorage.getItem(KEY_MODE) as ThemeMode) ?? this.defaultMode;
  }

  private loadTheme(): Theme {
    return (localStorage.getItem(KEY_THEME) as Theme) ?? this.defaultTheme;
  }
}
