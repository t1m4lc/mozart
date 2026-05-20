import { MzCodeEditor } from './lib/mz-code-editor';

export { MzCodeEditor } from './lib/mz-code-editor';
export type {
  CodeEditorLanguage,
  CodeEditorTheme,
} from './lib/mz-code-editor';

export const MzCodeEditorImports = [MzCodeEditor] as const;
