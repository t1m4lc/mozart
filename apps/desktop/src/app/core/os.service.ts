import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export type OS = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

@Injectable({ providedIn: 'root' })
export class OsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _os: OS = this.detect();

  detect(): OS {
    if (!isPlatformBrowser(this.platformId)) return 'unknown';

    const nav = window.navigator;
    const platform =
      (nav as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      nav.platform ??
      '';
    const userAgent = nav.userAgent ?? '';

    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
    if (/Android/i.test(userAgent)) return 'android';
    if (/Mac/i.test(platform)) return 'macos';
    if (/Win/i.test(platform)) return 'windows';
    if (/Linux/i.test(platform)) return 'linux';
    return 'unknown';
  }

  isMac(): boolean {
    return this._os === 'macos';
  }
}
