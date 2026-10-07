import { API_BASE } from '../config/api';

// The one place the app talks to the backend. It builds the URL from API_BASE, attaches the
// login token, sends JSON (or a FormData untouched), and turns a failed response into an
// ApiError carrying the server's message, so pages never repeat this.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// options: { method, body, auth }. `body` may be a plain object (sent as JSON) or FormData.
export async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = auth ? authHeader() : {};
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.message || 'Something went wrong.', response.status, data);
  }
  return data;
}
