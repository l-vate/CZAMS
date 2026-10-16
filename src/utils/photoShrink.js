// Shrinks a phone photo in the browser before it is uploaded, so a 6 to 10 MB photo fits the 5 MB limit
// without the person having to do anything. The rules are plain functions (tested without a browser);
// shrinkPhoto is the browser part and always falls back to the original file if anything goes wrong.

export const MAX_SIDE = 2000; // longest side, in pixels
export const JPEG_QUALITY = 0.8;
export const PNG_KEEP_BYTES = 1024 * 1024; // a PNG under 1 MB (a screenshot, say) is left as it is

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Whether a file is worth trying to shrink at all, from what is known before decoding it.
// PDFs and anything that is not a JPEG, PNG or WEBP image are never touched, and a PNG under 1 MB is left alone.
export function shouldTryShrink({ type, size }) {
  if (!IMAGE_TYPES.includes(type)) return false;
  if (type === 'image/png' && size < PNG_KEEP_BYTES) return false;
  return true;
}

// The size to draw at: the longest side at most MAX_SIDE, the shape kept, never enlarged.
export function scaleToFit(width, height, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (!(longest > maxSide)) return { width, height, resized: false };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), resized: true };
}

// The re-encoded photo is used only if it is really smaller; otherwise the original is kept.
export const keepShrunk = (originalBytes, shrunkBytes) => shrunkBytes > 0 && shrunkBytes < originalBytes;

// "IMG_0042.HEIC.png" becomes "IMG_0042.HEIC.jpg"; a name with no extension gets one.
export function jpegName(name) {
  const base = String(name || 'photo').replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.jpg`;
}

// The browser part. Reads the EXIF rotation (the browser applies it when the image is decoded with
// imageOrientation "from-image", so a portrait photo is not saved sideways), draws it on a canvas no
// bigger than MAX_SIDE, and re-encodes it as JPEG at 0.8. Any failure, an unsupported browser, a file it
// cannot decode, or a result that is not smaller, returns the original file unchanged.
export async function shrinkPhoto(file) {
  try {
    if (!file || !shouldTryShrink({ type: file.type, size: file.size })) return file;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = scaleToFit(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#ffffff'; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || !keepShrunk(file.size, blob.size)) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
