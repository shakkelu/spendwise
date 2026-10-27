export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ApiError(400, `Invalid ${label}.`);
  }
  return value.trim();
}
