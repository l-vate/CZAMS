import { useState, useEffect } from 'react';
import { orFallback } from '../services/apiClient';
import { listTechniciansForBooking } from '../services/authService';

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orFallback(listTechniciansForBooking(), [])
      .then((data) => {
        setTechnicians(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { technicians, loading };
}
