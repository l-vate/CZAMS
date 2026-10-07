// Base URL of the CZAMS backend. Set VITE_API_URL (see .env.example) to point the
// frontend somewhere else, for example in production; it defaults to the local dev server.
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
