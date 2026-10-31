import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BackButton from '../../components/back_button';
import AdminLayout from './admin_layout';
import AdminServiceDetailsModal from '../../components/admin_service_details_modal';
import { listBookings } from '../../services/bookingService';

// One booking, on its own page (it used to be a popup over the Bookings list). The details and every admin action are the same
// component the popup used; here it is drawn as a page with a Back link. Cancelling or changing a booking updates it in place.
// The booking comes from the admin list of every booking, the same data the popup was given (GET /api/bookings/:id only answers for
// the customer who owns the booking).
function BookingDetailsPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBooking(null);
    setLoadError('');
    listBookings()
      .then((list) => {
        if (cancelled) return;
        const found = Array.isArray(list) ? list.find((b) => b.bookingId === bookingId) : null;
        if (found) setBooking(found);
        else setLoadError('This booking was not found.');
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load this booking.'); });
    return () => { cancelled = true; };
  }, [bookingId]);

  const back = () => navigate('/admin/services/requests');

  return (
    <AdminLayout title="Bookings">
      <div className="page-container sdm-page-wrap">
        {/* once the booking is loaded the Back button is inside its card; until then (loading or an error) there is no card */}
        {!booking && (
          <BackButton label="Back to Bookings" className="sdm-back" onClick={back} />
        )}
        {loadError ? (
          <p className="req-empty" role="alert">{loadError}</p>
        ) : !booking ? (
          <p>Loading booking...</p>
        ) : (
          <AdminServiceDetailsModal booking={booking} asPage onClose={back} onUpdated={setBooking} />
        )}
      </div>
    </AdminLayout>
  );
}

export default BookingDetailsPage;
