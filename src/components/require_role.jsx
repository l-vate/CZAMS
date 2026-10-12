import { Navigate, Outlet } from 'react-router-dom';
import { getSession, redirectFor } from '../utils/session';

// Wraps one role's pages. No login goes to the login page; a signed-in person on another
// role's pages is sent to their own dashboard. This only stops people landing on the wrong
// screens: the server still checks every request.
function RequireRole({ role }) {
  const target = redirectFor(getSession(), role);
  return target ? <Navigate to={target} replace /> : <Outlet />;
}

export default RequireRole;
