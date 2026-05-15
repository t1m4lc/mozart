import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';

// Phase 6 / Atom 6 wires the real tour. Atom 1 ships a placeholder so
// the `/tour` route resolves — completing onboarding routes here ; the
// user can dismiss back to / until the real tour content lands.
@Component({
  selector: 'app-tour-page',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-screen w-screen items-center justify-center' },
  template: `
    <div class="space-y-4 text-center">
      <h1 class="text-2xl font-semibold">Tour coming soon</h1>
      <p class="text-sm text-muted-foreground">
        Atom 6 wires the interactive tour on a real workspace.
      </p>
      <button hlmBtn type="button" (click)="onFinish()">Continue to Mozart</button>
    </div>
  `,
})
export class TourPage {
  private readonly router = inject(Router);
  protected onFinish(): void {
    void this.router.navigate(['/']);
  }
}
