// Booking.time values (the names used in constants/timeBlocks.json), exactly as stored.
const TIME_BLOCK = Object.freeze({
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
});

const TIME_BLOCK_VALUES = Object.freeze(Object.values(TIME_BLOCK));

module.exports = { TIME_BLOCK, TIME_BLOCK_VALUES };
