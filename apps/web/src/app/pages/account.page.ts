import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HlmAvatarImports } from '@spartan-ui/avatar';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmCardImports } from '@spartan-ui/card';
import { HlmTypographyImports } from '@spartan-ui/typography';
import { AuthFacade } from '../domains/auth';
import { WebTopBar } from '../shell/web-top-bar';

// /account — first destination page in apps/web. Reads the
// authenticated user from AuthFacade and surfaces profile +
// account-details + public metadata + a placeholder for future
// cloud features.
@Component({
  selector: 'app-account-page',
  imports: [
    WebTopBar,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmTypographyImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-web-top-bar />

    <main class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header class="mb-8">
        <h1 hlmH1 class="text-3xl">
          Welcome, {{ firstName() }}.
        </h1>
        <p hlmLead class="text-base">
          Your Mozart Cloud account.
        </p>
      </header>

      <div class="grid gap-6">
        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Profile</h2>
            <p hlmCardDescription>How you appear across Mozart.</p>
          </div>
          <div hlmCardContent class="flex items-center justify-between gap-4">
            @if (user(); as u) {
              <div class="flex min-w-0 items-center gap-4">
                <hlm-avatar class="size-16">
                  <img hlmAvatarImage [src]="u.imageUrl" [alt]="u.name || u.email" />
                  <span hlmAvatarFallback>{{ initials() }}</span>
                </hlm-avatar>
                <div class="flex min-w-0 flex-col">
                  <span class="text-foreground truncate text-base font-medium">
                    {{ u.name || u.email }}
                  </span>
                  <span class="text-muted-foreground truncate text-sm">
                    {{ u.email }}
                  </span>
                </div>
              </div>
              <a
                hlmBtn
                variant="outline"
                href="https://accounts.mozart.build"
                target="_blank"
                rel="noopener noreferrer"
              >
                Edit profile
              </a>
            }
          </div>
        </section>

        <section hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Account details</h2>
            <p hlmCardDescription>
              Fields supplied by your sign-in provider.
            </p>
          </div>
          <div hlmCardContent>
            @if (user(); as u) {
              <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div class="flex flex-col gap-0.5">
                  <dt class="text-muted-foreground text-xs uppercase tracking-wider">
                    First name
                  </dt>
                  <dd class="text-foreground text-sm">
                    {{ u.firstName || '—' }}
                  </dd>
                </div>
                <div class="flex flex-col gap-0.5">
                  <dt class="text-muted-foreground text-xs uppercase tracking-wider">
                    Last name
                  </dt>
                  <dd class="text-foreground text-sm">
                    {{ u.lastName || '—' }}
                  </dd>
                </div>
                <div class="flex flex-col gap-0.5">
                  <dt class="text-muted-foreground text-xs uppercase tracking-wider">
                    Email
                  </dt>
                  <dd class="text-foreground text-sm break-all">
                    {{ u.email || '—' }}
                  </dd>
                </div>
                <div class="flex flex-col gap-0.5">
                  <dt class="text-muted-foreground text-xs uppercase tracking-wider">
                    Onboarding
                  </dt>
                  <dd class="text-foreground text-sm">
                    <span hlmBadge [variant]="u.onboarding ? 'default' : 'secondary'">
                      {{ u.onboarding ? 'Completed' : 'Pending' }}
                    </span>
                  </dd>
                </div>
              </dl>
            }
          </div>
        </section>

      </div>
    </main>
  `,
})
export class AccountPage {
  private readonly auth = inject(AuthFacade);
  protected readonly user = this.auth.user;

  protected readonly firstName = computed(
    () => this.user()?.firstName || 'there',
  );

  protected readonly initials = computed(() => {
    const u = this.user();
    if (!u) return '?';
    const first = u.firstName?.[0] ?? '';
    const last = u.lastName?.[0] ?? '';
    const combined = (first + last).toUpperCase();
    return combined || u.email[0]?.toUpperCase() || '?';
  });
}
