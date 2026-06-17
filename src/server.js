require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const orgRoutes = require('./routes/organization.routes');
const benefitRoutes = require('./routes/benefit.routes');
const jobRoutes = require('./routes/job.routes');
const postRoutes = require('./routes/post.routes');
const uploadRoutes = require('./routes/upload.routes');
const notificationRoutes = require('./routes/notification.routes');
const searchRoutes = require('./routes/search.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Behind a reverse proxy (Render/Heroku/Nginx) in production: trust the proxy so
// the real client IP is used for rate limiting and HTTPS detection.
if (isProd) {
  app.set('trust proxy', 1);
}

// Security headers, including HSTS (Strict-Transport-Security) so browsers force HTTPS.
app.use(
  helmet({
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  })
);

// Force HTTPS in production (password reset codes etc. must never travel over HTTP).
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// CORS — only allow the configured client origin(s). Using a wildcard together with
// credentials is invalid and unsafe; this app authenticates via Bearer tokens, not cookies.
const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: false,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Broad rate limit across the whole API as a DoS / scraping safety net.
app.use('/api', apiLimiter);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'izraeli-community-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/benefits', benefitRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
});
