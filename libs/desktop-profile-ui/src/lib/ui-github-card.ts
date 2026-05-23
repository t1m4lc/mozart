import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';

@Component({
  selector: 'app-ui-github-card',
  imports: [NgIcon, HlmButtonImports, HlmIconImports],
  providers: [provideIcons({ lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-4">
      <ng-icon
        hlm
        name="lucideGithub"
        size="lg"
        class="mt-0.5 shrink-0 text-foreground/80"
      />
      <div class="min-w-0 flex-1 space-y-1">
        <p class="text-sm font-medium">GitHub</p>
        <p class="truncate text-xs text-muted-foreground">{{ subtitle() }}</p>
      </div>
      @if (connected()) {
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="disconnect.emit()"
        >
          Disconnect
        </button>
      } @else {
        <button
          hlmBtn
          variant="default"
          size="sm"
          type="button"
          (click)="connect.emit()"
        >
          Connect
        </button>
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
