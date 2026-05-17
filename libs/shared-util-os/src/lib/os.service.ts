import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { MacArch, Os } from './os.types';

@Injectable({ providedIn: 'root' })
export class OsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly current = signal<Os>(this.detectOs());
  readonly macArch = signal<MacArch>(this.detectMacArch());

  readonly isMac = computed(() => this.current() === 'macos');
  readonly isWindows = computed(() => this.current() === 'windows');
  readonly isLinux = computed(() => this.current() === 'linux');
  readonly isKnown = computed(() => this.current() !== 'unknown');

  private detectOs(): Os {
    if (!this.isBrowser || typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent;
    if (/mac|ipad|iphone|ipod/i.test(ua)) return 'macos';
    if (/win/i.test(ua)) return 'windows';
    if (/linux|x11|cros/i.test(ua)) return 'linux';
    return 'unknown';
  }

  // Best-effort: navigator.userAgentData.getHighEntropyValues is async and Chromium-only,
  // so we keep this synchronous and default to 'apple-silicon' on Mac. The UI always
  // surfaces an explicit Intel fallback link for the long-tail of pre-2020 hardware.
  private detectMacArch(): MacArch {
    if (this.detectOs() !== 'macos') return 'unknown';
    return 'apple-silicon';
  }
}
