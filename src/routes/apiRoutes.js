const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/analyticsController');

router.get('/dashboard/stats', protect, getDashboardStats);

module.exports = router;