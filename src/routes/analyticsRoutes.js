const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth');
const analyticsController = require('../../controllers/analyticsController');

router.get('/stats', protect, analyticsController.getStats);

module.exports = router;