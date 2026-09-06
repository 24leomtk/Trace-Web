export const dynamic = "force-dynamic"

/** Liveness/connectivity probe for mobile clients — no session required. */
export function GET() {
  return Response.json({
    ok: true,
    service: "chipatala-registry-api",
    version: 1,
    time: new Date().toISOString(),
  })
}
