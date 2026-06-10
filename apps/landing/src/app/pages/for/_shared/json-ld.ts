import { DOCUMENT, inject } from '@angular/core';
import { SITE_ORIGIN } from '../../../shell/seo';
import type { VerticalFaqEntry } from './vertical-config';

// Mirrors injectSeo(): runs in page constructors so the structured data is
// baked into the prerendered HTML. Upserts by id to stay idempotent across
// client-side navigations between vertical pages.
export function injectJsonLd(): (
  id: string,
  data: Record<string, unknown>,
) => void {
  const document = inject(DOCUMENT);

  return (id: string, data: Record<string, unknown>) => {
    const scriptId = `ldjson-${id}`;
    let script = document.head.querySelector<HTMLScriptElement>(
      `script#${scriptId}`,
    );
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  };
}

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
