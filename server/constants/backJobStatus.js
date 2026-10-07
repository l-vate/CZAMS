// BackJob.status values, exactly as stored.
const BACK_JOB_STATUS = Object.freeze({
  SCHEDULED: 'Scheduled',
  NOT_COVERED: 'Not Covered',
  REVIEWED: 'Reviewed',
});

const BACK_JOB_STATUS_VALUES = Object.freeze(Object.values(BACK_JOB_STATUS));

module.exports = { BACK_JOB_STATUS, BACK_JOB_STATUS_VALUES };
