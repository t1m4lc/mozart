import { memoize } from './util-memoize';

describe('memoize() decorator', () => {
  it('caches results keyed by the first argument (object)', () => {
    const calls: number[] = [];
    class Host {
      @memoize()
      double(node: { id: string }): number {
        calls.push(1);
        return node.id.length * 2;
      }
    }
    const host = new Host();
    const n = { id: 'abc' };

    expect(host.double(n)).toBe(6);
    expect(host.double(n)).toBe(6);
    expect(host.double(n)).toBe(6);
    expect(calls.length).toBe(1);
  });

  it('caches results keyed by primitive args via Map', () => {
    const calls: number[] = [];
    class Host {
      @memoize()
      square(n: number): number {
        calls.push(1);
        return n * n;
      }
    }
    const host = new Host();

    expect(host.square(7)).toBe(49);
    expect(host.square(7)).toBe(49);
    expect(host.square(3)).toBe(9);
    expect(host.square(3)).toBe(9);
    expect(calls.length).toBe(2);
  });

  it('uses a per-instance cache (no leakage across hosts)', () => {
    const calls: string[] = [];
    class Host {
      constructor(private readonly tag: string) {}
      @memoize()
      tagFor(node: { id: string }): string {
        calls.push(this.tag);
        return `${this.tag}:${node.id}`;
      }
    }
    const h1 = new Host('a');
    const h2 = new Host('b');
    const n = { id: 'x' };

    expect(h1.tagFor(n)).toBe('a:x');
    expect(h2.tagFor(n)).toBe('b:x');
    expect(h1.tagFor(n)).toBe('a:x');
    expect(h2.tagFor(n)).toBe('b:x');
    // Each host saw the method body run exactly once for `n`.
    expect(calls).toEqual(['a', 'b']);
  });

  it('treats distinct object references as distinct cache keys', () => {
    const calls: number[] = [];
    class Host {
      @memoize()
      idLen(node: { id: string }): number {
        calls.push(1);
        return node.id.length;
      }
    }
    const host = new Host();
    const n1 = { id: 'abc' };
    const n2 = { id: 'abc' }; // structurally identical, different ref

    expect(host.idLen(n1)).toBe(3);
    expect(host.idLen(n2)).toBe(3);
    expect(calls.length).toBe(2);
  });

  it('preserves later arguments (memoization keys on the first only)', () => {
    const calls: Array<[number, number]> = [];
    class Host {
      @memoize()
      add(a: number, b: number): number {
        calls.push([a, b]);
        return a + b;
      }
    }
    const host = new Host();

    expect(host.add(1, 2)).toBe(3);
    // Same first arg → returns CACHED result (which used b=2), even
    // though b changed. This is documented behavior: memoize only
    // keys on args[0]. Callers needing full-arg keying compose a
    // string key themselves.
    expect(host.add(1, 9)).toBe(3);
    expect(calls.length).toBe(1);
  });
});
