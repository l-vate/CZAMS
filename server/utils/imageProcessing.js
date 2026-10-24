// Every uploaded photo is cleaned on the server before it is stored: the longest side is limited to MAX_SIDE pixels, the picture is
// re-encoded as a JPEG at JPEG_QUALITY percent, and all metadata is dropped. A phone photo carries the place it was taken (GPS), the
// phone model and the time in its EXIF block; none of that is kept, and the stored file is a fraction of the original size, which matters
// on a free 512 MB database. The picture is turned upright first (EXIF orientation), so dropping the orientation tag changes nothing
// visible. PDFs are not images and are never touched here.
//
// The real type is read from the bytes by the image library, never from the file name or the type the browser claimed: a file that is
// not a decodable JPEG, PNG or WEBP is refused, and so is an enormous image (a decompression bomb).
const sharp = require('sharp');

// A small host (a free 512 MB instance) cannot spare memory for a cache or many threads: one picture is cleaned at a time and nothing is kept.
sharp.cache(false);
sharp.concurrency(1);

const MAX_SIDE = 1600; // pixels, the longest side
const JPEG_QUALITY = 80; // percent
const MAX_INPUT_PIXELS = 64 * 1000 * 1000; // about 8000 x 8000; more than any phone photo
const READABLE_FORMATS = Object.freeze(['jpeg', 'png', 'webp']);

class UnreadableImageError extends Error {
  constructor() {
    super('That picture could not be read. Choose a different photo.');
    this.name = 'UnreadableImageError';
    this.isUploadRejection = true;
  }
}

// The cleaned picture: { buffer, mimetype: 'image/jpeg', width, height }. Throws UnreadableImageError for anything that is not a real image.
async function cleanImage(input) {
  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', sequentialRead: true });
    const meta = await source.metadata();
    if (!READABLE_FORMATS.includes(meta.format)) throw new UnreadableImageError();
    const { data, info } = await source
      .rotate() // upright by the EXIF orientation, which is then dropped with the rest of the metadata
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // a PNG with transparency has no see-through in a JPEG
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mimetype: 'image/jpeg', width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof UnreadableImageError) throw err;
    throw new UnreadableImageError();
  }
}

module.exports = { cleanImage, UnreadableImageError, MAX_SIDE, JPEG_QUALITY, MAX_INPUT_PIXELS };
