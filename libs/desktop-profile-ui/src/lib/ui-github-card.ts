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
          (connected() ? 'bg-status-ok' : 'bg-status-busy')
        "
        aria-hidden="true"
      ></span>
      <div class="min-w-0 flex-1">
        @if (connected()) {
          <p class="truncate text-sm">
            <span class="font-medium">GitHub</span>
            @if (login(); as login) {
              <span class="text-muted-foreground"> · </span>
              <span class="font-medium">&commat;{{ login }}</span>
            }
          </p>
          <p class="truncate text-xs text-muted-foreground">
            {{ provenance() }}
          </p>
        } @else {
          <p class="text-sm font-medium">GitHub</p>
          <p class="truncate text-xs text-muted-foreground">
            Push branches and open pull requests
          </p>
        }
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
  readonly kind = input<'pat' | 'oauth_clerk' | null>(null);

  readonly connect = output<void>();
  readonly disconnect = output<void>();

  protected readonly provenance = computed(() => {
    if (!this.connected()) return '';
    switch (this.kind()) {
      case 'oauth_clerk':
        return 'Connected via OAuth';
      case 'pat':
        return 'Connected via personal access token';
      default:
        return 'Connected';
    }
  });
}
