import { useEffect, useState } from "react";
import AdminLayout from "./admin_layout";
import CalendarView, { mapBookingStatusToCalendarStatus, getTimeBlockHours } from "../../components/calendar_view";

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/api/bookings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (Array.isArray(data)) {
        // Map backend schema to the structure expected by CalendarView
        const transformedJobs = data.map((item) => {
          // item.time is Booking's real field — "Morning" or "Afternoon", set by
          // Step3's time toggle (book_service.jsx). There are no startTime/endTime
          // fields on Booking; the previous version looked for those (and for
          // startHour/endHour, which aren't booking fields either — those are only
          // ever produced here), so every booking silently fell back to the same
          // fixed 8:00-10:00 AM slot regardless of which block was actually booked.
          const { startHour, endHour } = getTimeBlockHours(item.time);

          return {
            id: item._id || item.bookingId,
            title: item.service?.name || item.title || "Service Request",
            customer: item.customer?.name || item.customerName || "N/A",
            assignedTo: item.technician?.name || "Unassigned",
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
      {loading ? (
        <p>Loading schedule…</p>
      ) : (
        <div style={{ height: "calc(100vh - 8rem)" }}>
          <CalendarView jobs={jobs} title="Job Calendar" />
        </div>
      )}
    </AdminLayout>
  );
}

export default Calendar;