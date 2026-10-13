import { useState, useEffect } from 'react';
import { orFallback } from '../services/apiClient';
import { listPublicTechnicians } from '../services/authService';

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orFallback(listPublicTechnicians(), [])
      .then((data) => {
        setTechnicians(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { technicians, loading };
}
