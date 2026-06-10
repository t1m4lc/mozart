import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectSeo } from '../../shell/seo';
import { MARKETING_VERTICAL } from './_shared/data/marketing.data';
import {
  faqPageLd,
  injectJsonLd,
  SOFTWARE_APPLICATION_LD,
} from './_shared/json-ld';
import { VerticalPageComponent } from './_shared/vertical-page.component';

@Component({
  selector: 'app-for-marketing',
  imports: [VerticalPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-vertical-page [config]="config" />`,
})
export default class ForMarketingPage {
  protected readonly config = MARKETING_VERTICAL;

  constructor() {
    injectSeo()({
      title: this.config.metaTitle,
      description: this.config.metaDescription,
      path: '/for/marketing',
      type: 'website',
    });
    const jsonLd = injectJsonLd();
    jsonLd('software', SOFTWARE_APPLICATION_LD);
    jsonLd('faq', faqPageLd(this.config.faq));
  }
}
