import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type OS = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

@Injectable({ providedIn: 'root' })
export class OsService {
  private platformId = inject(PLATFORM_ID);

  detect(): OS {
    if (!isPlatformBrowser(this.platformId)) {
      return 'unknown';
    }

    const nav = window.navigator;

    const userAgentDataPlatform =
      (nav as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform;

    const platform = userAgentDataPlatform || nav.platform || '';
    const userAgent = nav.userAgent || '';

    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
    if (/Android/i.test(userAgent)) return 'android';

    if (/Mac/i.test(platform)) return 'macos';
    if (/Win/i.test(platform)) return 'windows';
    if (/Linux/i.test(platform)) return 'linux';

    return 'unknown';
  }

  isMac(): boolean {
    return this.detect() === 'macos';
  }

  isWindows(): boolean {
    return this.detect() === 'windows';
  }
}
