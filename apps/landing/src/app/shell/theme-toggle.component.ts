import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ThemeService } from '@mozart/shared-util-theme';
import { HlmButton } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';

@Component({
  selector: 'app-theme-toggle',
  imports: [NgIcon, HlmIconImports, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideSun, lucideMoon })],
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label="Toggle theme"
      (click)="toggle()"
    >
      <ng-icon hlm size="sm" [name]="iconName()" />
    </button>
  `,
})
export class ThemeToggleComponent {
  private readonly theme = inject(ThemeService);

  protected readonly iconName = computed(() =>
    this.theme.activeMode() === 'dark' ? 'lucideSun' : 'lucideMoon',
  );

  toggle(): void {
    this.theme.setMode(this.theme.activeMode() === 'dark' ? 'light' : 'dark');
  }
}
