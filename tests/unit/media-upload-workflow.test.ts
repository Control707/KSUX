// @vitest-environment node
import { getFunctionName } from "convex/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/uploadthing/route";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), upload: vi.fn(), auth: {} as { demoShortCode?: string; demoPersonaHandle?: string; sessionToken?: string } }));

vi.mock("@/lib/convexHttp", () => ({
  createServerConvexClient: () => ({ mutation: mocks.mutation }),
  extractForwardedAuthEnvelope: async () => mocks.auth,
}));

vi.mock("uploadthing/server", () => ({
  UTApi: class { uploadFiles = mocks.upload; },
}));

async function webPRequest(purpose = "post", blur = false) {
  const bytes = await sharp({ create: { width: 11, height: 7, channels: 3, background: "#fdbb30" } })
    .withExif({ IFD0: { Artist: "private camera metadata" } }).webp().toBuffer();
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], "image.webp", { type: "image/webp" }));
  body.set("width", "300");
  body.set("height", "200");
  body.set("purpose", purpose);
  body.set("blur", String(blur));
  return new Request("http://localhost/api/uploadthing", { method: "POST", body });
}

describe("WebP upload workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("KSUX_SERVER_SECRET", "test-server-credential");
    vi.stubEnv("UPLOADTHING_TOKEN", "");
    mocks.auth = { demoShortCode: "demo-session", demoPersonaHandle: "maya_cs" };
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reserves actual decoded dimensions before registering a sanitized image", async () => {
    mocks.mutation.mockResolvedValueOnce("reservation").mockResolvedValueOnce("asset");
    const response = await POST(await webPRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mediaAssetId: "asset", width: 11, height: 7 });
    const [reserve, finish] = mocks.mutation.mock.calls;
    expect(getFunctionName(reserve![0])).toBe("uploads:reserveUpload");
    expect(reserve![1]).toMatchObject({ width: 11, height: 7, purpose: "post" });
    expect(getFunctionName(finish![0])).toBe("uploads:registerMediaAsset");
    expect(finish![1]).toMatchObject({ reservationId: "reservation", url: expect.stringMatching(/^data:image\/webp;base64,/) });
  });

  it("queues a returned remote key for cleanup when registration fails", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "mock-storage-token");
    mocks.upload.mockResolvedValue({ data: { key: "uploaded-file", ufsUrl: "https://example.test/image.webp" } });
    mocks.mutation
      .mockResolvedValueOnce("reservation")
      .mockRejectedValueOnce(new Error("Registration failed"))
      .mockResolvedValueOnce(null);

    const response = await POST(await webPRequest());
    expect(response.status).toBe(502);
    const [cleanup, args] = mocks.mutation.mock.calls[2]!;
    expect(getFunctionName(cleanup)).toBe("uploads:abandonUpload");
    expect(args).toMatchObject({ reservationId: "reservation", fileKey: "uploaded-file" });
  });

  it("uses private ACL for Incident uploads and returns no public URL or storage key", async () => {
    mocks.auth = { sessionToken: "student-session" }; vi.stubEnv("UPLOADTHING_TOKEN", "mock-storage-token");
    mocks.upload.mockResolvedValue({ data: { key: "private-key", ufsUrl: "https://example.test/private.webp" } });
    mocks.mutation.mockResolvedValueOnce("reservation").mockResolvedValueOnce("asset");
    const response = await POST(await webPRequest("incident", true));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ mediaAssetId: "asset" });
    expect(mocks.upload.mock.calls[0]![1]).toEqual({ acl: "private" });
    expect(mocks.mutation.mock.calls[0]![1]).toMatchObject({ purpose: "incident", blurred: true });
    expect(mocks.mutation.mock.calls[1]![1]).toMatchObject({ fileKey: "private-key", url: "" });
    const metadata = await sharp(Buffer.from(await (mocks.upload.mock.calls[0]![0] as File).arrayBuffer())).metadata();
    expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(metadata.icc).toBeUndefined();
  });

  it("refuses real Incident uploads in Demo and has no public/inline fallback when private storage is unavailable", async () => {
    vi.stubEnv("UPLOADTHING_TOKEN", "mock-storage-token");
    expect((await POST(await webPRequest("incident"))).status).toBe(403);
    mocks.auth = { sessionToken: "student-session" }; vi.stubEnv("UPLOADTHING_TOKEN", "");
    expect((await POST(await webPRequest("incident"))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
