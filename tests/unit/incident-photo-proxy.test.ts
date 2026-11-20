// @vitest-environment node
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/incident-photo/route";

const mocks = vi.hoisted(() => ({ query: vi.fn(), signed: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/convexHttp", () => ({
  createServerConvexClient: () => ({ query: mocks.query }),
  extractForwardedAuthEnvelope: async () => ({ sessionToken: "student-session" }),
}));
vi.mock("uploadthing/server", () => ({ UTApi: class { generateSignedURL = mocks.signed; } }));
const request = () => new Request("http://localhost/api/incident-photo", { method: "POST", body: JSON.stringify({ incidentId: "incident" }) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("OWLSIDE_SERVER_SECRET", "secret"); vi.stubEnv("UPLOADTHING_TOKEN", "storage-token"); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("denies unavailable/held media before accessing storage", async () => {
  mocks.query.mockResolvedValue(null);
  const response = await POST(request()); expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.signed).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});

it("delivers re-encoded blurred pixels and strips metadata without exposing a signed URL", async () => {
  const pixels = Buffer.alloc(96 * 96 * 3);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) for (let c = 0; c < 3; c++) pixels[(y * 96 + x) * 3 + c] = (x < 48 ? 0 : 255);
  const source = await sharp(pixels, { raw: { width: 96, height: 96, channels: 3 } }).withExif({ IFD0: { Artist: "private camera metadata" } }).webp({ lossless: true }).toBuffer();
  mocks.query.mockResolvedValue({ fileKey: "private-key", blurred: true });
  mocks.signed.mockResolvedValue({ ufsUrl: "https://private.example/signed-secret" });
  mocks.fetch.mockResolvedValue(new Response(source));
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("content-type")).toBe("image/webp");
  const output = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(output).metadata(); expect(metadata.exif).toBeUndefined();
  const decoded = await sharp(output).raw().toBuffer();
  // At the dark side of the boundary the original is 0; a real blur spreads light pixels.
  expect(decoded[(48 * 96 + 40) * 3]).toBeGreaterThan(40);
  expect(output.toString()).not.toContain("signed-secret");
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(mocks.fetch.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
});

it("withholds already-fetched bytes if deletion or a changed blur decision wins the race", async () => {
  const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).webp().toBuffer();
  mocks.query.mockResolvedValueOnce({ fileKey: "private-key", blurred: false }).mockResolvedValueOnce(null);
  mocks.signed.mockResolvedValue({ ufsUrl: "https://private.example/signed" }); mocks.fetch.mockResolvedValue(new Response(source));
  const response = await POST(request()); expect(response.status).toBe(409); expect(response.headers.get("content-type")).not.toBe("image/webp");
});
