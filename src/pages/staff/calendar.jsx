import { useEffect, useState } from "react";
import StaffLayout from "./staff_layout";
import CalendarView from "../../components/calendar_view";

const API_BASE = 'http://localhost:5000';

// "9:00 AM" -> 9, "1:30 PM" -> 13.5
function timeToHour(timeStr) {
  if (!timeStr) return 0;
  const [time, period] = timeStr.trim().split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period?.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (period?.toUpperCase() === 'AM' && h === 12) h = 0;
  return h + (m || 0) / 60;
}

// booking.time is a single string, e.g. "9:00 AM - 11:00 AM"
function splitTimeRange(timeStr) {
  if (!timeStr) return { start: null, end: null };
  const [start, end] = timeStr.split('-').map((s) => s.trim());
  return { start, end };
}

function toCalendarJob(booking) {
  const { start, end } = splitTimeRange(booking.time);
  return {
    id: booking._id,
    title: `${booking.service?.name || 'Service'}${booking.unitTypes?.length ? ' - ' + booking.unitTypes.join(', ') : ''}`,
    customer: booking.customer?.name || 'Customer',
    date: booking.date,
    startHour: timeToHour(start),
    endHour: timeToHour(end),
    status: booking.status,
  };
}

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/bookings/technician/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data.map(toCalendarJob) : []))
      .catch((err) => console.error('Failed to load jobs', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StaffLayout title="Calendar">
      {loading ? (
        <p>Loading your schedule…</p>
      ) : (
        <div style={{ height: "calc(100vh - 8rem)" }}>
          <CalendarView jobs={jobs} title="My Schedule" />
        </div>
      )}
    </StaffLayout>
  );
}

export default Calendar;