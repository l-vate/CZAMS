import { useState } from 'react';
import { readPanelOpen, writePanelOpen } from '../utils/calendarPanels';

// The open or closed state of one panel, remembered for the browser session. Closed unless the session says otherwise.
export function usePanelOpen(key) {
  const [open, setOpenState] = useState(() => (typeof window === 'undefined' ? null : readPanelOpen(key)) ?? false);
  const setOpen = (value) => {
    setOpenState(value);
    writePanelOpen(key, value);
  };
  return [open, setOpen];
}
