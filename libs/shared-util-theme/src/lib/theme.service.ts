import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { THEME_CONFIG } from './provide-theme';
import { THEME_PERSISTENCE } from './theme-persistence';
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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  // Optional durable store (desktop = settings.json). Absent elsewhere —
  // localStorage remains the only backing store, behavior unchanged.
  private readonly persistence = inject(THEME_PERSISTENCE, { optional: true });

  private readonly html = this.document.documentElement;
  private readonly media: MediaQueryList | null =
    this.isBrowser && this.document.defaultView
      ? this.document.defaultView.matchMedia('(prefers-color-scheme: dark)')
      : null;
  private readonly onSystemChange = () => this.applyClasses();

  private readonly defaultTheme = this.config.theme;
  private readonly defaultMode = this.config.mode;

  private _mode = signal<ThemeMode>(this.loadMode());
  private _theme = signal<Theme>(this.loadTheme());
  private _options = signal<ThemeOptions>(this.config.options);

  readonly activeTheme = this._theme.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly options = this._options.asReadonly();
  readonly isDark = computed(() => this.resolvedMode() === 'dark');

  private readonly resolvedMode = computed<ThemeModeResolved>(() => {
    const m = this._mode();
    if (m === 'light' || m === 'dark') return m;
    return this.media?.matches ? 'dark' : 'light';
  });

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    if (this.isBrowser) localStorage.setItem(KEY_MODE, mode);
    this.applyClasses();
    this.persist();
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
    if (this.isBrowser) localStorage.setItem(KEY_THEME, theme);
    this.applyClasses();
    this.persist();
  }

  toggle(): void {
    this.setMode(this.isDark() ? 'light' : 'dark');
  }

  init(): void {
    if (!this.isBrowser) return;
    this.applyClasses();
    this.media?.addEventListener('change', this.onSystemChange);
    // Reconcile the localStorage paint-cache against the durable store
    // (settings.json) once it resolves. localStorage already drove the
    // first paint, so this only corrects a drift (e.g. settings edited
    // out-of-band) without a flash.
    void this.reconcile();
  }

  private async reconcile(): Promise<void> {
    if (!this.persistence) return;
    try {
      const stored = await this.persistence.load();
      if (stored.mode && stored.mode !== this._mode()) {
        this._mode.set(stored.mode);
        localStorage.setItem(KEY_MODE, stored.mode);
      }
      if (stored.theme && stored.theme !== this._theme()) {
        this._theme.set(stored.theme);
        localStorage.setItem(KEY_THEME, stored.theme);
      }
      this.applyClasses();
    } catch (err) {
      console.warn('[theme] reconcile from persistence failed:', err);
    }
  }

  private persist(): void {
    if (!this.persistence) return;
    void this.persistence
      .save({ theme: this._theme(), mode: this._mode() })
      .catch((err) => console.warn('[theme] persist failed:', err));
  }

  ngOnDestroy(): void {
    this.media?.removeEventListener('change', this.onSystemChange);
  }

  private applyClasses(): void {
    if (!this.isBrowser) return;
    this.html.classList.toggle('dark', this.isDark());

    const body = this.document.body;
    Array.from(body.classList)
      .filter((c) => c.startsWith('theme-'))
      .forEach((c) => body.classList.remove(c));
    body.classList.add(`theme-${this._theme()}`);
  }

  private loadMode(): ThemeMode {
    if (!this.isBrowser) return this.defaultMode;
    const stored = localStorage.getItem(KEY_MODE);
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : this.defaultMode;
  }

  private loadTheme(): Theme {
    if (!this.isBrowser) return this.defaultTheme;
    const stored = localStorage.getItem(KEY_THEME);
    return stored && this.config.options.includes(stored as Theme)
      ? (stored as Theme)
      : this.defaultTheme;
  }
}
