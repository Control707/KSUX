import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";
import { api } from "@convex/_generated/api";
import {
  createServerConvexClient,
  extractForwardedAuthEnvelope,
} from "@/lib/convexHttp";

const MAX_WEBP_BYTES = 1_048_576; // 1 MB hard route cap

/**
 * Stateless media upload Route Handler.
 * Forwards session cookie or Judge Demo Mode headers directly to Convex `viewerContext`
 * (`uploads:authorizeUpload` + `uploads:registerMediaAsset`) with zero duplicated auth logic.
 */
export async function POST(request: Request) {
  const authEnvelope = await extractForwardedAuthEnvelope(request);
  if (!authEnvelope.sessionToken && !authEnvelope.demoShortCode) {
    return NextResponse.json(
      { error: "Authentication required to upload media." },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const purposeRaw = String(formData.get("purpose") ?? "post");
  const width = Number(formData.get("width") ?? 0);
  const height = Number(formData.get("height") ?? 0);

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing WebP image file." },
      { status: 400 }
    );
  }

  if (file.type !== "image/webp") {
    return NextResponse.json(
      { error: "Only client-encoded EXIF-stripped image/webp uploads are accepted." },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > MAX_WEBP_BYTES) {
    return NextResponse.json(
      { error: "Image exceeds 1 MB hard limit." },
      { status: 413 }
    );
  }

  const purpose = (
    ["avatar", "post", "listing", "chat"].includes(purposeRaw)
      ? purposeRaw
      : "post"
  ) as "avatar" | "post" | "listing" | "chat";

  const client = createServerConvexClient();

  try {
    // 1. Validate viewerContext & demoSessionId 20-upload quota before storage
    await client.query(api.uploads.authorizeUpload, {
      ...authEnvelope,
      purpose,
      byteSize: file.size,
      width,
      height,
    });

    let fileKey: string;
    let url: string;

    const uploadThingToken = process.env.UPLOADTHING_TOKEN?.trim();
    if (uploadThingToken) {
      const utapi = new UTApi({ token: uploadThingToken });
      const uploaded = await utapi.uploadFiles(file);
      if (uploaded.error || !uploaded.data) {
        return NextResponse.json(
          { error: uploaded.error?.message ?? "UploadThing upload failed." },
          { status: 502 }
        );
      }
      fileKey = uploaded.data.key;
      url = uploaded.data.ufsUrl || uploaded.data.url;
    } else {
      // Local dev / offline E2E fallback when UPLOADTHING_TOKEN is unset
      const arrayBuf = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");
      fileKey = `local-inline:${crypto.randomUUID()}`;
      url = `data:image/webp;base64,${base64}`;
    }

    // 2. Register in Convex mediaAssets & increment demoSession.uploadCount
    const mediaAssetId = await client.mutation(api.uploads.registerMediaAsset, {
      ...authEnvelope,
      fileKey,
      url,
      purpose,
      byteSize: file.size,
      width,
      height,
    });

    return NextResponse.json({
      mediaAssetId,
      fileKey,
      url,
      width,
      height,
      byteSize: file.size,
    });
  } catch (err: any) {
    const message =
      err?.data?.message || err?.message || "Upload rejected by viewerContext.";
    const code = err?.data?.code;
    const status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "QUOTA_EXCEEDED"
          ? 429
          : 400;
    return NextResponse.json({ error: message, code }, { status });
  }
}
