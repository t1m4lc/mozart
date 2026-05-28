import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmTypographyImports } from '@spartan-ui/typography';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, HlmButtonImports, HlmTypographyImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6 text-center',
  },
  template: `
    <h1 hlmH1 class="text-6xl font-bold tracking-tighter">404</h1>
    <p hlmP class="max-w-md text-muted-foreground">
      This page doesn't exist or has moved. Head back to your dashboard,
      or sign in if you haven't yet.
    </p>
    <div class="flex gap-3">
      <a hlmBtn variant="default" routerLink="/dashboard">Go to dashboard</a>
      <a hlmBtn variant="outline" routerLink="/login">Sign in</a>
    </div>
  `,
})
export class NotFoundPage {}
