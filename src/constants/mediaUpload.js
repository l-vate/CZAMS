// The optional picture or short clip a customer can send with a booking (of the problem, or of where the unit will go) or with a back job.
// One file. A picture takes the same types and size as every other image upload; a clip is an MP4, MOV or WEBM of up to 15 MB (about 15
// seconds at 480p to 720p). The server checks the same rules (server/utils/mediaUpload.js).
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_MEDIA_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024;

// '' when the file can be sent, otherwise the sentence to show.
export function mediaProblem(file) {
  if (!file) return '';
  if (IMAGE_MEDIA_TYPES.includes(file.type)) return file.size > IMAGE_MAX_BYTES ? 'The photo must be 8 MB or smaller.' : '';
  if (VIDEO_MEDIA_TYPES.includes(file.type)) return file.size > VIDEO_MAX_BYTES ? 'The video must be 15 MB or smaller (about 15 seconds).' : '';
  return 'Choose a JPG, PNG or WEBP photo, or an MP4, MOV or WEBM video.';
}

// A stored path is a clip when its extension says so.
export const isVideoPath = (path) => /\.(mp4|mov|webm)$/i.test(String(path || ''));
