import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SITE_CONFIG } from './site-config';

@Component({
  selector: 'app-promo-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (config.enabled) {
      <a
        data-marketing-promo-strip="true"
        [href]="config.href"
        class="bg-foreground text-background hover:bg-foreground/90 block px-4 py-2 text-center text-sm transition-colors"
      >
        {{ config.label }}
      </a>
    }
  `,
})
export class PromoStripComponent {
  protected readonly config = SITE_CONFIG.promoStrip;
}
