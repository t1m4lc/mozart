import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmSwitchImports } from '@mozart/ui/switch';
import { toast } from '@spartan-ng/brain/sonner';
import { NotificationService } from '../../core/notification.service';
import {
  NOTIFICATION_PREFS_ADAPTER,
  type NotificationPreferences,
} from './data/notification-prefs.adapter';

// Settings card for notifications + sound. Two switches + a Test
// button that fires the same emit path as a real message-end event.
@Component({
  selector: 'app-feature-notification-prefs',
  imports: [HlmButtonImports, HlmSwitchImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-3 rounded-md border p-4">
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
        <hlm-switch
          [checked]="_prefs().sound"
          (checkedChange)="onSoundToggle($event)"
        />
      </div>
      <div class="flex justify-end">
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          (click)="onTest()"
        >
          Send test notification
        </button>
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

  protected onTest(): void {
    const prefs = this._prefs();
    if (!prefs.desktop && !prefs.sound) {
      toast('Notifications are off', {
        description:
          'Turn on Desktop notifications or Notification sound to hear a test.',
      });
      return;
    }
    // Route the test through the same path real notifications take so
    // the permission prompt fires on first use and the user hears /
    // sees exactly what they would at runtime.
    void this.notifications.notify({
      title: 'Mozart',
      body: 'Test notification',
    });
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
