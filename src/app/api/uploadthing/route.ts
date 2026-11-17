import { NextResponse } from "next/server";
import sharp from "sharp";
import { UTApi } from "uploadthing/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createServerConvexClient, extractForwardedAuthEnvelope } from "@/lib/convexHttp";

export const runtime = "nodejs";

const MAX_WEBP_BYTES = 1_048_576;
const MAX_REQUEST_BYTES = MAX_WEBP_BYTES + 16_384;
const MAX_DIMENSION = 1_440;

async function readMultipart(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return { error: "A multipart image request is required.", status: 415 } as const;
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: "Missing image request body.", status: 400 } as const;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { error: "Image exceeds the 1 MB limit.", status: 413 } as const;
      }
      chunks.push(chunk.value);
    }
    const payload = new Uint8Array(Buffer.concat(chunks, bytes));
    const form = await new Response(payload, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    return { form } as const;
  } catch {
    return { error: "Invalid multipart image request.", status: 400 } as const;
  } finally {
    reader.releaseLock();
  }
}

async function decodeWebP(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const decoder = sharp(input, { limitInputPixels: MAX_DIMENSION ** 2, failOn: "warning" });
  const { format, width, height, pages } = await decoder.metadata();
  if (format !== "webp" || !width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION ||
      (pages ?? 1) !== 1) return null;
  const sanitized = await decoder.webp({ quality: 82 }).toBuffer();
  return { sanitized, width, height };
}

export async function POST(request: Request) {
  const authEnvelope = await extractForwardedAuthEnvelope(request);
  if (!authEnvelope.sessionToken && !authEnvelope.demoShortCode) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  const serverSecret = process.env.KSUX_SERVER_SECRET;
  const uploadToken = process.env.UPLOADTHING_TOKEN?.trim();
  if (!serverSecret || (!uploadToken && process.env.NODE_ENV === "production" && !authEnvelope.demoShortCode)) {
    return NextResponse.json({ error: "Image upload is unavailable." }, { status: 503 });
  }

  const parsed = await readMultipart(request);
  if (!parsed.form) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const file = parsed.form.get("file");
  const purpose = parsed.form.get("purpose") ?? "post";
  if (!(file instanceof File) || file.type !== "image/webp" ||
      (purpose !== "avatar" && purpose !== "post" && purpose !== "listing" && purpose !== "chat")) {
    return NextResponse.json({ error: "A still WebP file and valid upload purpose are required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_WEBP_BYTES) {
    return NextResponse.json({ error: "Image exceeds the 1 MB limit." }, { status: 413 });
  }
  const image = await decodeWebP(file).catch(() => null);
  if (!image) return NextResponse.json({ error: "Invalid WebP image or dimensions above 1440px." }, { status: 400 });
  if (image.sanitized.length > MAX_WEBP_BYTES) {
    return NextResponse.json({ error: "Encoded image exceeds the 1 MB limit." }, { status: 413 });
  }

  const { sanitized, width, height } = image;
  const byteSize = sanitized.length;
  const client = createServerConvexClient();
  let reservationId: Id<"uploadReservations"> | undefined;
  let fileKey: string | undefined;
  try {
    reservationId = await client.mutation(api.uploads.reserveUpload, {
      ...authEnvelope, purpose, byteSize, width, height, serverSecret,
    });
    let url: string;
    if (uploadToken) {
      const storage = new UTApi({ token: uploadToken });
      const uploaded = await storage.uploadFiles(new File([new Uint8Array(sanitized)], "campus-image.webp", { type: "image/webp" }));
      if (!uploaded.data) throw new Error("Image storage rejected the file.");
      fileKey = uploaded.data.key;
      url = uploaded.data.ufsUrl || uploaded.data.url;
    } else {
      fileKey = `local-inline:${crypto.randomUUID()}`;
      url = `data:image/webp;base64,${sanitized.toString("base64")}`;
    }
    const mediaAssetId = await client.mutation(api.uploads.registerMediaAsset, {
      ...authEnvelope, reservationId, fileKey, url, serverSecret,
    });
    return NextResponse.json({ mediaAssetId, fileKey, url, width, height, byteSize });
  } catch (error) {
    if (reservationId) {
      try {
        await client.mutation(api.uploads.abandonUpload, { reservationId, fileKey, serverSecret });
      } catch {
        console.error("Could not enqueue cleanup for a failed media upload");
      }
    }
    const detail = (error as { data?: { code?: string; message?: string } })?.data;
    const status = detail?.code === "UNAUTHENTICATED" ? 401 : detail?.code === "QUOTA_EXCEEDED" ? 429 : 502;
    return NextResponse.json({ error: detail?.message ?? "The image could not be saved." }, { status });
  }
}
