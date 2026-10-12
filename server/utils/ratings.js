// A technician's average client rating from the feedback on their jobs. A job counts for the
// lead and the helper alike, the same as everywhere else. Only a real 1 to 5 rating counts;
// a job with no feedback, or feedback with no rating, is ignored. Pure, so it needs no database.
function summarizeRatings(jobs) {
  const ratings = (jobs || [])
    .map((j) => j?.feedback?.rating)
    .filter((r) => typeof r === 'number' && r >= 1 && r <= 5);
  if (ratings.length === 0) return { averageRating: null, ratingCount: 0 };
  const sum = ratings.reduce((total, r) => total + r, 0);
  return { averageRating: Math.round((sum / ratings.length) * 10) / 10, ratingCount: ratings.length };
}

module.exports = { summarizeRatings };
