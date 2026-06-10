import { SITE_ORIGIN } from '../../../shell/seo';
import type { VerticalFaqEntry } from './vertical-config';

export { injectJsonLd } from '../../../shell/json-ld';

export const SOFTWARE_APPLICATION_LD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Mozart',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  url: SITE_ORIGIN,
};

export function faqPageLd(
  faq: readonly VerticalFaqEntry[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}
