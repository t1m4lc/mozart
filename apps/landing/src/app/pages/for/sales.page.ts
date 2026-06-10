import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectSeo } from '../../shell/seo';
import { SALES_VERTICAL } from './_shared/data/sales.data';
import {
  faqPageLd,
  injectJsonLd,
  SOFTWARE_APPLICATION_LD,
} from './_shared/json-ld';
import { VerticalPageComponent } from './_shared/vertical-page.component';

@Component({
  selector: 'app-for-sales',
  imports: [VerticalPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-vertical-page [config]="config" />`,
})
export default class ForSalesPage {
  protected readonly config = SALES_VERTICAL;

  constructor() {
    injectSeo()({
      title: this.config.metaTitle,
      description: this.config.metaDescription,
      path: '/for/sales',
      type: 'website',
    });
    const jsonLd = injectJsonLd();
    jsonLd('software', SOFTWARE_APPLICATION_LD);
    jsonLd('faq', faqPageLd(this.config.faq));
  }
}
