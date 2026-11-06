import { useEffect, useState } from 'react';

// What was picked, shown before it is sent: a small picture (or the file name for a PDF or a video) and a Remove button.
// `file` is the File the person chose, `onRemove` clears it. The picture is a temporary local address, freed when the file changes.
function FilePreview({ file, onRemove, label = 'Selected file' }) {
  const [url, setUrl] = useState('');
  const isImage = Boolean(file?.type?.startsWith('image/'));
  const isVideo = Boolean(file?.type?.startsWith('video/'));

  useEffect(() => {
    if (!file || !(isImage || isVideo)) return undefined; // nothing to draw: the old address is never shown for a file that is not a picture or a clip
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file, isImage, isVideo]);

  if (!file) return null;
  return (
    <div className="file-preview" role="group" aria-label={label}>
      {isImage && url && <img className="file-preview-thumb" src={url} alt={`Preview of ${file.name}`} />}
      {isVideo && url && <video className="file-preview-thumb" src={url} muted preload="metadata" aria-label={`Preview of ${file.name}`} />}
      <span className="file-preview-name">{file.name}</span>
      <button type="button" className="file-preview-remove" onClick={onRemove}>Remove</button>
    </div>
  );
}

export default FilePreview;
