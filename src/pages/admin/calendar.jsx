import { useEffect, useState } from "react";
import AdminLayout from "./admin_layout";
import CalendarView, { mapBookingStatusToCalendarStatus } from "../../components/calendar_view";
import { toLocalDateKey } from "../../utils/date";

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
          // Parse start and end hours (assuming ISO strings like '2026-07-08T08:00:00Z' or separate time fields)
          const startDate = item.startTime ? new Date(item.startTime) : null;
          const endDate = item.endTime ? new Date(item.endTime) : null;

          const startHour = startDate
            ? startDate.getHours() + startDate.getMinutes() / 60
            : item.startHour || 8;
          
          const endHour = endDate
            ? endDate.getHours() + endDate.getMinutes() / 60
            : item.endHour || 10;

          return {
            id: item._id || item.bookingId,
            title: item.service?.name || item.title || "Service Request",
            customer: item.customer?.name || item.customerName || "N/A",
            assignedTo: item.technician?.name || "Unassigned",
            date: item.date || (startDate ? toLocalDateKey(startDate) : ""),
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