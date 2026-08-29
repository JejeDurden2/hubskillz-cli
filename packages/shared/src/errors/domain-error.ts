export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}
