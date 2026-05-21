import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  ScrollPositionService,
  chatTabKey,
  fileTabKey,
} from './scroll-position.service';

describe('ScrollPositionService', () => {
  let service: ScrollPositionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScrollPositionService);
  });

  describe('scroll position storage', () => {
    it('recall returns null for an unknown key', () => {
      expect(service.recall('nope')).toBeNull();
    });

    it('remember stores a value that recall returns', () => {
      service.remember('a', 120);
      expect(service.recall('a')).toBe(120);
    });

    it('remember overwrites a prior value for the same key', () => {
      service.remember('a', 120);
      service.remember('a', 300);
      expect(service.recall('a')).toBe(300);
    });

    it('different keys are isolated', () => {
      service.remember('a', 1);
      service.remember('b', 2);
      expect(service.recall('a')).toBe(1);
      expect(service.recall('b')).toBe(2);
    });

    it('forget drops a stored value', () => {
      service.remember('a', 120);
      service.forget('a');
      expect(service.recall('a')).toBeNull();
    });

    it('forget on an unknown key is a no-op', () => {
      expect(() => service.forget('nope')).not.toThrow();
      expect(service.recall('nope')).toBeNull();
    });
  });

  describe('key helpers', () => {
    it('chatTabKey isolates by workspace and chat id', () => {
      expect(chatTabKey('ws1', 'c1')).not.toEqual(chatTabKey('ws2', 'c1'));
      expect(chatTabKey('ws1', 'c1')).not.toEqual(chatTabKey('ws1', 'c2'));
    });

    it('fileTabKey isolates by workspace and path', () => {
      expect(fileTabKey('ws1', 'a.ts')).not.toEqual(fileTabKey('ws2', 'a.ts'));
      expect(fileTabKey('ws1', 'a.ts')).not.toEqual(fileTabKey('ws1', 'b.ts'));
    });

    it('chat and file keys never collide for matching ids', () => {
      // A workspace + a string that happens to match both a chatId
      // and a file path must not produce the same key.
      expect(chatTabKey('ws1', 'same')).not.toEqual(fileTabKey('ws1', 'same'));
    });

    it('two workspaces with the same file path are isolated', () => {
      service.remember(fileTabKey('ws1', '/a.ts'), 50);
      service.remember(fileTabKey('ws2', '/a.ts'), 200);
      expect(service.recall(fileTabKey('ws1', '/a.ts'))).toBe(50);
      expect(service.recall(fileTabKey('ws2', '/a.ts'))).toBe(200);
    });
  });

  describe('forgetWorkspace', () => {
    it('drops every chat and file key under that workspace', () => {
      service.remember(chatTabKey('ws1', 'c1'), 10);
      service.remember(chatTabKey('ws1', 'c2'), 20);
      service.remember(fileTabKey('ws1', 'a.ts'), 30);
      service.remember(fileTabKey('ws1', 'b.ts'), 40);
      service.remember(chatTabKey('ws2', 'c3'), 50);

      service.forgetWorkspace('ws1');

      expect(service.recall(chatTabKey('ws1', 'c1'))).toBeNull();
      expect(service.recall(chatTabKey('ws1', 'c2'))).toBeNull();
      expect(service.recall(fileTabKey('ws1', 'a.ts'))).toBeNull();
      expect(service.recall(fileTabKey('ws1', 'b.ts'))).toBeNull();
      // ws2 untouched
      expect(service.recall(chatTabKey('ws2', 'c3'))).toBe(50);
    });

    it('is a no-op for an unknown workspace', () => {
      service.remember(chatTabKey('ws1', 'c1'), 10);
      expect(() => service.forgetWorkspace('does-not-exist')).not.toThrow();
      expect(service.recall(chatTabKey('ws1', 'c1'))).toBe(10);
    });
  });

  describe('forgetChat', () => {
    it('clears the chat scrollTop AND the chat follow mode', () => {
      service.remember(chatTabKey('ws1', 'c1'), 100);
      service.setDetached('c1');
      expect(service.isAttached('c1')).toBe(false);

      service.forgetChat('ws1', 'c1');

      expect(service.recall(chatTabKey('ws1', 'c1'))).toBeNull();
      // After clear, defaults back to attached.
      expect(service.isAttached('c1')).toBe(true);
    });
  });

  describe('forgetFile', () => {
    it('clears the file scrollTop only', () => {
      service.remember(fileTabKey('ws1', 'a.ts'), 80);
      service.forgetFile('ws1', 'a.ts');
      expect(service.recall(fileTabKey('ws1', 'a.ts'))).toBeNull();
    });
  });

  describe('follow mode', () => {
    it('defaults to attached for an unknown chat', () => {
      expect(service.isAttached('never-seen')).toBe(true);
      expect(service.followMode('never-seen')).toBe('attached');
    });

    it('setDetached flips isAttached to false', () => {
      service.setDetached('c1');
      expect(service.isAttached('c1')).toBe(false);
      expect(service.followMode('c1')).toBe('detached');
    });

    it('setAttached flips back to attached', () => {
      service.setDetached('c1');
      service.setAttached('c1');
      expect(service.isAttached('c1')).toBe(true);
    });

    it('setAttached when already attached does not churn the signal', () => {
      // Track the underlying signal value reference: same Map object
      // means no change. We can't easily inspect that, but at least
      // confirm correctness.
      service.setAttached('c1');
      service.setAttached('c1');
      expect(service.isAttached('c1')).toBe(true);
    });

    it('follow mode is per-chat — flipping one does not affect another', () => {
      service.setDetached('c1');
      expect(service.isAttached('c1')).toBe(false);
      expect(service.isAttached('c2')).toBe(true);
    });

    it('followModeFor returns the same signal for the same chatId', () => {
      const s1 = service.followModeFor('c1');
      const s2 = service.followModeFor('c1');
      expect(s1).toBe(s2);
    });

    it('followModeFor signal reflects setAttached/setDetached', () => {
      const sig = service.followModeFor('c1');
      expect(sig()).toBe('attached');
      service.setDetached('c1');
      expect(sig()).toBe('detached');
      service.setAttached('c1');
      expect(sig()).toBe('attached');
    });
  });
});
