import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { applicationAuthSecret } from "@/lib/auth-secret";
import { safeReturnPath } from "@/lib/auth-validation";

const AUTH_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

// Pages a visitor can open without an account. Everything else redirects to
// login; API routes enforce their own authorization.
const PUBLIC_PATHS = new Set(["/", "/practice", "/opengraph-image", "/unsubscribe", "/offline"]);

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/practice/");
}

export async function proxy(request: NextRequest) {
  const secret = applicationAuthSecret();
  if (!secret) throw new Error("A valid AUTH_SECRET is required in production.");
  const token = await getToken({
    req: request,
    secret,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: AUTH_SESSION_COOKIE,
    salt: AUTH_SESSION_COOKIE,
  });

  if (token?.hasCurrentConsent) return NextResponse.next();
  if (token && ["/consent", "/privacy"].includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (token) {
    const consent = new URL("/consent", request.nextUrl);
    consent.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(consent);
  }
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const login = new URL("/login", request.nextUrl);
  login.searchParams.set(
    "next",
    request.nextUrl.pathname === "/consent"
      ? safeReturnPath(request.nextUrl.searchParams.get("next"))
      : `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!api|login(?:/|$)|register(?:/|$)|forgot-password(?:/|$)|reset-password(?:/|$)|verify-email(?:/|$)|change-email(?:/|$)|privacy-policy(?:/|$)|terms(?:/|$)|_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};