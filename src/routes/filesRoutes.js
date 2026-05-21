const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Auth middleware
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Ensure uploads folder exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Multer setup (local storage - fallback)
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Upload file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const file = await prisma.file.create({
            data: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                size: req.file.size,
                mimeType: req.file.mimetype,
                ownerId: req.user.id,
                tags: req.body.tags || ''
            }
        });

        await prisma.user.update({
            where: { id: req.user.id },
            data: { storageUsed: { increment: req.file.size } }
        });

        res.json({ success: true, file });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get my files
router.get('/my-files', auth, async (req, res) => {
    try {
        const files = await prisma.file.findMany({
            where: { ownerId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete file
router.delete('/:id', auth, async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        await prisma.file.delete({ where: { id: req.params.id } });
        await prisma.user.update({
            where: { id: req.user.id },
            data: { storageUsed: { decrement: file.size } }
        });

        res.json({ success: true, message: 'File deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Download file
router.get('/:id/download', auth, async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (!file.path || !fs.existsSync(file.path)) {
            return res.status(404).json({ success: false, message: 'File is unavailable on disk' });
        }

        await prisma.file.update({
            where: { id: req.params.id },
            data: { downloads: { increment: 1 } }
        });

        res.download(file.path, file.originalName, (err) => {
            if (err) {
                console.error('Download error:', err);
                return res.status(500).json({ success: false, message: 'Unable to download file' });
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Toggle favourite
router.post('/:id/favourite', auth, async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const updated = await prisma.file.update({
            where: { id: req.params.id },
            data: { isFavourite: !file.isFavourite }
        });

        res.json({ success: true, isFavourite: updated.isFavourite });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add or update tags
router.post('/:id/tags', auth, async (req, res) => {
    try {
        const { tags } = req.body;
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const normalizedTags = Array.isArray(tags)
            ? tags.map(t => t.trim()).filter(Boolean)
            : typeof tags === 'string'
                ? tags.split(',').map(t => t.trim()).filter(Boolean)
                : [];

        await prisma.file.update({
            where: { id: req.params.id },
            data: { tags: normalizedTags.join(',') }
        });

        res.json({ success: true, tags: normalizedTags });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Generate share link
router.post('/:id/share', auth, async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const shareLink = crypto.randomBytes(16).toString('hex');
        const shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.file.update({
            where: { id: req.params.id },
            data: { shareLink, shareExpiry }
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.json({ success: true, shareLink: `${frontendUrl}/api/files/share/${shareLink}`, expiry: shareExpiry });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Public download via share link
router.get('/share/:link', async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: {
                shareLink: req.params.link,
                shareExpiry: { gt: new Date() }
            }
        });

        if (!file) {
            return res.status(404).json({ success: false, message: 'Share link expired or invalid' });
        }

        if (!file.path || !fs.existsSync(file.path)) {
            return res.status(404).json({ success: false, message: 'File is unavailable on disk' });
        }

        await prisma.file.update({
            where: { id: file.id },
            data: { downloads: { increment: 1 } }
        });

        res.download(file.path, file.originalName, (err) => {
            if (err) {
                console.error('Share download error:', err);
                return res.status(500).json({ success: false, message: 'Unable to download shared file' });
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;