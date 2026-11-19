import { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "ksux_session";

export function createServerConvexClient(options?: { fetch?: typeof fetch }): ConvexHttpClient {
  const url =
    process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
  return new ConvexHttpClient(url, options);
}

export async function extractForwardedAuthEnvelope(request: Request): Promise<{
  sessionToken?: string;
  demoShortCode?: string;
  demoPersonaHandle?: string;
}> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
  const demoShortCode = request.headers
    .get("x-ksux-demo-session")
    ?.trim()
    .toLowerCase();
  const demoPersonaHandle = request.headers
    .get("x-ksux-demo-persona")
    ?.trim()
    .toLowerCase();

  // Demo headers take precedence when explicitly sent by a Judge Demo Mode tab
  if (demoShortCode) {
    return {
      demoShortCode,
      demoPersonaHandle: demoPersonaHandle || "maya_cs",
    };
  }

  if (cookieToken) {
    return {
      sessionToken: cookieToken,
    };
  }

  return {};
}
