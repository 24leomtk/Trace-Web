import * as z from "zod"

/**
 * An error that should be surfaced to the API client with a specific HTTP
 * status. Anything else thrown inside a route handler is logged and returned
 * as a generic 500.
 */
export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

/**
 * Maps the user-facing error messages thrown by the server actions
 * (lib/actions/*) to HTTP statuses. Those messages are written for end
 * users, so mobile clients can display them as-is.
 */
const ACTION_ERROR_RULES: Array<{ status: number; pattern: RegExp }> = [
  { status: 401, pattern: /must be signed in/i },
  { status: 422, pattern: /didn't pass validation|meaningful reason/i },
  {
    status: 404,
    pattern: /wasn't found|could not be found|not found|isn't valid/i,
  },
  {
    status: 403,
    pattern:
      /only monitors|only officers|monitors only|only system administrators|don't have access|outside your (scope|branch|district)|your role can't|your role does not|locked to|police users|police only|registrars only|insurer portal users only|court liaisons only|api key/i,
  },
]

function statusForMessage(message: string): number | null {
  for (const rule of ACTION_ERROR_RULES) {
    if (rule.pattern.test(message)) return rule.status
  }
  return null
}

export function jsonError(
  status: number,
  message: string,
  details?: unknown
): Response {
  return Response.json(
    details === undefined ? { error: message } : { error: message, details },
    { status }
  )
}

/**
 * Wraps a route handler so it can return plain data (or throw) instead of
 * hand-rolling Response objects:
 *
 *   - returned data  -> 200 with a JSON body (`undefined` -> `{ ok: true }`)
 *   - ApiError       -> its status + `{ error }` (+ `details` when present)
 *   - action Error   -> classified status + `{ error }` with the message
 *   - anything else  -> 500 with a generic message (full error logged)
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<unknown>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      const data = await handler(...args)
      return Response.json(data === undefined ? { ok: true } : data)
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.status, error.message, error.details)
      }
      if (error instanceof z.ZodError) {
        return jsonError(422, "The request didn't pass validation.", {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        })
      }
      const message =
        error instanceof Error ? error.message : "Unexpected server error."
      const status = statusForMessage(message)
      if (status !== null) return jsonError(status, message)
      console.error("[api] unhandled error:", error)
      return jsonError(500, "Something went wrong on the server.")
    }
  }
}

/** Parses the request body as JSON, throwing a 400 ApiError when malformed. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, "The request body must be valid JSON.")
  }
}

/** Validates `input` against `schema`, throwing a 422 ApiError with per-field
 * issues when it doesn't match. Generic over the schema itself so unions of
 * schemas (e.g. recordSchemas) work too. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown
): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ApiError(422, "The request didn't pass validation.", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    })
  }
  return result.data as z.output<S>
}

/** Reads the query string of a request into a plain string record, ready for
 * a zod schema with z.coerce fields. */
export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams)
}
