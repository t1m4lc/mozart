#!/usr/bin/env node
// Ping IndexNow (Bing, Yandex, and other participating engines) with the live
// sitemap URLs after a deploy, so search/AI surfaces that lean on Bing pick up
// changes within minutes instead of waiting for an organic crawl.
//
// Ownership is proven by public/<KEY>.txt being served at the site root.
// Non-fatal by design: a failed ping must never break the deploy.

import { readFile } from 'node:fs/promises';

const KEY = '42d94c6d5c6e9cfb9570c312f8887c2f';
const HOST = 'mozart.build';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const sitemapPath = process.argv[2] ?? 'dist/sitemap.xml';

async function main() {
  let xml;
  try {
    xml = await readFile(sitemapPath, 'utf8');
  } catch (err) {
    console.warn(`submit-indexnow: cannot read ${sitemapPath} (${err.code}); skipping`);
    return;
  }

  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.warn('submit-indexnow: no <loc> URLs found; skipping');
    return;
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    console.log(
      `submit-indexnow: POST ${urlList.length} URLs → ${res.status} ${res.statusText}`,
    );
  } catch (err) {
    console.warn(`submit-indexnow: ping failed (${err.message}); skipping`);
  }
}

await main();
