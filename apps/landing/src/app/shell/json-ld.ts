import { DOCUMENT, inject } from '@angular/core';

// Mirrors injectSeo(): runs in page effects/constructors so the structured
// data is baked into the prerendered HTML. Upserts by id to stay idempotent
// across client-side navigations.
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

export interface BreadcrumbLdItem {
  readonly name: string;
  readonly url: string;
}

export function breadcrumbListLd(
  items: readonly BreadcrumbLdItem[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
