// @vitest-environment node
import { getFunctionName } from "convex/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/uploadthing/route";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), upload: vi.fn() }));

vi.mock("@/lib/convexHttp", () => ({
  createServerConvexClient: () => ({ mutation: mocks.mutation }),
  extractForwardedAuthEnvelope: async () => ({ demoShortCode: "demo-session", demoPersonaHandle: "maya_cs" }),
}));

vi.mock("uploadthing/server", () => ({
  UTApi: class { uploadFiles = mocks.upload; },
}));

async function webPRequest() {
  const bytes = await sharp({ create: { width: 11, height: 7, channels: 3, background: "#fdbb30" } })
    .webp().toBuffer();
  const body = new FormData();
  body.set("file", new File([new Uint8Array(bytes)], "image.webp", { type: "image/webp" }));
  body.set("width", "300");
  body.set("height", "200");
  body.set("purpose", "post");
  return new Request("http://localhost/api/uploadthing", { method: "POST", body });
}

describe("WebP upload workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("KSUX_SERVER_SECRET", "test-server-credential");
    vi.stubEnv("UPLOADTHING_TOKEN", "");
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
});
