import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmCardImports } from '@mozart/ui/card';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';

@Component({
  selector: 'app-ui-github-card',
  imports: [NgIcon, HlmButtonImports, HlmCardImports, HlmIconImports],
  providers: [provideIcons({ lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div hlmCard class="flex items-center gap-3 p-3">
      <ng-icon hlm name="lucideGithub" size="lg" class="shrink-0 text-foreground/80" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">GitHub</p>
        <p class="truncate text-xs text-muted-foreground">{{ subtitle() }}</p>
      </div>
      @if (connected()) {
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs"
          (click)="disconnect.emit()"
        >Disconnect</button>
      } @else {
        <button
          hlmBtn
          variant="default"
          size="sm"
          type="button"
          class="h-7 px-2 text-xs"
          (click)="connect.emit()"
        >Connect</button>
      }
    </div>
  `,
})
export class UiGithubCard {
  readonly connected = input.required<boolean>();
  readonly login = input<string | null>(null);

  readonly connect = output<void>();
  readonly disconnect = output<void>();

  protected readonly subtitle = computed(() => {
    if (this.connected()) {
      const login = this.login();
      return login ? `Connected as @${login}` : 'Connected';
    }
    return 'Push branches and open pull requests';
  });
}
