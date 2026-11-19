import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UTApi } from "uploadthing/server";
import { api } from "@convex/_generated/api";
import { createServerConvexClient, extractForwardedAuthEnvelope } from "@/lib/convexHttp";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const auth = await extractForwardedAuthEnvelope(request);
  const serverSecret = process.env.KSUX_SERVER_SECRET;
  if (!serverSecret || !auth.sessionToken && !auth.demoShortCode) return new Response("Unavailable", { status: 403, headers });
  try {
    const { incidentId, review = false } = await request.json();
    const client = createServerConvexClient({ fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) }) });
    const args = { ...auth, incidentId, review, serverSecret };
    const access = await client.query(api.incidents.photoAccess, args);
    if (!access) return new Response("Photo unavailable", { status: 404, headers });
    if (access.fixture) {
      const bytes = await readFile(path.join(process.cwd(), "public", access.fixture));
      return new Response(bytes, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
    }
    const token = process.env.UPLOADTHING_TOKEN?.trim();
    if (!token || !access.fileKey) return new Response("Photo unavailable", { status: 503, headers });
    const { ufsUrl } = await new UTApi({ token }).generateSignedURL(access.fileKey, { expiresIn: 60 });
    const source = await fetch(ufsUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!source.ok) throw new Error("Storage unavailable");
    const image = sharp(Buffer.from(await source.arrayBuffer()), { limitInputPixels: 1440 ** 2 });
    // Blur delivered pixels; no storage URL or original bytes reach a Student.
    const bytes = await (access.blurred ? image.blur(24) : image).webp({ quality: 82 }).toBuffer();
    const current = await client.query(api.incidents.photoAccess, args);
    if (JSON.stringify(current) !== JSON.stringify(access)) return new Response("Photo changed. Refresh to retry.", { status: 409, headers });
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return new Response("Photo unavailable. Refresh to retry.", { status: 403, headers });
  }
}
