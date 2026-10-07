// Time blocks, read from shared/timeBlocks.json: the same file the server's status job
// uses, so the calendar, the landing page footer and the Approved -> In Progress job can
// never disagree about when Morning and Afternoon start.
import config from '../../shared/timeBlocks.json';

export const TIME_BLOCKS = config.blocks;

function formatHour(hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

// "8:00 AM to 6:00 PM": from the earliest block start to the latest block end.
export function getBusinessHoursText() {
  const blocks = Object.values(TIME_BLOCKS);
  const open = Math.min(...blocks.map((b) => b.startHour));
  const close = Math.max(...blocks.map((b) => b.endHour));
  return `${formatHour(open)} to ${formatHour(close)}`;
}
