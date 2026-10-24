// Streams a file from the file store to a response with the headers every served upload gets: a content type from the extension
// whitelist (never the stored or claimed type), nosniff, and inline only for jpg, png, webp and pdf (anything else downloads as opaque bytes).
const { servingRulesFor } = require('./fileAccess');

function sendStored(res, name, file, { cacheControl }) {
  const { contentType, disposition } = servingRulesFor(name);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // The API-wide policy allows nothing to load, which also stops a browser's built-in PDF viewer. A PDF is not a page and nosniff stays, so
  // the policy is left off that one answer.
  if (contentType === 'application/pdf') res.removeHeader('Content-Security-Policy');
  res.setHeader('Cache-Control', cacheControl);
  if (Number.isFinite(file.size)) res.setHeader('Content-Length', String(file.size));
  file.stream.on('error', (err) => {
    console.error('Could not read a stored file:', err.message);
    if (res.headersSent) res.destroy(err);
    else res.status(500).json({ message: 'Server error' });
  });
  file.stream.pipe(res);
}

module.exports = { sendStored };
