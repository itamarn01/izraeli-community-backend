const { ZodError } = require('zod');

function errorHandler(err, _req, res, _next) {
  // Zod validation — safe to return the field-level messages we authored ourselves.
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'שגיאת ולידציה',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // Mongoose schema validation — do NOT echo the raw error (it exposes schema paths).
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ message: 'שגיאת ולידציה' });
  }

  // Malformed ObjectId / type cast — generic message, never reveal the field or model.
  if (err && err.name === 'CastError') {
    return res.status(400).json({ message: 'בקשה לא תקינה' });
  }

  // Duplicate key — don't reveal which index/field collided.
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'הערך כבר קיים במערכת' });
  }

  const status = err.status || err.statusCode || 500;

  // Internal errors: log server-side, return a generic message so the response
  // never leaks stack traces, driver internals, or database structure.
  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ message: 'שגיאת שרת פנימית' });
  }

  // Client errors (4xx) carry the Hebrew messages we set explicitly in controllers.
  res.status(status).json({ message: err.message || 'בקשה שגויה' });
}

module.exports = errorHandler;
