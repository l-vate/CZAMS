import { useCallback, useState } from 'react';

// Holds the message for <Notice> (components/notice.jsx): showNotice('text') shows it, clearNotice() hides it.
export function useNotice() {
  const [notice, setNotice] = useState('');
  const showNotice = useCallback((message) => setNotice(String(message || '')), []);
  const clearNotice = useCallback(() => setNotice(''), []);
  return { notice, showNotice, clearNotice };
}
