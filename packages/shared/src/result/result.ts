import type { DomainError } from "../errors/domain-error";

export class Result<T, E extends DomainError = DomainError> {
  private constructor(
    private readonly _value: T | null,
    private readonly _error: E | null,
  ) {}

  static ok<T>(value: T): Result<T, DomainError> {
    return new Result<T, DomainError>(value, null);
  }

  static fail<E extends DomainError>(error: E): Result<never, E> {
    return new Result<never, E>(null, error);
  }

  get isSuccess(): boolean {
    return this._error === null;
  }

  get isFailure(): boolean {
    return this._error !== null;
  }

  get value(): T {
    if (this._error !== null) {
      throw new Error("Cannot access value of a failed Result");
    }
    // SAFETY: the constructor only sets _error to null when Result.ok(value)
    // stored value in _value, so a null _error guarantees _value holds T.
    return this._value as T;
  }

  get error(): E {
    if (this._error === null) {
      throw new Error("Cannot access error of a successful Result");
    }
    // SAFETY: the constructor only sets _error to a non-null E via
    // Result.fail(error), so a non-null _error is always that E.
    return this._error as E;
  }
}
