import { request } from './apiClient';
import { API_BASE } from '../config/api';
import { proofNameOf } from '../utils/proofPath';

// A link to a proof file that works for 5 minutes, for the signed-in user only. The server decides
// whether this user may open the file at all; a refusal is a 404.
export async function getProofUrl(storedPath) {
  const name = proofNameOf(storedPath);
  if (!name) {
    // not one of our proof files (for example an external link): use it as it is
    return typeof storedPath === 'string' && storedPath.startsWith('http') ? storedPath : null;
  }
  const data = await request(`/api/files/proofs/${encodeURIComponent(name)}/link`, { method: 'POST' });
  return `${API_BASE}${data.url}`;
}
