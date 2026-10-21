import { useState } from 'react';

// An optional real photo. With no `src`, or if the file fails to load, it shows `fallback` (a clean branded illustration) or nothing at all:
// never an empty box and never a broken image. `photo` is { src, alt, width, height } from config/landingContent.js.
function PhotoSlot({ photo, fallback = null, className = '', lazy = true }) {
  const [failed, setFailed] = useState(false);
  if (!photo || !photo.src || failed) return fallback;
  return (
    <img
      className={className}
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default PhotoSlot;
