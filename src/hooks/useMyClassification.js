import { useState, useEffect } from 'react';
import { getMe } from '../services/userService';
import { hasAgreedTerms } from '../utils/downPaymentOptions';

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

// Whether the logged-in customer's account is Commercial. A Commercial account cannot ask for the Senior/PWD discount.
export function useIsCommercialClient() {
  const [commercial, setCommercial] = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => setCommercial(data.clientType === 'Commercial'))
      .catch(() => {});
  }, []);

  return commercial;
}

// Whether the logged-in customer is a Commercial client with agreed payment terms (so the no down payment option is offered).
export function useMyAgreedTerms() {
  const [onAgreedTerms, setOnAgreedTerms] = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => setOnAgreedTerms(hasAgreedTerms(data)))
      .catch(() => {});
  }, []);

  return onAgreedTerms;
}
