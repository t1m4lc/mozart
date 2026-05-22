import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmSwitchImports } from '@mozart/ui/switch';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { lucideVolume2 } from '@ng-icons/lucide';
import { NotificationService } from '@mozart/desktop-core-data-access';
import {
  NOTIFICATION_PREFS_ADAPTER,
  type NotificationPreferences,
} from '@mozart/desktop-profile-data-access';

// Settings card for notifications + sound. Two switches + a Test
// button that fires the same emit path as a real message-end event.
@Component({
  selector: 'app-feature-notification-prefs',
  imports: [HlmButtonImports, HlmIconImports, HlmSwitchImports, NgIcon],
  providers: [provideIcons({ lucideVolume2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-4 rounded-md border border-border/60 bg-muted/30 p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="space-y-0.5">
          <p class="text-sm font-medium">Desktop notifications</p>
          <p class="text-xs text-muted-foreground">
            Mozart pings you when the agent finishes a turn in a workspace
            you're not currently viewing.
          </p>
        </div>
        <hlm-switch
          [checked]="_prefs().desktop"
          (checkedChange)="onDesktopToggle($event)"
        />
      </div>
      <div class="flex items-center justify-between gap-3">
        <div class="space-y-0.5">
          <p class="text-sm font-medium">Notification sound</p>
          <p class="text-xs text-muted-foreground">
            Play the default OS notification sound. Off keeps the popup
            silent.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            hlmBtn
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="Play test sound"
            [disabled]="!_prefs().sound"
            (click)="onTestSound()"
          >
            <ng-icon hlm name="lucideVolume2" size="sm" />
          </button>
          <hlm-switch
            [checked]="_prefs().sound"
            (checkedChange)="onSoundToggle($event)"
          />
        </div>
      </div>
    </div>
  `,
})
export class FeatureNotificationPrefs {
  private readonly adapter = inject(NOTIFICATION_PREFS_ADAPTER);
  private readonly notifications = inject(NotificationService);

  protected readonly _prefs = signal<NotificationPreferences>({
    desktop: true,
    sound: true,
  });

  constructor() {
    void this.hydrate();
    // Persist on every change + push the new prefs into the
    // NotificationService cache so the very next notify() uses them
    // without a DB round-trip.
    effect(() => {
      const p = this._prefs();
      this.notifications.setPreferences(p);
      void this.adapter.set(p).catch((err) => {
        console.warn('[notifications] set prefs failed:', err);
      });
    });
  }

  protected onDesktopToggle(value: boolean): void {
    this._prefs.update((p) => ({ ...p, desktop: value }));
  }

  protected onSoundToggle(value: boolean): void {
    this._prefs.update((p) => ({ ...p, sound: value }));
  }

  /** Play only the chime — doesn't fire a desktop notification. Lets
   *  the user verify the sound bytes without triggering OS-level
   *  permission prompts (which the broken Send-test-notification
   *  path exposed). */
  protected onTestSound(): void {
    this.notifications.playSound();
  }

  private async hydrate(): Promise<void> {
    try {
      const p = await this.adapter.get();
      this._prefs.set(p);
    } catch (err) {
      console.warn('[notifications] hydrate failed:', err);
    }
  }
}
