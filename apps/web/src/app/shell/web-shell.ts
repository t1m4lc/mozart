import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Router-only shell for apps/web. No layout opinions — each page owns
// its own. Auth pages (/login, /auth-callback, /dashboard) center
// themselves via UiAuthCard ; destination pages (/account, future)
// supply a top-bar layout.
@Component({
  selector: 'app-web-shell',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-h-screen bg-background',
  },
  template: `<router-outlet />`,
})
export class WebShell {}
