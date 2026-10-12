import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StaffLayout from './staff_layout';
import { FiUser, FiTool, FiCheckCircle, FiFileText, FiStar, FiEye, FiCalendar, FiClock, FiMapPin } from 'react-icons/fi';
import { orFallback } from '../../services/apiClient';
import LoadError from '../../components/load_error';
import { getTechnicianStats, listTechnicianJobs } from '../../services/bookingService';
import { listPublicAnnouncements } from '../../services/announcementService';
import { BOOKING_STATUS } from '../../constants/bookingStatus';


// Same categories the Landing Page Module uses for the public announcement
// board (landing_page.jsx) - duplicated rather than imported since that file is
// public-page code and this is the technician portal. Split into icon/name so
// the card can show the icon in its own badge rather than inline in the title.
const CATEGORY_ICON = {
  Holiday: '🎉',
  Closure: '🚧',
  Maintenance: '🛠️',
  General: '📢',
};

const CATEGORY_NAME = {
  Holiday: 'Holiday',
  Closure: 'Closure',
  Maintenance: 'Maintenance',
  General: 'Announcement',
};

// Accent per announcement category - same colors used for the "Upcoming
// jobs"/stat-card accents elsewhere on this dashboard, just remapped to what
// each category means (holiday/closure read as more urgent than a routine
// maintenance notice).
const CATEGORY_ACCENT_CLASS = {
  Holiday: 'tech-announcement-card--holiday',
  Closure: 'tech-announcement-card--closure',
  Maintenance: 'tech-announcement-card--maintenance',
  General: 'tech-announcement-card--general',
};

function feedbackAccentClass(rating) {
  if (rating >= 4) return 'tech-feedback-card--good';
  if (rating === 3) return 'tech-feedback-card--mid';
  return 'tech-feedback-card--low';
}

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const firstName = user?.name?.split(' ')[0] || 'Technician';

  const [stats, setStats] = useState({ ongoing: 0, completed: 0, pendingReports: 0, feedbacks: [] });
  const [loading, setLoading] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsFailed, setJobsFailed] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  // A failed load is an error state, never data: the error reply is not stored as the stats.
  const fetchStats = () => getTechnicianStats()
    .then((data) => {
      if (typeof data?.ongoing !== 'number') throw new Error('Unexpected stats reply');
      setStats(data);
    })
    .catch((err) => {
      console.error('Failed to load stats', err);
      setStatsFailed(true);
    })
    .finally(() => setLoading(false));

  const retryStats = () => {
    setLoading(true);
    setStatsFailed(false);
    fetchStats();
  };

  // A failed load is an error state with a Retry, never "No upcoming jobs".
  const fetchJobs = () => listTechnicianJobs()
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('Unexpected jobs reply');
      setJobs(data);
    })
    .catch((err) => {
      console.error('Failed to load jobs', err);
      setJobsFailed(true);
    });

  const retryJobs = () => {
    setJobsFailed(false);
    fetchJobs();
  };

  useEffect(() => {
    fetchStats();

    fetchJobs();

    // Same public endpoint the landing page uses - no reason to gate this behind
    // a technician-only route, and it keeps the "active announcements" logic in
    // exactly one place (Announcement.isActive, filtered server-side).
    orFallback(listPublicAnnouncements(), [])
      .then((data) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]));
  }, []);

  // Upcoming jobs: a technician's Approved/In Progress bookings - status-based,
  // not date-based (an In Progress job may already be underway today, not
  // strictly in the future, so filtering to future dates would hide it).
  // booking.time is a slot label ("Morning"/"Afternoon"), not a clock time, so
  // sort by date only and use the slot as a same-day tiebreaker.
  const TIME_SLOT_RANK = { Morning: 0, Afternoon: 1 };
  const toDateTime = (b) => {
    if (!b.date) return null;
    const parsed = new Date(b.date);
    return isNaN(parsed) ? null : parsed;
  };
  const UPCOMING_JOBS_LIMIT = 5;
  // Badge classes reuse my_jobs.jsx's status map; accent classes are local to
  // this card since .tech-status-* is a pill-badge style, not a border color.
  const UPCOMING_BADGE_CLASS = {
    Approved: 'tech-status-confirmed',
    'In Progress': 'tech-status-in-progress',
  };
  const UPCOMING_ACCENT_CLASS = {
    Approved: 'upcoming-job-card--approved',
    'In Progress': 'upcoming-job-card--in-progress',
  };
  const upcomingJobs = jobs
    .filter((b) => [BOOKING_STATUS.APPROVED, BOOKING_STATUS.IN_PROGRESS].includes(b.status))
    .map((b) => ({ booking: b, dt: toDateTime(b) }))
    .sort((a, b) => {
      const diff = (a.dt?.getTime() ?? 0) - (b.dt?.getTime() ?? 0);
      if (diff !== 0) return diff;
      return (TIME_SLOT_RANK[a.booking.time] ?? 0) - (TIME_SLOT_RANK[b.booking.time] ?? 0);
    })
    .slice(0, UPCOMING_JOBS_LIMIT)
    .map((x) => x.booking);

  return (
    <StaffLayout title="Dashboard">
      <div className="tech-dashboard-welcome-row">
        <h1 className="dashboard-welcome">Welcome, {firstName}!</h1>
        <button
          type="button"
          className="tech-dashboard-avatar staff-dashboard-x1"
          onClick={() => navigate('/staff/profile')}
          aria-label="Go to profile"
        >
          <FiUser />
        </button>
      </div>

      {statsFailed && <LoadError message="Could not load your numbers and feedback." onRetry={retryStats} />}

      <div className="tech-stats-grid">
        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiTool /></div>
          <div>
            <div className="tech-stat-label">Ongoing Jobs</div>
            <div className="tech-stat-value">{loading || statsFailed ? '-' : stats.ongoing}</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiCheckCircle /></div>
          <div>
            <div className="tech-stat-label">Completed Jobs</div>
            <div className="tech-stat-value">{loading || statsFailed ? '-' : stats.completed}</div>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon"><FiFileText /></div>
          <div>
            <div className="tech-stat-label">Pending Reports</div>
            <div className="tech-stat-value">{loading || statsFailed ? '-' : stats.pendingReports}</div>
          </div>
        </div>
      </div>

      {/* Upcoming Jobs - same treatment as the customer dashboard's "Next
          service" card (customer/dashboard.jsx), reusing its .info-card
          classes directly since customer.css and staff.css both load
          app-wide, but listing every Approved/In Progress job rather than
          just the single soonest one. */}
      <div className="info-card staff-dashboard-x2">
        <div className="info-card-header">
          <h4>Upcoming jobs</h4>
          <Link to="/staff/my_jobs" className="info-card-view-all">
            <FiEye /> View all
          </Link>
        </div>
        <div className="info-card-body">
          {jobsFailed ? (
            <LoadError message="Could not load your upcoming jobs." onRetry={retryJobs} />
          ) : upcomingJobs.length > 0 ? (
            upcomingJobs.map((job) => (
              <div
                className={`upcoming-job-card ${UPCOMING_ACCENT_CLASS[job.status] || ''}`}
                key={job.bookingId}
              >
                <div className="upcoming-job-main">
                  <p className="upcoming-job-name">{job.service?.name || 'Service'}</p>
                  <div className="upcoming-job-meta">
                    <span className="upcoming-job-meta-item">
                      <FiClock /> {job.date} - {job.time}
                    </span>
                    {job.address && (
                      <span className="upcoming-job-meta-item">
                        <FiMapPin /> {job.address}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`tech-job-status-badge ${UPCOMING_BADGE_CLASS[job.status] || ''}`}>
                  {job.status}
                </span>
              </div>
            ))
          ) : (
            <div className="info-card-empty">
              <span className="empty-icon"><FiCalendar /></span>
              <p>No upcoming jobs.</p>
            </div>
          )}
        </div>
      </div>

      {/* Announcement board - Announcement model + admin-side creation already
          exist for the Landing Page Module; this just also renders them here.
          Own layout rather than reusing .tech-feedback-card: an announcement
          isn't a review (no avatar/stars), so borrowing that card just to get
          a colored left border read as visually mismatched. */}
      {announcements.length > 0 && (
        <>
          <h2 className="tech-section-title tech-section-title--tight">Announcements</h2>
          <div className="tech-announcement-list staff-dashboard-x2">
            {announcements.map((a) => (
              <div
                className={`tech-announcement-card ${CATEGORY_ACCENT_CLASS[a.category] || 'tech-announcement-card--general'}`}
                key={a._id}
              >
                <div className="tech-announcement-icon">{CATEGORY_ICON[a.category] || '📢'}</div>
                <div className="tech-announcement-body">
                  <div className="tech-announcement-top">
                    <span className="tech-announcement-badge">{CATEGORY_NAME[a.category] || a.category}</span>
                    {a.displayDate && <span className="tech-announcement-date">{a.displayDate}</span>}
                  </div>
                  <h3 className="tech-announcement-title">{a.title}</h3>
                  <p className="tech-announcement-message">{a.message}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="tech-section-title">Customer Feedbacks</h2>
      <div className="tech-feedback-list">
        {loading ? (
          <p className="tech-job-empty">Loading feedback...</p>
        ) : statsFailed ? (
          <p className="tech-job-empty">Could not load feedback.</p>
        ) : stats.feedbacks.length === 0 ? (
          <p className="tech-job-empty">No feedback yet.</p>
        ) : (
          stats.feedbacks.map((f, i) => (
            <div className={`tech-feedback-card ${feedbackAccentClass(f.rating || 0)}`} key={i}>
              <div className="tech-feedback-left">
                <div className="tech-feedback-avatar"><FiUser /></div>
                <div>
                  <div className="tech-feedback-name">{f.name}</div>
                  <div className="tech-feedback-text">{f.text}</div>
                </div>
              </div>
              <div className="tech-feedback-right">
                <div className="tech-stars">
                  {Array.from({ length: f.rating || 0 }, (_, i) => (
                    <FiStar key={i} fill="currentColor" />
                  ))}
                </div>
                {f.createdAt && (
                  <div className="tech-feedback-date">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </StaffLayout>
  );
}

export default Dashboard;