import { Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';

const stripQueryHashTrailing = (url: string): string =>
  url.split('?')[0].split('#')[0].replace(/\/$/, '');

export function injectCurrentPath(): Signal<string> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => stripQueryHashTrailing(e.urlAfterRedirects)),
    ),
    { initialValue: stripQueryHashTrailing(router.url) },
  );
}
