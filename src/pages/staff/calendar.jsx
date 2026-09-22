import { useEffect, useState } from "react";
import StaffLayout from "./staff_layout";
import CalendarView, { mapBookingStatusToCalendarStatus, getTimeBlockHours } from "../../components/calendar_view";
import { getUnitsSummary } from "../../utils/bookingPricing";

const API_BASE = "http://localhost:5000";

// Map backend DB response to the structure required by CalendarView
function toCalendarJob(booking) {
  const { startHour, endHour } = getTimeBlockHours(booking.time);

  // Format unit types label
  const unitsSummary = getUnitsSummary(booking);
  const unitTypesLabel = unitsSummary ? ` - ${unitsSummary}` : "";

  return {
    id: booking._id || booking.bookingId,
    title: `${booking.service?.name || "Service"}${unitTypesLabel}`,
    customer: booking.customer?.name || booking.customerName || "Customer",
    assignedTo: "Me", // Current logged-in technician
    date: booking.date,
    startHour,
    endHour,
    status: mapBookingStatusToCalendarStatus(booking.status),
  };
}

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTechnicianJobs();
  }, []);

  const fetchTechnicianJobs = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/bookings/technician/mine`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.statusText}`);
      }

      const data = await response.json();
      setJobs(Array.isArray(data) ? data.map(toCalendarJob) : []);
    } catch (err) {
      console.error("Failed to load technician schedule:", err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <StaffLayout title="Calendar">
      {loading ? (
        <p className="tech-job-empty">Loading your schedule…</p>
      ) : (
        <div style={{ height: "calc(100vh - 8rem)" }}>
          <CalendarView jobs={jobs} title="My Schedule" />
        </div>
      )}
    </StaffLayout>
  );
}

export default Calendar;