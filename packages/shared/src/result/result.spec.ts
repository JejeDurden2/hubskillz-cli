import { describe, expect, it } from "vitest";
import { DomainError } from "../errors/domain-error";
import { Result } from "./result";

class TestError extends DomainError {
  readonly code = "TEST_ERROR";
  readonly httpStatus = 400;
}

describe("Result", () => {
  it("carries the value on success", () => {
    const result = Result.ok(42);
    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.value).toBe(42);
  });

  it("carries the error on failure", () => {
    const error = new TestError("boom");
    const result = Result.fail(error);
    expect(result.isSuccess).toBe(false);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBe(error);
  });

  it("throws when reading value of a failed result", () => {
    const result = Result.fail(new TestError());
    expect(() => result.value).toThrow();
  });

  it("throws when reading error of a successful result", () => {
    const result = Result.ok(1);
    expect(() => result.error).toThrow();
  });
});
