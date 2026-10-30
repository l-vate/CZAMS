import { Link } from 'react-router-dom';
import { getSession, homeFor } from '../utils/session';

// Any address the app does not know. A button leads to the right home: the signed-in person's own dashboard, or the landing page when signed out.
function NotFoundPage() {
  const { token, user } = getSession();
  const signedIn = Boolean(token && user);
  const target = signedIn ? homeFor(user.role) : '/';
  return (
    <main className="not-found">
      <h1 className="not-found-title">Page not found</h1>
      <p className="not-found-text">We could not find the page you asked for. It may have moved, or the address may have a typo.</p>
      <Link to={target} className="bs-next-btn not-found-btn">{signedIn ? 'Go to my dashboard' : 'Go to the home page'}</Link>
    </main>
  );
}

export default NotFoundPage;
