import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

// SPEC-GAP: API_STANDARDS.md requires "predictable errors" but defines no shape.
// Every error response is `{ error: { code, message, details? } }` until a spec says otherwise.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Resource not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry a 4xx status
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: "BAD_REQUEST", message: "Malformed request" } });
    return;
  }
  // Never echo internal error details to the client.
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};
