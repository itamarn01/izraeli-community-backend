const { ZodError } = require('zod');

function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'שגיאת ולידציה',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ message: 'שגיאת ולידציה', errors: err.errors });
  }

  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'הערך כבר קיים במערכת', fields: err.keyValue });
  }

  const status = err.status || 500;
  const message = err.expose ? err.message : err.message || 'שגיאת שרת פנימית';
  if (status >= 500) console.error(err);
  res.status(status).json({ message });
}

module.exports = errorHandler;
