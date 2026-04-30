const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs').promises;
const { getIO } = require('../config/socket');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const file = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      owner: req.user._id
    });
    
    // Update user storage
    req.user.storageUsed += req.file.size;
    await req.user.save();
    
    // Emit socket event
    const io = getIO();
    io.to(`user_${req.user._id}`).emit('file-uploaded', {
      file: {
        id: file._id,
        name: file.originalName,
        size: file.size
      },
      storageUsed: req.user.storageUsed
    });
    
    res.json({
      success: true,
      file
    });
  } catch (error) {
    if (req.file) await fs.unlink(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const { search, type, folder } = req.query;
    let query = { owner: req.user._id };
    
    if (search) {
      query.originalName = { $regex: search, $options: 'i' };
    }
    
    if (type) {
      query.mimeType = { $regex: type, $options: 'i' };
    }
    
    if (folder && folder !== 'all') {
      query.folder = folder;
    }
    
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id
    });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Delete physical file
    await fs.unlink(file.path);
    
    // Delete from database
    await file.deleteOne();
    
    // Update user storage
    req.user.storageUsed -= file.size;
    await req.user.save();
    
    // Emit socket event
    const io = getIO();
    io.to(`user_${req.user._id}`).emit('file-deleted', {
      fileId: file._id,
      storageUsed: req.user.storageUsed
    });
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateShareLink = async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.user._id
    });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    const shareLink = file.generateShareLink();
    await file.save();
    
    res.json({
      success: true,
      shareLink: `${process.env.BASE_URL}/share/${shareLink}`,
      expiry: file.shareExpiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};