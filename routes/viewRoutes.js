const express = require('express');
const router = express.Router();
const File = require('../models/File');
const path = require('path');

router.get('/', (req, res) => {
  res.render('index', {
    user: req.user || null,
    title: 'CloudNest - Your Personal Cloud Storage'
  });
});

router.get('/share/:link', async (req, res) => {
  try {
    const file = await File.findOne({ shareLink: req.params.link });
    
    if (!file || (file.shareExpiry && file.shareExpiry < new Date())) {
      return res.status(404).send(`
        <h1>Link Expired or Invalid</h1>
        <p>The share link you're trying to access is invalid or has expired.</p>
        <a href="/">Go to CloudNest</a>
      `);
    }
    
    file.downloads += 1;
    await file.save();
    
    res.download(file.path, file.originalName);
  } catch (error) {
    res.status(500).send('Error downloading file');
  }
});

router.get('/dashboard', (req, res) => {
  res.render('pages/dashboard');
});

router.get('/analytics', (req, res) => {
  res.render('pages/analytics');
});

module.exports = router;