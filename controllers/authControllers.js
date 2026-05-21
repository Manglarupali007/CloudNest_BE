const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// @desc    Register user
// @route   POST /api/auth/register
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide name, email and password' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword
            }
        });
        
        // Generate token
        const token = generateToken(user.id);
        
        // Set cookie
        res.cookie('token', token, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        res.status(201).json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                theme: user.theme,
                notifications: user.notifications
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide email and password' 
            });
        }
        
        // Find user
        const user = await prisma.user.findUnique({
            where: { email }
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { updatedAt: new Date() }
        });
        
        // Generate token
        const token = generateToken(user.id);
        
        // Set cookie
        res.cookie('token', token, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                theme: user.theme,
                notifications: user.notifications
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                files: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit,
                theme: user.theme,
                notifications: user.notifications,
                autoDelete: user.autoDelete,
                language: user.language,
                recentFiles: user.files
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
const logout = async (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
};

// @desc    Update user settings
// @route   PUT /api/user/settings
const updateSettings = async (req, res) => {
    try {
        const { theme, notifications, autoDelete, language } = req.body;
        
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                theme: theme || undefined,
                notifications: notifications !== undefined ? notifications : undefined,
                autoDelete: autoDelete !== undefined ? autoDelete : undefined,
                language: language || undefined
            }
        });
        
        res.json({
            success: true,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                theme: updatedUser.theme,
                notifications: updatedUser.notifications,
                autoDelete: updatedUser.autoDelete,
                language: updatedUser.language
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Upgrade storage
// @route   POST /api/user/upgrade-storage
const upgradeStorage = async (req, res) => {
    try {
        const newLimit = 1024 * 1024 * 1024; // 1GB
        
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { storageLimit: newLimit }
        });
        
        res.json({
            success: true,
            message: 'Storage upgraded to 1GB!',
            storageLimit: updatedUser.storageLimit
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    register,
    login,
    getMe,
    logout,
    updateSettings,
    upgradeStorage
};