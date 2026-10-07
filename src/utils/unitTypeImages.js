// Temporary placeholder photos (free stock, aircon-themed) for the small inset
// image per unit type - used on the landing page's navbar search popup and in
// the actual booking flow's unit-selection step (Step2, book_service.jsx), so a
// customer sees a photo per unit type while building the booking, not just on
// the marketing page. Swap for real CZA photography later.
import { UNIT_TYPE } from '../constants/unitTypes';

export const UNIT_TYPE_IMAGES = {
  [UNIT_TYPE.WINDOW]: 'https://images.unsplash.com/photo-1630169839507-fedc46615129?auto=format&fit=crop&w=200&q=70',
  [UNIT_TYPE.SPLIT]: 'https://images.unsplash.com/photo-1762341123870-d706f257a12e?auto=format&fit=crop&w=200&q=70',
  [UNIT_TYPE.FLOOR_MOUNTED]: 'https://images.unsplash.com/photo-1758980960373-2be749113338?auto=format&fit=crop&w=200&q=70',
  [UNIT_TYPE.CASSETTE]: 'https://images.unsplash.com/photo-1647936900381-d5df29d055a5?auto=format&fit=crop&w=200&q=70',
  [UNIT_TYPE.PORTABLE]: 'https://cdn.pixabay.com/photo/2018/06/08/16/10/air-conditioning-3462597_640.png',
};
