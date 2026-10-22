import { useEffect, useState } from "react";
import AdminLayout from "./admin_layout";
import { getMemberNames } from "../../utils/assignments";
import CalendarView from "../../components/calendar_view";
import ClosureManager from "../../components/closure_manager";
import TechnicianAvailabilityManager from "../../components/technician_availability_manager";
import { mapBookingStatusToCalendarStatus, getTimeBlockHours } from "../../utils/calendar";
import { orFallback } from '../../services/apiClient';
import { listBookings } from '../../services/bookingService';
import { customerLabel } from '../../utils/customerLabel';

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const data = await orFallback(listBookings(), null);

      if (Array.isArray(data)) {
        // Map backend schema to the structure expected by CalendarView
        const transformedJobs = data.map((item) => {
          // item.time is Booking's real field - "Morning" or "Afternoon", set by
          // Step3's time toggle (book_service.jsx). There are no startTime/endTime
          // fields on Booking; the previous version looked for those (and for
          // startHour/endHour, which aren't booking fields either - those are only
          // ever produced here), so every booking silently fell back to the same
          // fixed 8:00-10:00 AM slot regardless of which block was actually booked.
          const { startHour, endHour } = getTimeBlockHours(item.time);

          return {
            id: item._id || item.bookingId,
            title: item.service?.name || item.title || "Service Request",
            customer: customerLabel(item.customer, item.customerName || "N/A"),
            assignedTo: getMemberNames(item),
            date: item.date || "",
            startHour,
            endHour,
            status: mapBookingStatusToCalendarStatus(item.status),
          };
        });

        setJobs(transformedJobs);
      }
    } catch (error) {
      console.error("Error fetching calendar jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout title="Calendar">
      <ClosureManager />
      <TechnicianAvailabilityManager />
{loading ? (
        <p>Loading schedule…</p>
      ) : (
        <div className="admin-calendar-x1">
          <CalendarView jobs={jobs} title="Job Calendar" />
        </div>
      )}
    </AdminLayout>
  );
}

export default Calendar;