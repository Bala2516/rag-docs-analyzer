const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Ensure the docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Multer storage config (clears existing files before upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR);
    }
    // Delete old files
    fs.readdirSync(DOCS_DIR).forEach(f => fs.unlinkSync(path.join(DOCS_DIR, f)));
    cb(null, DOCS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// POST /upload
router.post('/', upload.single('file'), (req, res) => {
  res.json({ message: 'File uploaded successfully.' });
});

module.exports = router;
