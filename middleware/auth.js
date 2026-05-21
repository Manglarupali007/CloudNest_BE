const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const protect = async (req, res, next) => {
    let token;
    
    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized. Please login.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User no longer exists' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Invalid token. Please login again.' 
        });
    }
};

const checkStorageLimit = async (req, res, next) => {
    if (!req.file) return next();
    
    const fileSize = req.file.size;
    
    if (req.user.storageUsed + fileSize > req.user.storageLimit) {
        return res.status(400).json({
            success: false,
            message: `Storage limit exceeded. You have ${formatBytes(req.user.storageLimit - req.user.storageUsed)} left.`
        });
    }
    next();
};

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { protect, checkStorageLimit };