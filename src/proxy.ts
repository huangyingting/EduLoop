import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/auth-validation";

export async function proxy(request: NextRequest) {
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (user?.hasCurrentConsent) return NextResponse.next();
  if (user && ["/consent", "/privacy"].includes(request.nextUrl.pathname)) return NextResponse.next();
  if (user) {
    const consent = new URL("/consent", request.nextUrl);
    consent.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(consent);
  }
  if (request.nextUrl.pathname === "/practice" || request.nextUrl.pathname.startsWith("/practice/")) {
    return NextResponse.next();
  }

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
    "/((?!api|login(?:/|$)|register(?:/|$)|forgot-password(?:/|$)|reset-password(?:/|$)|verify-email(?:/|$)|privacy-policy(?:/|$)|terms(?:/|$)|_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};
