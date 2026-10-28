import { useState } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { IoNotifications } from 'react-icons/io5';
import GlassIcons from './glass_icons';

const CATEGORY_LABEL = {
  Holiday: 'Holiday',
  Closure: 'Closure',
  Maintenance: 'Maintenance',
  General: 'Announcement',
};

// A message longer than this is shown cut short, with a "Show more" button.
const LONG_MESSAGE = 150;

// One published announcement as a clean banner under the hero: a bell, the kind and dates as small tags, the title, the message (line
// breaks kept, long ones folded) and, when there are several, an arrow button on the right for the next one with a small "1 / 2" count.
function AnnouncementCard({ announcements }) {
  const [current, setCurrent] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const total = announcements.length;
  if (total === 0) return null;

  const announcement = announcements[current % total];
  const long = (announcement.message || '').length > LONG_MESSAGE;
  const next = () => { setExpanded(false); setCurrent((c) => (c + 1) % total); };

  return (
    <section className="lp-announce" aria-label="Announcement">
      <span className="lp-announce-icon">
        <GlassIcons
          items={[{ icon: <IoNotifications />, color: 'linear-gradient(135deg, #1e4f8f, #0b2545)', label: 'Announcement' }]}
          plate="none"
          size={56}
          gap={0}
          columns={1}
          labels="none"
          intro={false}
          theme="dark"
        />
      </span>
      <div className="lp-announce-body" aria-live="polite">
        <div className="lp-announce-tags">
          <span className="lp-announce-tag">{CATEGORY_LABEL[announcement.category] || announcement.category}</span>
          {announcement.displayDate && <span className="lp-announce-date">{announcement.displayDate}</span>}
        </div>
        <h2 className="lp-announce-title">{announcement.title}</h2>
        <p className={`lp-announce-text${long && !expanded ? ' lp-announce-text--folded' : ''}`}>{announcement.message}</p>
        {long && (
          <div className="lp-announce-actions">
            <button type="button" className="lp-announce-btn" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="lp-announce-nav">
          <span className="lp-announce-count" aria-hidden="true">{(current % total) + 1} / {total}</span>
          <button
            type="button"
            className="lp-announce-next"
            onClick={next}
            aria-label={`Next announcement (${(current % total) + 1} of ${total})`}
          >
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

export default AnnouncementCard;
