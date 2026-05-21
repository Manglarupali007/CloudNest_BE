const { PrismaClient } = require('@prisma/client');
const { cloudinary } = require('../utils/cloudinary');
const crypto = require('crypto');

const prisma = new PrismaClient();

// @desc    Upload file
// @route   POST /api/files/upload
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        // Get tags from request body (comma separated)
        const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [];
        
        // Save file metadata to database
        const file = await prisma.file.create({
            data: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                size: req.file.size,
                mimeType: req.file.mimetype,
                ownerId: req.user.id,
                tags: tags.join(',')
            }
        });
        
        // Update user storage
        await prisma.user.update({
            where: { id: req.user.id },
            data: { storageUsed: { increment: req.file.size } }
        });
        
        // Fetch fresh user data
        const freshUser = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        
        res.status(201).json({
            success: true,
            file,
            storageUsed: freshUser.storageUsed
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all user files
// @route   GET /api/files/my-files
const getUserFiles = async (req, res) => {
    try {
        const { search, type, favourite, tag } = req.query;
        
        let whereClause = { ownerId: req.user.id };
        
        // Search by name
        if (search) {
            whereClause.originalName = { contains: search, mode: 'insensitive' };
        }
        
        // Filter by type
        if (type && type !== 'all') {
            if (type === 'image') {
                whereClause.mimeType = { startsWith: 'image/' };
            } else if (type === 'pdf') {
                whereClause.mimeType = 'application/pdf';
            } else if (type === 'document') {
                whereClause.mimeType = { in: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'] };
            }
        }
        
        // Filter favourites
        if (favourite === 'true') {
            whereClause.isFavourite = true;
        }
        
        // Filter by tag
        if (tag) {
            whereClause.tags = { contains: tag, mode: 'insensitive' };
        }
        
        const files = await prisma.file.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });
        
        res.json({ success: true, files });
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single file
// @route   GET /api/files/:id
const getFile = async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.json({ success: true, file });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete file
// @route   DELETE /api/files/:id
const deleteFile = async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Delete from local storage
        const fs = require('fs');
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        
        // Delete from database
        await prisma.file.delete({ where: { id: req.params.id } });
        
        // Update user storage
        await prisma.user.update({
            where: { id: req.user.id },
            data: { storageUsed: { decrement: file.size } }
        });
        
        // Fetch fresh user data
        const freshUserAfterDelete = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        
        res.json({ 
            success: true, 
            message: 'File deleted successfully',
            storageUsed: freshUserAfterDelete.storageUsed
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle favourite
// @route   POST /api/files/:id/favourite
const toggleFavourite = async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const updatedFile = await prisma.file.update({
            where: { id: req.params.id },
            data: { isFavourite: !file.isFavourite }
        });
        
        res.json({ 
            success: true, 
            isFavourite: updatedFile.isFavourite 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Generate share link
// @route   POST /api/files/:id/share
const generateShareLink = async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const shareLink = crypto.randomBytes(16).toString('hex');
        const shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        const updatedFile = await prisma.file.update({
            where: { id: req.params.id },
            data: { shareLink, shareExpiry }
        });
        
        res.json({ 
            success: true, 
            shareLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${shareLink}`,
            expiry: shareExpiry
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add tags to file
// @route   POST /api/files/:id/tags
const addTags = async (req, res) => {
    try {
        const { tags } = req.body;
        
        const file = await prisma.file.findFirst({
            where: { id: req.params.id, ownerId: req.user.id }
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const updatedFile = await prisma.file.update({
            where: { id: req.params.id },
            data: { tags: tags }
        });
        
        res.json({ success: true, tags: updatedFile.tags });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Download file (public share)
// @route   GET /share/:link
const downloadSharedFile = async (req, res) => {
    try {
        const file = await prisma.file.findFirst({
            where: { 
                shareLink: req.params.link,
                shareExpiry: { gt: new Date() }
            }
        });
        
        if (!file) {
            return res.status(404).send(`
                <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h1>🔗 Link Expired or Invalid</h1>
                    <p>This share link is no longer valid or has expired.</p>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">Go to CloudNest</a>
                </body>
                </html>
            `);
        }
        
        // Increment download count
        await prisma.file.update({
            where: { id: file.id },
            data: { downloads: { increment: 1 } }
        });
        
        // Redirect to Cloudinary URL
        res.redirect(file.cloudinaryUrl);
    } catch (error) {
        res.status(500).send('Error downloading file');
    }
};

module.exports = {
    uploadFile,
    getUserFiles,
    getFile,
    deleteFile,
    toggleFavourite,
    generateShareLink,
    addTags,
    downloadSharedFile
};