import { useEffect, useState } from "react";
import StaffLayout from "./staff_layout";
import CalendarView from "../../components/calendar_view";

const API_BASE = "${import.meta.env.VITE_API_URL}";

// Converts "9:00 AM" -> 9, "1:30 PM" -> 13.5
function timeToHour(timeStr) {
  if (!timeStr) return 8; // Default fallback to 8:00 AM if unparseable
  const parts = timeStr.trim().split(" ");
  if (parts.length < 2) return 8;

  const [time, period] = parts;
  let [h, m] = time.split(":").map(Number);

  if (isNaN(h)) return 8;

  const periodUpper = period?.toUpperCase();
  if (periodUpper === "PM" && h !== 12) h += 12;
  if (periodUpper === "AM" && h === 12) h = 0;

  return h + (m || 0) / 60;
}

// Splits "9:00 AM - 11:00 AM" into start and end strings
function splitTimeRange(timeStr) {
  if (!timeStr || typeof timeStr !== "string") {
    return { start: null, end: null };
  }
  const [start, end] = timeStr.split("-").map((s) => s.trim());
  return { start, end };
}

// Map backend DB response to the structure required by CalendarView
function toCalendarJob(booking) {
  const { start, end } = splitTimeRange(booking.time);

  const startHour = timeToHour(start);
  let endHour = timeToHour(end);

  // If no end time was supplied, default the event duration to 2 hours
  if (!end || endHour <= startHour) {
    endHour = startHour + 2;
  }

  // Format unit types label
  const unitTypesLabel =
    Array.isArray(booking.unitTypes) && booking.unitTypes.length > 0
      ? ` - ${booking.unitTypes.join(", ")}`
      : "";

  return {
    id: booking._id || booking.bookingId,
    title: `${booking.service?.name || "Service"}${unitTypesLabel}`,
    customer: booking.customer?.name || booking.customerName || "Customer",
    assignedTo: "Me", // Current logged-in technician
    date: booking.date,
    startHour,
    endHour,
    status: (booking.status || "pending").toLowerCase(),
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