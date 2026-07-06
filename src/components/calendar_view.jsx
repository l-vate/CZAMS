import { useState, useMemo } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 56; // px per hour row
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // week starts Monday
  return new Date(d.setDate(diff));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toKey(date) {
  return date.toISOString().split("T")[0];
}

function formatHour(h) {
  const hour = h % 12 === 0 ? 12 : h % 12;
  const period = h < 12 ? "AM" : "PM";
  return `${hour} ${period}`;
}

export default function CalendarView({ jobs = [], title = "Calendar", onJobClick }) {
  const [view, setView] = useState("Week"); // Day | Week | Month
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedJob, setSelectedJob] = useState(null);

  const today = new Date();
  const todayKey = toKey(today);

  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const visibleDays = view === "Day" ? [anchorDate] : weekDays;

  const jobsByDay = useMemo(() => {
    const map = {};
    for (const job of jobs) {
      if (!map[job.date]) map[job.date] = [];
      map[job.date].push(job);
    }
    return map;
  }, [jobs]);

  function goPrev() {
    const step = view === "Day" ? -1 : view === "Week" ? -7 : -30;
    setAnchorDate((d) => addDays(d, step));
  }

  function goNext() {
    const step = view === "Day" ? 1 : view === "Week" ? 7 : 30;
    setAnchorDate((d) => addDays(d, step));
  }

  function goToday() {
    setAnchorDate(new Date());
  }

  const headerLabel = `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;

  return (
    <div className="cal-shell">
      <MiniMonthPicker anchorDate={anchorDate} onSelect={setAnchorDate} onToday={goToday} title={title} />

      <div className="cal-main">
        {/* Toolbar */}
        <div className="cal-toolbar">
          <div className="cal-toolbar-left">
            <h2 className="cal-header-label">{headerLabel}</h2>
            <div className="cal-nav-buttons">
              <button onClick={goPrev} className="cal-icon-btn" aria-label="Previous">
                <ChevronLeftIcon />
              </button>
              <button onClick={goNext} className="cal-icon-btn" aria-label="Next">
                <ChevronRightIcon />
              </button>
            </div>
          </div>

          <div className="cal-toolbar-right">
            <div className="cal-view-toggle">
              {["Day", "Week", "Month"].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`cal-view-btn ${view === v ? "cal-view-btn-active" : ""}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="cal-icon-btn" aria-label="Search">
              <SearchIcon />
            </button>
            <button className="cal-icon-btn" aria-label="More">
              <MoreIcon />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div
          className="cal-day-headers"
          style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, 1fr)` }}
        >
          <div />
          {visibleDays.map((d) => {
            const isToday = toKey(d) === todayKey;
            return (
              <div key={toKey(d)} className={`cal-day-header ${isToday ? "cal-day-header-today" : ""}`}>
                <div className="cal-day-name">{DAY_NAMES[d.getDay()]}</div>
                <div className={`cal-day-number ${isToday ? "cal-day-number-today" : ""}`}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable hour grid */}
        <div className="cal-grid-scroll">
          <div
            className="cal-grid"
            style={{ gridTemplateColumns: `64px repeat(${visibleDays.length}, 1fr)` }}
          >
            {/* Hour labels column */}
            <div>
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="cal-hour-label">
                  {h === 0 ? "" : formatHour(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {visibleDays.map((d) => {
              const key = toKey(d);
              const dayJobs = jobsByDay[key] || [];
              const isToday = key === todayKey;
              return (
                <div key={key} className={`cal-day-column ${isToday ? "cal-day-column-today" : ""}`}>
                  {HOURS.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="cal-hour-row" />
                  ))}

                  {dayJobs.map((job) => {
                    const top = job.startHour * HOUR_HEIGHT;
                    const height = Math.max((job.endHour - job.startHour) * HOUR_HEIGHT, 28);
                    return (
                      <button
                        key={job.id}
                        onClick={() => {
                          setSelectedJob(job);
                          onJobClick?.(job);
                        }}
                        style={{ top, height }}
                        className={`cal-job-block cal-job-${job.status}`}
                      >
                        <div className="cal-job-title">{job.title}</div>
                        <div className="cal-job-sub">
                          {formatHour(Math.floor(job.startHour))}
                          {job.assignedTo ? ` · ${job.assignedTo}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedJob && <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}

function MiniMonthPicker({ anchorDate, onSelect, onToday, title }) {
  const [cursor, setCursor] = useState(new Date(anchorDate));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayKey = toKey(new Date());
  const selectedKey = toKey(anchorDate);

  return (
    <div className="cal-sidebar">
      <div className="cal-sidebar-title">
        <div className="cal-sidebar-icon">
          <CalendarIcon />
        </div>
        <h1>{title}</h1>
      </div>

      <button onClick={onToday} className="cal-today-btn">
        Today
      </button>

      <div className="cal-mini-header">
        <span>
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <div className="cal-mini-nav">
          <button
            className="cal-icon-btn-sm"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            <ChevronLeftIcon size={14} />
          </button>
          <button
            className="cal-icon-btn-sm"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
      </div>

      <div className="cal-mini-weekdays">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="cal-mini-days">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateObj = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          const key = toKey(dateObj);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={i}
              onClick={() => onSelect(dateObj)}
              className={`cal-mini-day ${isSelected ? "cal-mini-day-selected" : ""} ${
                isToday && !isSelected ? "cal-mini-day-today" : ""
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <p>Legend</p>
        {["confirmed", "pending", "completed", "cancelled"].map((status) => (
          <div key={status} className="cal-legend-item">
            <span className={`cal-legend-dot cal-dot-${status}`} />
            <span className="cal-legend-label">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobDetailPanel({ job, onClose }) {
  return (
    <div className="cal-detail-panel">
      <div className="cal-detail-header">
        <span className={`cal-status-pill cal-job-${job.status}`}>{job.status}</span>
        <button onClick={onClose} className="cal-icon-btn" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <h3 className="cal-detail-title">{job.title}</h3>
      <p className="cal-detail-time">
        {formatHour(Math.floor(job.startHour))} – {formatHour(Math.floor(job.endHour))}
      </p>

      <div className="cal-detail-fields">
        <div>
          <p className="cal-detail-label">Customer</p>
          <p className="cal-detail-value">{job.customer}</p>
        </div>
        {job.assignedTo && (
          <div>
            <p className="cal-detail-label">Assigned to</p>
            <p className="cal-detail-value">{job.assignedTo}</p>
          </div>
        )}
        <div>
          <p className="cal-detail-label">Date</p>
          <p className="cal-detail-value">{job.date}</p>
        </div>
      </div>
    </div>
  );
}

/* --- inline icons (no external icon package needed) --- */

function ChevronLeftIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}