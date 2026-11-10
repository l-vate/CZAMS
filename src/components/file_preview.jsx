import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// What was picked, shown before it is sent: a small picture (or the file name for a PDF or a video) and a Remove button.
// `file` is the File the person chose, `onRemove` clears it. The picture is a temporary local address, freed when the file changes.
// Clicking the small picture or clip opens it large, so the person can check it before sending. Escape, the Close button or a click
// outside closes it. It is drawn on the page body above any modal the picker sits in, and its clicks never reach that modal.
function FilePreview({ file, onRemove, label = 'Selected file' }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const isImage = Boolean(file?.type?.startsWith('image/'));
  const isVideo = Boolean(file?.type?.startsWith('video/'));

  useEffect(() => {
    if (!file || !(isImage || isVideo)) return undefined; // nothing to draw: the old address is never shown for a file that is not a picture or a clip
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file, isImage, isVideo]);

  // a removed or replaced file closes the large view
  useEffect(() => { if (!file) setOpen(false); }, [file]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // Escape closes only this view, not a modal behind it
      setOpen(false);
    };
    // eslint-disable-next-line no-restricted-syntax -- Escape closes the large view: removed in this effect's cleanup
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!file) return null;
  const canEnlarge = (isImage || isVideo) && Boolean(url);
  const thumb = isImage
    ? <img className="file-preview-thumb" src={url} alt={`Preview of ${file.name}`} />
    : <video className="file-preview-thumb" src={url} muted preload="metadata" aria-label={`Preview of ${file.name}`} />;

  return (
    <div className="file-preview" role="group" aria-label={label}>
      {canEnlarge && (
        <button type="button" className="file-preview-open" onClick={() => setOpen(true)} aria-label={`View ${file.name} larger`} title="Click to view larger">
          {thumb}
        </button>
      )}
      <span className="file-preview-name">{file.name}</span>
      <button type="button" className="file-preview-remove" onClick={() => { setOpen(false); onRemove(); }}>Remove</button>
      {open && canEnlarge && createPortal(
        <div className="file-preview-lightbox" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`} onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="file-preview-lightbox-body" role="presentation" onClick={(e) => e.stopPropagation()}>
            {isImage
              ? <img className="file-preview-large" src={url} alt={`Preview of ${file.name}`} />
              : <video className="file-preview-large" src={url} controls autoPlay muted aria-label={`Preview of ${file.name}`} />}
            <p className="file-preview-lightbox-name">{file.name}</p>
            <button type="button" className="file-preview-lightbox-close" onClick={() => setOpen(false)} autoFocus>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default FilePreview;
