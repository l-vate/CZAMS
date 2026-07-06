import { useEffect, useState } from "react";
import StaffLayout from "./staff_layout";
import CalendarView from "../../components/calendar_view";

// Replace with your real auth/user context
const CURRENT_STAFF_NAME = "Juan Dela Cruz";

async function fetchMyJobs(staffName) {
  const allJobs = [
{
    id: "job-1",
    title: "Cleaning - Carrier 1HP Split Type",
    customer: "Juan Dela Cruz",
    assignedTo: "Juan Dela Cruz",
    date: "2026-07-08",
    startHour: 8,
    endHour: 9.5,
    status: "confirmed",
  },
  {
    id: "job-2",
    title: "Repair - Panasonic Window Type",
    customer: "Maria Santos",
    assignedTo: "Pedro Santos",
    date: "2026-07-08",
    startHour: 10,
    endHour: 12,
    status: "pending",
  },
  {
    id: "job-3",
    title: "Maintenance - LG Split Type",
    customer: "Carlos Reyes",
    assignedTo: "Maria Reyes",
    date: "2026-07-08",
    startHour: 13,
    endHour: 14,
    status: "completed",
  },
  {
    id: "job-5",
    title: "Cleaning - Samsung Cassette Type",
    customer: "Mark Villanueva",
    assignedTo: "Pedro Santos",
    date: "2026-07-09",
    startHour: 9,
    endHour: 10.5,
    status: "confirmed",
  },
  {
    id: "job-6",
    title: "Repair - Carrier Floor Mounted",
    customer: "Elaine Garcia",
    assignedTo: "Maria Reyes",
    date: "2026-07-09",
    startHour: 14,
    endHour: 16,
    status: "pending",
  },
  {
    id: "job-7",
    title: "Maintenance - Panasonic Split Type",
    customer: "Robert Lim",
    assignedTo: "Juan Dela Cruz",
    date: "2026-07-10",
    startHour: 8,
    endHour: 9,
    status: "completed",
  },
  {
    id: "job-8",
    title: "Cleaning - Portable Aircon",
    customer: "Grace Mendoza",
    assignedTo: "Pedro Santos",
    date: "2026-07-10",
    startHour: 10,
    endHour: 11,
    status: "confirmed",
  },
  {
    id: "job-9",
    title: "Installation - TCL Window Type",
    customer: "John Bautista",
    assignedTo: "Maria Reyes",
    date: "2026-07-10",
    startHour: 13,
    endHour: 16,
    status: "confirmed",
  },
  {
    id: "job-10",
    title: "Maintenance - Carrier Split Type",
    customer: "Patricia Torres",
    assignedTo: "Juan Dela Cruz",
    date: "2026-07-11",
    startHour: 9,
    endHour: 10,
    status: "pending",
  },
  ];
  return allJobs.filter((j) => j.assignedTo === staffName);
}

function Calendar() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyJobs(CURRENT_STAFF_NAME)
      .then(setJobs)
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