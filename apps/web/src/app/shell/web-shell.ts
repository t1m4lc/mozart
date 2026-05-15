import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Minimal shell for apps/web. Centers route content vertically +
// horizontally in the viewport. No sidebar, no chrome — apps/web is
// a 3-page surface (/login, /auth-callback, /dashboard) sized for a
// short-attention-span auth round-trip.
@Component({
  selector: 'app-web-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-screen w-full items-center justify-center bg-background',
  },
  template: `<router-outlet />`,
})
export class WebShell {}
