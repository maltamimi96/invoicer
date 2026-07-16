"use client";

/**
 * Preparing user-attached images for the assistant.
 *
 * Resizing is not cosmetic. Attached images live in the conversation history,
 * and the whole history is re-sent on every turn — and again on every iteration
 * of the tool loop. A raw 4MB phone photo becomes ~5.3MB of base64 that gets
 * uploaded over and over. Downscaling once, here, is the difference between a
 * usable feature and a slow, expensive one.
 */

/**
 * Long-edge cap. Claude's standard vision tier tops out around this, and it's
 * ample for a job photo or a screenshot of a bill. Opus 4.8 can take ~2576px,
 * but that costs roughly 3x the image tokens for detail this use case doesn't
 * need.
 */
const MAX_EDGE = 1568;

/** The API accepts only these. A HEIC straight off an iPhone is a 400. */
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** More than a handful per message stops being a question and starts being a
 *  batch job — and each one is re-sent every turn. */
export const MAX_IMAGES_PER_MESSAGE = 4;

export interface PreparedImage {
  /** Base64 payload, no data: prefix — what the API wants. */
  data: string;
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  /** data: URL for the thumbnail. */
  previewUrl: string;
  name: string;
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}

/**
 * Downscale to MAX_EDGE and re-encode as JPEG.
 *
 * Re-encoding also launders the format: a HEIC or oversized PNG the API would
 * reject comes out as JPEG it accepts. Animated GIFs lose animation — an
 * acceptable trade, since the model only reads the first frame anyway.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} isn't an image.`);
  }

  const img = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image in this browser.");
  ctx.drawImage(img, 0, 0, w, h);

  // Keep PNG only when it's already small and accepted — screenshots of text
  // stay sharper. Everything else becomes JPEG.
  const keepPng = file.type === "image/png" && file.size < 400_000 && scale === 1;
  const outType: PreparedImage["media_type"] = keepPng ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(outType, 0.85);
  const data = dataUrl.split(",")[1] ?? "";

  if (!data) throw new Error("Couldn't process that image.");
  if (!ACCEPTED.has(outType)) throw new Error("Unsupported image format.");

  return { data, media_type: outType, previewUrl: dataUrl, name: file.name };
}

/** Prepare several, skipping any that fail rather than losing the whole batch. */
export async function prepareImages(
  files: File[]
): Promise<{ images: PreparedImage[]; errors: string[] }> {
  const images: PreparedImage[] = [];
  const errors: string[] = [];
  for (const f of files.slice(0, MAX_IMAGES_PER_MESSAGE)) {
    try {
      images.push(await prepareImage(f));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `Couldn't read ${f.name}.`);
    }
  }
  return { images, errors };
}

/** The Messages API image block. */
export function toImageBlock(img: PreparedImage) {
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.media_type, data: img.data },
  };
}
