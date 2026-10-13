// BackJob.status values, exactly as stored.
const BACK_JOB_STATUS = Object.freeze({
  SCHEDULED: 'Scheduled',
  NOT_COVERED: 'Not Covered',
  REVIEWED: 'Reviewed',
});

const BACK_JOB_STATUS_VALUES = Object.freeze(Object.values(BACK_JOB_STATUS));

// A claim is closed once an admin has handled it (Reviewed). Until then it is open, and a booking can have only one open
// claim. A Scheduled claim stays open: nothing closes it when its free visit is done.
const OPEN_BACK_JOB_STATUSES = Object.freeze([BACK_JOB_STATUS.SCHEDULED, BACK_JOB_STATUS.NOT_COVERED]);

module.exports = { BACK_JOB_STATUS, BACK_JOB_STATUS_VALUES, OPEN_BACK_JOB_STATUSES };
