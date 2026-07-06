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
import { useState, Fragment } from 'react';
import StaffLayout from './staff_layout';

const weekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const weekDates = [9, 10, 11, 12, 13, 14, 15];
const hours = Array.from({ length: 12 }, (_, i) => `${i === 0 ? 12 : i} AM`);

const miniMonthDays = [
  [25, 26, 27, 28, 29, 30, 1],
  [2, 3, 4, 5, 6, 7, 8],
  [9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22],
  [23, 24, 25, 26, 27, 28, 29],
  [30, 31],
];

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
  const [selectedDay, setSelectedDay] = useState(15);
  const [view, setView] = useState('Week');

  return (
    <StaffLayout title="Calendar">
      <div className="calendar-page">
        <div className="calendar-mini-panel">
          <div className="calendar-mini-header">
            <span className="calendar-mini-icon">🗓️</span>
            Calendar
          </div>

          <div className="calendar-mini-month">
            <span>December 2024</span>
            <span>
              <button type="button">‹</button>
              <button type="button">›</button>
            </span>
          </div>

          <div className="calendar-mini-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
              <div className="weekday" key={d}>{d}</div>
            ))}

            {miniMonthDays.map((week, wi) =>
              week.map((day, i) => {
                const isEdgeMonth = wi === 0 && day > 20;
                return (
                  <div
                    key={`${wi}-${i}`}
                    className={`day${isEdgeMonth ? ' muted' : ''}${day === selectedDay ? ' selected' : ''}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    {day}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="calendar-main-panel">
          <div className="calendar-main-header">
            <h2>
              December 2024
              <button className="calendar-nav-btn" type="button">‹</button>
              <button className="calendar-nav-btn" type="button">›</button>
            </h2>

            <div className="calendar-view-toggle">
              {['Day', 'Week', 'Month'].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={view === v ? 'active' : ''}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="calendar-week-grid">
            <div />
            {weekDays.map((d, i) => (
              <div
                className={`day-col-header${weekDates[i] === selectedDay ? ' today' : ''}`}
                key={d}
              >
                {d}
                <span className="date-num">{weekDates[i]}</span>
              </div>
            ))}

            {hours.map((h) => (
              <Fragment key={h}>
                <div className="calendar-hour-label">{h}</div>
                {weekDays.map((d) => (
                  <div className="calendar-hour-cell" key={`${d}-${h}`} />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}

export default Calendar;