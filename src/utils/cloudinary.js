const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dummy',
    api_key: process.env.CLOUDINARY_API_KEY || 'dummy',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'dummy'
});

// Test connection (with error handling)
if (process.env.NODE_ENV !== 'test') {
    cloudinary.api.ping()
        .then(() => console.log('✅ Cloudinary Connected'))
        .catch(err => console.error('❌ Cloudinary Error:', err.message));
}

// Storage config
let storage;
try {
    storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'cloudnest',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'doc', 'docx'],
            resource_type: 'auto'
        }
    });
} catch (error) {
    console.error('Cloudinary storage error:', error.message);
    // Fallback storage
    const multer = require('multer');
    storage = multer.diskStorage({
        destination: './uploads/',
        filename: (req, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname);
        }
    });
}

module.exports = { cloudinary, storage };