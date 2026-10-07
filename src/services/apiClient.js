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
// Resolves to the parsed JSON body. A non-2xx response throws an ApiError whose message is
// the server's `message` (empty when it sent none, so callers can use their own fallback text).
// A network failure rejects with the original TypeError, exactly like fetch.
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
    throw new ApiError(data?.message || '', response.status, data);
  }
  return data;
}

// File upload (multipart/form-data): the browser sets the Content-Type and boundary itself.
export function upload(path, formData, { method = 'POST' } = {}) {
  return request(path, { method, body: formData });
}

// For reads where a failed response simply means "nothing to show" (the old
// `res.ok ? res.json() : []`): resolves to `fallback` on an HTTP error, still throws on a
// network failure.
export async function orFallback(promise, fallback) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError) return fallback;
    throw err;
  }
}

// For code that shows the server's message and stops: resolves to { data } on success, or
// { error } (the server's message, else `fallbackMessage`) on an HTTP error. A network failure
// still throws.
export async function attempt(promise, fallbackMessage) {
  try {
    return { data: await promise };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message || fallbackMessage };
    throw err;
  }
}

// For `.catch` chains that rethrow as a plain Error: keeps the server's message, with `text`
// standing in when it sent none. Anything else (a network failure) passes through unchanged.
export const withFallback = (text) => (err) => {
  throw err instanceof ApiError ? new Error(err.message || text) : err;
};

// The old `res.json()` that never looked at the status: a failed response resolves to its
// body (usually { message }) instead of throwing. A network failure still throws.
export async function bodyEvenIfError(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError) return err.data;
    throw err;
  }
}
