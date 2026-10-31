import { useState } from 'react';
import { getProofUrl } from '../services/fileService';
import { useProofUrl } from '../hooks/useProofUrl';
import { proofNameOf } from '../utils/proofPath';

// Showing a proof file. The file itself needs a short-lived signed link, which is requested from the
// server (the server checks who is asking). An <img> cannot send a token, which is why a link is used.

// A link that opens the file in a new tab. The tab is opened on the click itself, so a pop-up
// blocker allows it, and pointed at the file once the link arrives.
export function ProofLink({ path, className = 'proof-link', children = 'View File' }) {
  const [error, setError] = useState('');

  // not a stored proof path or an external link (a file name picked but not uploaded yet): plain text
  const openable = !!proofNameOf(path) || (typeof path === 'string' && path.startsWith('http'));

  const open = async (e) => {
    e.preventDefault();
    setError('');
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await getProofUrl(path);
      if (!url) throw new Error('no link');
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      if (tab) tab.close();
      setError('Could not open the file.');
    }
  };

  if (!openable) return <span className={className}>{typeof children === 'string' ? path || children : children}</span>;

  return (
    <>
      <a className={className} href="#open-file" onClick={open}>{children}</a>
      {error && <span className="ma-form-error" role="alert"> {error}</span>}
    </>
  );
}

// An image of a proof file. If it fails to load once (the link ran out), a new link is requested once.
export function ProofImage({ path, alt, className, onClick }) {
  const { url, failed, refresh } = useProofUrl(path);
  const [retried, setRetried] = useState(false);

  if (failed) return <span className="ma-form-error" role="alert">Could not load the image.</span>;
  if (!url) return <span className="sdm-muted">Loading...</span>;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => {
        if (!retried) {
          setRetried(true);
          refresh();
        }
      }}
    />
  );
}
