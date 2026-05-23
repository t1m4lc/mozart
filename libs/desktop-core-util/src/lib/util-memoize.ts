// Method-level memoization decorator.
//
// Used for methods that are called repeatedly from templates
// (CdkTree childrenAccessor, trackBy helpers, pipe-style format
// helpers) where the result depends purely on the arguments and
// re-running the body on every change-detection pass is wasteful.
//
// References (cited in the perf commit that introduced this util):
//   - https://medium.com/@bansal.suneet/memo-decorator-with-angular-pipe-big-performance-boost-73f94b5c728a
//   - https://angular.dev/best-practices/slow-computations
//
// Design:
//   - One cache PER INSTANCE (stored under a Symbol on `this`), so a
//     destroyed component's cache is collected with the component.
//     The Medium article shares a single class-level cache, which
//     leaks across instances in a long-running SPA — we don't.
//   - Keyed by the FIRST argument. Object args use a `WeakMap`
//     (auto-clears when the node itself is GC'd, e.g. after a tree
//     refetch); primitive args use a `Map`.
//   - Methods with multiple arguments fall back to first-arg keying.
//     Callers that need full-arg memoization should compose a
//     `${arg1}|${arg2}` string and pass it as the first arg.
//
// Caveats:
//   - The decorated method must be PURE w.r.t. its first arg. Reading
//     signal state inside it breaks the memoization invariant — that
//     state can change without the arg changing, and the stale
//     cached value will be returned. Use `computed()` for state-
//     dependent values; reach for `@memoize()` only for pure helpers.

const CACHE = Symbol('memoize-cache');

type AnyMap = Map<unknown, unknown> | WeakMap<object, unknown>;

interface MemoizedHost {
  [CACHE]?: Map<string | symbol, AnyMap>;
}

export function memoize(): MethodDecorator {
  return function (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    if (typeof original !== 'function') return descriptor;

    descriptor.value = function (this: MemoizedHost, ...args: unknown[]) {
      const key = args[0];
      const root = (this[CACHE] ??= new Map<string | symbol, AnyMap>());
      let cache = root.get(propertyKey);
      const usesWeakMap = typeof key === 'object' && key !== null;
      if (!cache) {
        cache = usesWeakMap
          ? new WeakMap<object, unknown>()
          : new Map<unknown, unknown>();
        root.set(propertyKey, cache);
      }
      // Both Map and WeakMap expose .has/.get/.set with the same
      // signatures we need — the cast keeps TS quiet without runtime
      // cost.
      const c = cache as Map<unknown, unknown>;
      if (c.has(key)) return c.get(key);
      const result = original.apply(this, args);
      c.set(key, result);
      return result;
    };
    return descriptor;
  };
}
