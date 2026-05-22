import { TestBed } from '@angular/core/testing';
import { WorkspaceTabRegistry } from './workspace-tab-registry';

// Focused tests on the security-adjacent surface: path normalization
// rejections + base64 round-trip. Full route-resolver behavior lives
// in `workspace-tab-resolver.service.spec.ts` (deferred).

describe('WorkspaceTabRegistry', () => {
  let registry: WorkspaceTabRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(WorkspaceTabRegistry);
  });

  describe('chatTabId / parse round-trip', () => {
    it('round-trips a UUID-shaped chat id', () => {
      const chatId = 'abc-123_def.456';
      const tabId = registry.chatTabId(chatId);
      const parsed = registry.parse(tabId);
      expect(parsed?.kind).toBe('chat');
      expect(parsed?.kind === 'chat' && parsed.chatId).toBe(chatId);
    });
  });

  describe('fileTabId / parse round-trip', () => {
    it('round-trips a workspace-relative path with mixed casing', () => {
      const path = 'src/lib/foo.ts';
      const tabId = registry.fileTabId(path);
      expect(tabId).not.toBeNull();
      const parsed = registry.parse(tabId!);
      expect(parsed?.kind).toBe('file');
      expect(parsed?.kind === 'file' && parsed.path).toBe(path);
    });

    it('round-trips a path with non-ASCII characters via UTF-8 base64url', () => {
      const path = 'docs/résumé.md';
      const tabId = registry.fileTabId(path);
      expect(tabId).not.toBeNull();
      const parsed = registry.parse(tabId!);
      expect(parsed?.kind === 'file' && parsed.path).toBe(path);
    });
  });

  describe('fileTabId path-traversal guards', () => {
    it('rejects parent-segment traversal (..)', () => {
      expect(registry.fileTabId('../etc/passwd')).toBeNull();
      expect(registry.fileTabId('src/../../etc/passwd')).toBeNull();
    });

    it('rejects current-segment (.)', () => {
      expect(registry.fileTabId('./foo')).toBeNull();
      expect(registry.fileTabId('src/./foo')).toBeNull();
    });

    it('rejects absolute Unix paths', () => {
      expect(registry.fileTabId('/etc/passwd')).toBeNull();
    });

    it('rejects UNC-style paths (//host/share)', () => {
      expect(registry.fileTabId('//host/share/foo')).toBeNull();
    });

    it('rejects Windows drive-letter paths', () => {
      expect(registry.fileTabId('C:/Users/foo')).toBeNull();
      expect(registry.fileTabId('c:\\Users\\foo')).toBeNull();
    });

    it('rejects null bytes', () => {
      expect(registry.fileTabId('src/foo\0.ts')).toBeNull();
    });

    it('rejects empty input', () => {
      expect(registry.fileTabId('')).toBeNull();
      expect(registry.fileTabId('   ')).toBeNull();
    });
  });

  describe('parse rejections', () => {
    it('returns null for malformed file payload (invalid base64)', () => {
      expect(registry.parse('file:!!!not-base64!!!')).toBeNull();
    });

    it('returns null for tabIds without a kind separator', () => {
      expect(registry.parse('default')).toBeNull();
      expect(registry.parse('chatNoColon')).toBeNull();
    });

    it('returns null for unknown kinds', () => {
      expect(registry.parse('mystery:payload')).toBeNull();
    });

    it('returns null for empty payload', () => {
      expect(registry.parse('chat:')).toBeNull();
      expect(registry.parse('file:')).toBeNull();
    });

    it('returns null when a file payload decodes to a forbidden path', () => {
      // base64url-encode '..' to hit the post-decode normalizer guard.
      // 'Li4=' is base64('..'); base64url strips the '=' padding.
      expect(registry.parse('file:Li4')).toBeNull();
    });

    it('rejects chat ids with disallowed characters', () => {
      expect(registry.parse('chat:has space')).toBeNull();
      expect(registry.parse('chat:has/slash')).toBeNull();
    });
  });
});
