export const MAX_IMAGE_DIMENSION = 1440;
export const MAX_WEBP_BYTES = 1_048_576; // 1 MB
export const DEFAULT_WEBP_QUALITY = 0.8;

const ALLOWED_STILL_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
]);

export function computeBoundedDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error("Invalid source image dimensions.");
  }
  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }
  const scale = maxDimension / Math.max(srcWidth, srcHeight);
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

export interface CompressedWebPResult {
  blob: Blob;
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read encoded WebP."));
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode still image."));
    };
    img.src = objectUrl;
  });
}

function canvasToWebPBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error("Canvas WebP encoding failed."));
          return;
        }
        resolve(b);
      },
      "image/webp",
      quality
    );
  });
}

/**
 * Re-encodes a still image on the client via HTML5 Canvas into EXIF/GPS-stripped WebP
 * bounded to <= 1440px and <= 1 MB.
 */
export async function compressImageToExifStrippedWebP(
  inputFile: File
): Promise<CompressedWebPResult> {
  const mime = inputFile.type.toLowerCase();
  if (!ALLOWED_STILL_MIME_TYPES.has(mime)) {
    throw new Error(
      "Only still images (JPEG, PNG, WebP, AVIF, HEIC) are supported."
    );
  }

  const decoded = await loadHtmlImage(inputFile);
  const { width, height } = computeBoundedDimensions(
    decoded.naturalWidth || decoded.width,
    decoded.naturalHeight || decoded.height,
    MAX_IMAGE_DIMENSION
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D Canvas context unavailable.");
  }

  // Drawing pixels onto a clean Canvas strips all EXIF, GPS, and camera metadata.
  ctx.drawImage(decoded, 0, 0, width, height);

  let blob = await canvasToWebPBlob(canvas, DEFAULT_WEBP_QUALITY);
  const fallbackQualities = [0.68, 0.54, 0.42];
  for (const q of fallbackQualities) {
    if (blob.size <= MAX_WEBP_BYTES) break;
    blob = await canvasToWebPBlob(canvas, q);
  }

  if (blob.size > MAX_WEBP_BYTES) {
    throw new Error("Compressed WebP still exceeds the 1 MB limit.");
  }

  const baseName = inputFile.name.replace(/\.[^.]+$/, "") || "ksux-image";
  const file = new File([blob], `${baseName}.webp`, { type: "image/webp" });
  const dataUrl = await blobToDataUrl(blob);

  return {
    blob,
    file,
    dataUrl,
    width,
    height,
    byteSize: blob.size,
  };
}
