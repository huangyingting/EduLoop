import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await getSessionUser(request)) return NextResponse.next();

  const login = new URL("/login", request.nextUrl);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!api|practice(?:/|$)|login(?:/|$)|register(?:/|$)|forgot-password(?:/|$)|reset-password(?:/|$)|verify-email(?:/|$)|_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};
