// What a technician page shows when a request failed: the problem in words and a Retry button.
// A failed load is an error state, never an empty list, so nobody reads "No jobs" when the truth is
// "the jobs could not be loaded".
function LoadError({ message = 'Could not load this. Please try again.', onRetry }) {
  return (
    <div className="tech-stats-error" role="alert">
      <p className="tech-job-empty">{message}</p>
      {onRetry && (
        <button type="button" className="bs-next-btn" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export default LoadError;
