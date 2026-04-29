const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Local disk storage (for CVs only — PDFs stay on-server)
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const cvFilter = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') return cb(null, true);
  cb(Object.assign(new Error('יש להעלות קובץ PDF בלבד'), { status: 400 }));
};

const imageFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) return cb(null, true);
  cb(Object.assign(new Error('יש להעלות קובץ תמונה בלבד (jpg, png, webp)'), { status: 400 }));
};

// CV upload → disk (5 MB)
const cvUpload = multer({
  storage: diskStorage,
  fileFilter: cvFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Image upload → memory (for Cloudinary streaming, 5 MB)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { cvUpload, imageUpload };
