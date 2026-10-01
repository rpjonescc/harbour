import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { decideGate } from "@/lib/auth/gate";
import { getConfig } from "@/lib/config";
import { buildCsp } from "@/lib/security/csp";

export function proxy(request: NextRequest) {
  const settings = getConfig();
  const decision = decideGate(
    {
      headers: request.headers,
      pathname: request.nextUrl.pathname,
      hasSessionCookie: request.cookies.has(SESSION_COOKIE),
    },
    settings,
  );
  if (decision.kind === "forbid") return new NextResponse("Forbidden", { status: 403 });
  if (decision.kind === "unauthenticated") {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (decision.kind === "login") {
    return NextResponse.redirect(new URL("/login", settings.HARBOUR_ORIGIN));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, settings.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
