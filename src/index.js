require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const errorHandler = require('../middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Routes - sahi file names do
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/files', require('./routes/filesRoutes'));  // ← filesRoutes.js (plural)
app.use('/api/analytics', require('./routes/analyticsRoutes'));  // ← analytics routes

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use(errorHandler);

// Start server only when this file is executed directly
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`✅ Test API: http://localhost:${PORT}/api/test`);
    });
}

// Export for serverless and testing
module.exports = app;