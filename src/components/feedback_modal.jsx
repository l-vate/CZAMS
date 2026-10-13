import { useState } from 'react';
import { FiStar } from 'react-icons/fi';

function FeedbackModal({ booking, readOnly = false, onClose, onSubmit, submitting }) {
  const existing = booking.feedback || {};
  const [rating, setRating] = useState(existing.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState(existing.text || '');
  const [error, setError] = useState('');

  const isEdit = Boolean(existing.rating);

  const handleSubmit = () => {
    if (!rating) {
      setError('Please select a star rating.');
      return;
    }
    setError('');
    onSubmit({ rating, text });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">
            {readOnly ? 'Your Feedback' : isEdit ? 'Edit Your Feedback' : 'Rate This Service'}
          </h4>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {!readOnly && (
          <p className="modal-instruction">How was your experience with this service?</p>
        )}

        <div className="feedback-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="feedback-star-btn"
              disabled={readOnly}
              onClick={() => setRating(star)}
              onMouseEnter={() => !readOnly && setHoverRating(star)}
              onMouseLeave={() => !readOnly && setHoverRating(0)}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
            >
              <FiStar fill={(hoverRating || rating) >= star ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>

        <div className="bs-field-group">
          <label className="bs-label">
            Comments {!readOnly && <span className="bs-label-hint">(Optional)</span>}
          </label>
          <textarea
            className="bs-textarea"
            rows={3}
            placeholder="Tell us more about your experience..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={readOnly}
            readOnly={readOnly}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#e05a5a', marginTop: '-8px', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        {readOnly ? (
          <button className="modal-submit-btn" onClick={onClose}>Close</button>
        ) : (
          <button className="modal-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : isEdit ? 'Update Feedback' : 'Submit Feedback'}
          </button>
        )}
      </div>
    </div>
  );
}

export default FeedbackModal;
