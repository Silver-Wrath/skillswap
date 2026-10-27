export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// Central error handler: converts known errors to clean JSON responses and
// never leaks stack traces or internal details to the client.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ error: 'Validation failed', details });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id supplied' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'That value already exists' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
