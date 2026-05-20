import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export type CookieReadOptions = {
  readonly name: string;
};

/**
 * Thin imperative shell over `document.cookie`. Browser-only — every method
 * is a no-op during SSR / prerender. Pure parsing/serialization lives inline
 * because it's small enough not to justify a separate module.
 */
@Injectable({ providedIn: 'root' })
export class CookieService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  get(name: string): string | null {
    if (!this.isBrowser) return null;
    const prefix = `${encodeURIComponent(name)}=`;
    for (const part of document.cookie.split('; ')) {
      if (part.startsWith(prefix)) {
        return decodeURIComponent(part.slice(prefix.length));
      }
    }
    return null;
  }

  has(name: string): boolean {
    return this.get(name) !== null;
  }
}
