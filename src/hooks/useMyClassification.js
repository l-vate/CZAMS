import { useState, useEffect } from 'react';
import { getMe } from '../services/userService';

// Fetches the logged-in customer's own classification (Customer Classification Module)
export function useMyClassification() {
  const [classification, setClassification] = useState('Regular');

  useEffect(() => {
    getMe()
      .then((data) => setClassification(data.classification || 'Regular'))
      .catch(() => {});
  }, []);

  return classification;
}
