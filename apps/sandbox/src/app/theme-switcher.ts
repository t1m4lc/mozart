import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Theme, ThemeService } from '@mozart/shared-util-theme';

// Dev-only theme switcher for the sandbox shell. Two native <select>
// elements wired straight to ThemeService — no localStorage access
// here, the service owns persistence.
@Component({
  selector: 'app-theme-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2 text-xs backdrop-blur',
  },
  template: `
    <label class="flex items-center gap-2 text-muted-foreground">
      Mode
      <select
        class="rounded-md border border-input bg-background px-2 py-1 text-foreground"
        [value]="mode()"
        (change)="onModeChange($event)"
      >
        <option value="light">light</option>
        <option value="dark">dark</option>
        <option value="system">system</option>
      </select>
    </label>

    <label class="flex items-center gap-2 text-muted-foreground">
      Theme
      <select
        class="rounded-md border border-input bg-background px-2 py-1 text-foreground"
        [value]="theme()"
        (change)="onThemeChange($event)"
      >
        @for (t of themeOptions(); track t) {
          <option [value]="t">{{ t }}</option>
        }
      </select>
    </label>

    <span class="ml-auto text-muted-foreground">
      resolved: <strong class="text-foreground">{{ resolved() }}</strong>
    </span>
  `,
})
export class ThemeSwitcher {
  private readonly themeService = inject(ThemeService);

  protected readonly mode = this.themeService.mode;
  protected readonly theme = this.themeService.activeTheme;
  protected readonly themeOptions = this.themeService.options;
  protected readonly resolved = computed(() =>
    this.themeService.isDark() ? 'dark' : 'light',
  );

  protected onModeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as
      | 'light'
      | 'dark'
      | 'system';
    this.themeService.setMode(value);
  }

  protected onThemeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as Theme;
    this.themeService.setTheme(value);
  }
}
