import { DOCUMENT, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const SITE_ORIGIN = 'https://mozart.build';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/landing/social/og-default.png`;

export interface SeoMeta {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly type?: 'website' | 'article';
  readonly image?: string;
  readonly noindex?: boolean;
}

export function injectSeo(): (meta: SeoMeta) => void {
  const title = inject(Title);
  const meta = inject(Meta);
  const document = inject(DOCUMENT);

  return (entry: SeoMeta) => {
    const url = `${SITE_ORIGIN}${entry.path}`;
    const image = entry.image ?? DEFAULT_OG_IMAGE;
    const type = entry.type ?? 'website';

    title.setTitle(entry.title);
    upsertMeta(meta, { name: 'description', content: entry.description });
    upsertMeta(meta, { property: 'og:title', content: entry.title });
    upsertMeta(meta, { property: 'og:description', content: entry.description });
    upsertMeta(meta, { property: 'og:url', content: url });
    upsertMeta(meta, { property: 'og:type', content: type });
    upsertMeta(meta, { property: 'og:image', content: image });
    upsertMeta(meta, { name: 'twitter:title', content: entry.title });
    upsertMeta(meta, { name: 'twitter:description', content: entry.description });
    upsertMeta(meta, { name: 'twitter:image', content: image });
    upsertMeta(meta, { name: 'twitter:card', content: 'summary_large_image' });
    setCanonical(document, url);
    if (entry.noindex) {
      upsertMeta(meta, { name: 'robots', content: 'noindex,nofollow' });
    }
  };
}

function upsertMeta(
  meta: Meta,
  tag: { name?: string; property?: string; content: string },
): void {
  const selector = tag.name
    ? `name="${tag.name}"`
    : `property="${tag.property}"`;
  if (meta.getTag(selector)) {
    meta.updateTag(tag, selector);
  } else {
    meta.addTag(tag);
  }
}

function setCanonical(doc: Document, href: string): void {
  let link = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = doc.createElement('link');
    link.setAttribute('rel', 'canonical');
    doc.head.appendChild(link);
  }
  link.setAttribute('href', href);
}
