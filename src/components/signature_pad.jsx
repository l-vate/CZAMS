import { useRef, useEffect, useState } from 'react';

// Minimal hand-rolled canvas signature capture — no signing library exists
// anywhere in this codebase yet, and the need here (draw, clear, export as an
// image) is small enough not to warrant a new dependency for it.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x: (point.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (point.clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0b2545';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    hasDrawnRef.current = true;
  };

  const stopDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasDrawnRef.current) {
      setIsEmpty(false);
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div className="signature-pad-wrap">
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="signature-pad-canvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <div className="signature-pad-controls">
        <span className="signature-pad-hint">{isEmpty ? 'Sign above' : 'Signed'}</span>
        <button type="button" className="signature-pad-clear-btn" onClick={clear}>
          Clear
        </button>
      </div>
    </div>
  );
}

export default SignaturePad;
