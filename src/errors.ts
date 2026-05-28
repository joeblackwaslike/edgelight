export class EdgeLiteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteParseError';
  }
}

export class EdgeLiteCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteCompileError';
  }
}

export class EdgeLiteRuntimeError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EdgeLiteRuntimeError';
    this.cause = cause;
  }
}

export class EdgeLiteSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteSchemaError';
  }
}

export class EdgeLiteConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgeLiteConcurrencyError';
  }
}
