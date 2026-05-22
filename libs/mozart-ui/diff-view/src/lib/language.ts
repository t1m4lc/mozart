import type { Extension } from '@codemirror/state';

// Duplicated from @mozart-ui/code-editor's language.ts. Promoted to a
// shared @mozart-ui/codemirror-language lib once a third consumer
// shows up — until then duplication beats the extra dep.
export type DiffViewLanguage =
  | 'typescript'
  | 'javascript'
  | 'jsx'
  | 'tsx'
  | 'json'
  | 'css'
  | 'html'
  | 'markdown'
  | 'rust'
  | 'text';

const EXT_MAP: Record<string, DiffViewLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  rs: 'rust',
};

export function languageFromPath(path: string | null): DiffViewLanguage {
  if (!path) return 'text';
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'text';
  const ext = path.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? 'text';
}

export async function loadLanguageExtension(
  language: DiffViewLanguage,
): Promise<Extension | null> {
  switch (language) {
    case 'typescript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true });
    }
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true, jsx: true });
    }
    case 'jsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true });
    }
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    }
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown');
      return markdown();
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'text':
    default:
      return null;
  }
}
