import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectSeo } from '../../shell/seo';
import { RECRUITING_VERTICAL } from './_shared/data/recruiting.data';
import {
  faqPageLd,
  injectJsonLd,
  SOFTWARE_APPLICATION_LD,
} from './_shared/json-ld';
import { VerticalPageComponent } from './_shared/vertical-page.component';

@Component({
  selector: 'app-for-recruiting',
  imports: [VerticalPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-vertical-page [config]="config" />`,
})
export default class ForRecruitingPage {
  protected readonly config = RECRUITING_VERTICAL;

  constructor() {
    injectSeo()({
      title: this.config.metaTitle,
      description: this.config.metaDescription,
      path: '/for/recruiting',
      type: 'website',
    });
    const jsonLd = injectJsonLd();
    jsonLd('software', SOFTWARE_APPLICATION_LD);
    jsonLd('faq', faqPageLd(this.config.faq));
  }
}
