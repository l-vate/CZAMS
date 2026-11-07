import { ProofImage, ProofLink } from './proof_file';
import { useProofUrl } from '../hooks/useProofUrl';
import { isVideoPath } from '../constants/mediaUpload';

// A photo or video the customer sent, as the admin, the technician or the customer sees it. The file needs a short-lived signed link, like
// every other proof (hooks/useProofUrl.js). A photo opens in a new tab on click; a video plays in place.
function Video({ path }) {
  const { url, failed } = useProofUrl(path);
  if (failed) return <span className="ma-form-error" role="alert">Could not load the video.</span>;
  if (!url) return <span className="sdm-muted">Loading...</span>;
  return <video className="proof-media-video" src={url} controls preload="metadata" playsInline />;
}

function ProofMedia({ path, alt = 'Photo from the customer' }) {
  if (!path) return null;
  if (isVideoPath(path)) return <div className="proof-media"><Video path={path} /></div>;
  return (
    <div className="proof-media">
      <ProofLink path={path}>
        <ProofImage path={path} alt={alt} className="proof-media-image" />
      </ProofLink>
    </div>
  );
}

export default ProofMedia;
