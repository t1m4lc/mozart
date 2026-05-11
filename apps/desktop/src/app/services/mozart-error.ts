/**
 * Typed error class surfaced by `BindingsService` and re-thrown by every
 * IPC wrapper method.
 *
 * `kind` mirrors `AppError` from `apps/desktop/src-tauri/src/error.rs`.
 * The extra `'Validation'` kind is overloaded for *Angular-side* zod
 * parse failures (the Rust enum has a `Validation` variant too — both
 * map to the same UX behaviour: "the payload was unexpected").
 *
 * `recovery` is a one-shot hint the UI may render below the error
 * message (e.g. "Open Settings → Claude CLI" when `kind === 'AgentSpawn'`).
 */
import type { AppErrorDto, AppErrorKind } from '../shared/schemas/bindings.schemas';

export class MozartError extends Error {
  readonly kind: AppErrorKind;
  readonly recovery?: string;

  constructor(kind: AppErrorKind, message: string, recovery?: string) {
    super(message);
    // Without this the prototype chain breaks under ES5 down-leveling
    // and `instanceof MozartError` silently returns false in catch
    // blocks. Cheap insurance.
    Object.setPrototypeOf(this, MozartError.prototype);
    this.name = 'MozartError';
    this.kind = kind;
    this.recovery = recovery;
  }

  /**
   * Build a `MozartError` from an `AppError` DTO that crossed the IPC
   * boundary. Attaches a contextual recovery hint when applicable.
   */
  static fromAppError(e: AppErrorDto): MozartError {
    const recovery =
      e.kind === 'AgentSpawn' ? 'Open Settings → Claude CLI' : undefined;
    return new MozartError(e.kind, e.message, recovery);
  }
}
