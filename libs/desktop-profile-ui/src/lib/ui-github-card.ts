import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';

@Component({
  selector: 'app-ui-github-card',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-4 py-3"
    >
      <span
        [class]="
          'inline-block size-2 shrink-0 rounded-full ' +
          (connected() ? 'bg-green-500' : 'bg-yellow-500')
        "
        aria-hidden="true"
      ></span>
      <div class="min-w-0 flex-1 text-sm">
        <span class="font-medium">GitHub</span>
        <p class="truncate text-xs text-muted-foreground">{{ subtitle() }}</p>
      </div>
      @if (connected()) {
        <button
          hlmBtn
          variant="outline"
          type="button"
          (click)="disconnect.emit()"
        >
          Disconnect
        </button>
      } @else {
        <button hlmBtn variant="outline" type="button" (click)="connect.emit()">
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
