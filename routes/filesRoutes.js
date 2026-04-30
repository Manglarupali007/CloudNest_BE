const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const { protect, checkStorageLimit } = require('../middleware/auth');
const {
  uploadFile,
  getFiles,
  deleteFile,
  generateShareLink
} = require('../controllers/fileController');

router.post('/upload', protect, upload.single('file'), checkStorageLimit, uploadFile);
router.get('/my-files', protect, getFiles);
router.delete('/:id', protect, deleteFile);
router.post('/:id/share', protect, generateShareLink);

module.exports = router;