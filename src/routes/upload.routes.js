const router = require('express').Router();
const { requireAuth, requireVerified } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const { uploadImageBuffer } = require('../services/cloudinary');

router.post(
  '/image',
  requireAuth,
  requireVerified,
  imageUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'לא נמצא קובץ' });
      const result = await uploadImageBuffer(req.file.buffer);
      res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
