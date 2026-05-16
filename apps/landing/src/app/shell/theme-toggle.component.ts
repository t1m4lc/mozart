import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
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
      (click)="theme.toggle()"
    >
      <ng-icon hlm size="sm" [name]="icon()" />
    </button>
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly icon = computed(() =>
    this.theme.isDark() ? 'lucideSun' : 'lucideMoon',
  );
}
