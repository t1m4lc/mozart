export interface TocHeading {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
}

const MD_HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/gm;
const HTML_HEADING_RE =
  /<h([23])(?:\s[^>]*?\bid="([^"]+)")?[^>]*>([\s\S]*?)<\/h\1>/gi;

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function stripHtmlTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).trim();
}

export function extractHeadings(source: string | undefined): TocHeading[] {
  if (!source) return [];
  const looksLikeHtml = /<h[1-6][\s>]/i.test(source);
  return looksLikeHtml ? extractFromHtml(source) : extractFromMarkdown(source);
}

function extractFromHtml(html: string): TocHeading[] {
  const used = new Map<string, number>();
  const headings: TocHeading[] = [];
  let match: RegExpExecArray | null;
  HTML_HEADING_RE.lastIndex = 0;
  while ((match = HTML_HEADING_RE.exec(html)) !== null) {
    const level = Number(match[1]) as 2 | 3;
    const text = stripHtmlTags(match[3]);
    if (!text) continue;
    const id = match[2] ?? dedupe(slugifyHeading(text), used);
    headings.push({ id, text, level });
  }
  return headings;
}

function extractFromMarkdown(markdown: string): TocHeading[] {
  const used = new Map<string, number>();
  const headings: TocHeading[] = [];
  let match: RegExpExecArray | null;
  MD_HEADING_RE.lastIndex = 0;
  while ((match = MD_HEADING_RE.exec(markdown)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = decodeEntities(match[2].replace(/`([^`]+)`/g, '$1')).trim();
    const id = dedupe(slugifyHeading(text), used);
    headings.push({ id, text, level });
  }
  return headings;
}

function dedupe(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}
