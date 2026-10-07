import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/technicians`)
      .then((res) => res.json())
      .then((data) => {
        setTechnicians(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { technicians, loading };
}
