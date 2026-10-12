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

  return {
    id: booking._id || booking.bookingId,
    title: `${booking.service?.name || "Service"}${unitTypesLabel}${booking.myRole ? ` (${booking.myRole})` : ""}`,
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
  const [failed, setFailed] = useState(false);

  const fetchTechnicianJobs = async () => {
    try {
      const data = await listTechnicianJobs();
      if (!Array.isArray(data)) throw new Error("Unexpected jobs reply");
      setJobs(data.map(toCalendarJob));
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