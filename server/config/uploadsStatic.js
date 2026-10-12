// What is still served as plain static files under /uploads: profile photos only, which are meant to be
// visible. The proofs folder is deliberately NOT mounted: its files are opened through /api/files/proofs
// after an access check (routes/fileRoutes.js). A request for /uploads/proofs/<name> is a 404.
const express = require('express');
const path = require('path');

function mountUploads(app, uploadsRoot = path.join(__dirname, '..', 'uploads')) {
  // nosniff: a browser must treat each file as the type it is served as, never guess it is a page.
  app.use('/uploads/profile-images', express.static(path.join(uploadsRoot, 'profile-images'), {
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));
  app.use('/uploads', (req, res) => res.status(404).json({ message: 'File not found' }));
}

module.exports = { mountUploads };
