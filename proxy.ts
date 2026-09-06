import { NextResponse, type NextRequest } from "next/server"

import { auth } from "@/lib/auth"

// Route groups can't be matched directly, so list the (app) segment paths.
const PROTECTED_PREFIXES = [
  "/",
  "/profile",
  "/records",
  "/lookup",
  "/vehicles",
  "/audit",
  "/admin",
]
const AUTH_PAGES = ["/sign-in", "/verify"]

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      (prefix !== "/" && pathname.startsWith(`${prefix}/`))
  )
}

/**
 * Runs before rendering on the Node.js runtime. Performs a real Better Auth
 * session check against the database — defense in depth on top of the
 * per-page guards and per-action permission checks.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null)

  if (!session && isProtected(pathname)) {
    const signInUrl = new URL("/sign-in", request.url)
    return NextResponse.redirect(signInUrl)
  }

  if (session && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
    "/profile/:path*",
    "/records/:path*",
    "/lookup/:path*",
    "/vehicles/:path*",
    "/audit/:path*",
    "/admin/:path*",
    "/sign-in",
    "/verify",
  ],
}
