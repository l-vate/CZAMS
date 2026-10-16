import { useEffect, useState } from 'react';
import { getProofUrl } from '../services/fileService';

// The signed link for a path, fetched when the page shows it. `refresh` fetches a new one, for an
// image whose 5-minute link ran out while the page stayed open.
export function useProofUrl(path) {
  const [state, setState] = useState({ url: null, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!path) return undefined;
    getProofUrl(path)
      .then((url) => { if (!cancelled) setState({ url, failed: !url }); })
      .catch(() => { if (!cancelled) setState({ url: null, failed: true }); });
    return () => { cancelled = true; };
  }, [path, attempt]);

  return { ...state, refresh: () => setAttempt((n) => n + 1) };
}
