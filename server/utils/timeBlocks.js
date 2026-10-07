// Time blocks (Morning / Afternoon) and the clock they run on. The hours live in
// shared/timeBlocks.json so the status job, the calendar and the landing page footer all read
// the same numbers. Bookings store a plain "YYYY-MM-DD" date plus the block name, and
// every comparison is made in Philippine time (Asia/Manila, UTC+8, no daylight saving)
// whatever timezone the server happens to run in.
const config = require('../../shared/timeBlocks.json');

const TIME_BLOCKS = Object.keys(config.blocks);

// The instant (a real Date) at which a booking's block starts. A missing or unknown block
// is treated as the earliest one rather than never starting.
function blockStartInstant(dateString, block) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const fallback = config.blocks[TIME_BLOCKS[0]];
  const startHour = (config.blocks[block] || fallback).startHour;
  return new Date(Date.UTC(year, month - 1, day, startHour - config.utcOffsetHours, 0, 0));
}

// Today's date in Philippine time as "YYYY-MM-DD" (what a booking's date field is compared against).
function manilaTodayKey(now = new Date()) {
  const shifted = new Date(now.getTime() + config.utcOffsetHours * 3600000);
  return shifted.toISOString().slice(0, 10);
}

module.exports = { manilaTodayKey, TIME_BLOCKS, BLOCKS: config.blocks, TIMEZONE: config.timezone, blockStartInstant };
