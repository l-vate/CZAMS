import { useState } from 'react';
import FilePreview from './file_preview';
import { MEDIA_ACCEPT, mediaProblem } from '../constants/mediaUpload';
import { shrinkPhoto } from '../utils/photoShrink';

// An optional photo or short video: choose one, see it, remove it. `file` and `onChange` are the parent's state (a File or null).
function MediaPicker({ id, file, onChange, label, hint }) {
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);

  const handlePick = async (e) => {
    const picked = e.target.files[0] || null;
    if (!picked) return;
    let chosen = picked;
    if (picked.type.startsWith('image/')) {
      setPreparing(true);
      chosen = await shrinkPhoto(picked); // a phone photo is shrunk first, like every other photo
      setPreparing(false);
    }
    const problem = mediaProblem(chosen);
    setError(problem);
    onChange(problem ? null : chosen);
  };

  return (
    <div className="bs-field-group media-picker">
      <label className="bs-label" htmlFor={id}>{label} <span className="bs-label-hint">(Optional)</span></label>
      {hint && <p className="bs-card-sub">{hint}</p>}
      <label className="modal-file-btn">
        {file ? 'Choose a different file' : '[Choose a photo or video]'}
        <input id={id} type="file" accept={MEDIA_ACCEPT} className="media-picker-input" onClick={(e) => { e.target.value = ''; }} onChange={handlePick} />
      </label>
      <FilePreview file={file} label={label} onRemove={() => { setError(''); onChange(null); }} />
      {preparing && <p className="sdm-muted" role="status">Preparing photo...</p>}
      {error && <p className="bs-field-error" role="alert">{error}</p>}
    </div>
  );
}

export default MediaPicker;
