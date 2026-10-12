import { useEffect, useState } from "react";
import StaffLayout from "./staff_layout";
import CalendarView from "../../components/calendar_view";
import { mapBookingStatusToCalendarStatus, getTimeBlockHours } from "../../utils/calendar";
import { getUnitsSummary } from "../../utils/bookingPricing";
import { listTechnicianJobs } from '../../services/bookingService';
import LoadError from '../../components/load_error';


// Map backend DB response to the structure required by CalendarView
function toCalendarJob(booking) {
  const { startHour, endHour } = getTimeBlockHours(booking.time);

  // Format unit types label
  const unitsSummary = getUnitsSummary(booking);
  const unitTypesLabel = unitsSummary ? ` - ${unitsSummary}` : "";

  const main = {
    id: booking._id || booking.bookingId,
    title: `${booking.isBackJob ? "Back job: " : ""}${booking.service?.name || "Service"}${unitTypesLabel}${booking.myRole ? ` (${booking.myRole})` : ""}`,
    customer: booking.customer?.name || booking.customerName || "Customer",
    assignedTo: "Me", // Current logged-in technician
    date: booking.date,
    startHour,
    endHour,
    status: mapBookingStatusToCalendarStatus(booking.status),
  };

  // Each extra day the admin approved is shown on its own day and block, so the technician sees where they are needed.
  const extras = (booking.extensionDays || []).map((day, i) => {
    const hours = getTimeBlockHours(day.time);
    return {
      ...main,
      id: `${main.id}-extra-${i}`,
      title: `${main.title} (extra day)`,
      date: day.date,
      startHour: hours.startHour,
      endHour: hours.endHour,
    };
  });

  return [main, ...extras];
}

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchTechnicianJobs = async () => {
    try {
      const data = await listTechnicianJobs();
      if (!Array.isArray(data)) throw new Error("Unexpected jobs reply");
      setJobs(data.flatMap(toCalendarJob));
    } catch (err) {
      // a failed load is an error state with a Retry, never an empty calendar
      console.error("Failed to load technician schedule:", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setFailed(false);
    setLoading(true);
    fetchTechnicianJobs();
  };

  useEffect(() => {
    fetchTechnicianJobs();
  }, []);

  return (
    <StaffLayout title="Calendar">
      {loading ? (
        <p className="tech-job-empty">Loading your schedule…</p>
      ) : failed ? (
        <LoadError message="Could not load your schedule." onRetry={retry} />
      ) : (
        <div className="staff-calendar-x1">
          <CalendarView jobs={jobs} title="My Schedule" />
        </div>
      )}
    </StaffLayout>
  );
}

export default Calendar;