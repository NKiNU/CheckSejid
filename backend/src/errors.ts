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

// SEC-003 / ADR-026 §3: name, code, first message line and stack frames only. Prisma appends the call's
// arguments to its message (e.g. a password hash), so the rest of the message is never logged.
export function safeErrorLog(err: unknown) {
  const e = (typeof err === "object" && err) as { name?: string; code?: unknown; message?: unknown; stack?: string } | false;
  if (!e) return `Error: ${String(err).split("\n")[0]}`;
  const frames = (e.stack ?? "").split("\n").filter((l) => /^\s+at /.test(l));
  const code = typeof e.code === "string" ? ` [${e.code}]` : "";
  return [`${e.name ?? "Error"}${code}: ${String(e.message ?? "").split("\n")[0]}`, ...frames].join("\n");
}

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
  // Only body-parser errors (identified by `type`, e.g. "entity.parse.failed", "entity.too.large")
  // are relabelled; any other error falls through to 500 rather than being trusted as a 4xx.
  if (typeof err?.type === "string" && typeof err.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: "BAD_REQUEST", message: "Malformed request" } });
    return;
  }
  // Never echo internal error details to the client.
  console.error(safeErrorLog(err));
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};
