const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');
const AppError = require('../utils/AppError');

class FileService {
  async uploadFile(file, owner, metadata = {}) {
    try {
      // Create file record in database
      const newFile = await File.create({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype,
        owner: owner._id,
        tags: metadata.tags || [],
        description: metadata.description || '',
        folder: metadata.folder || 'root'
      });
      
      // Update user storage
      await User.findByIdAndUpdate(owner._id, {
        $inc: { storageUsed: file.size }
      });
      
      return newFile;
    } catch (error) {
      // Delete uploaded file if database operation fails
      await fs.unlink(file.path);
      throw error;
    }
  }
  
  async deleteFile(fileId, userId) {
    const file = await File.findOne({ _id: fileId, owner: userId });
    
    if (!file) {
      throw new AppError('File not found or unauthorized', 404);
    }
    
    // Delete physical file
    await fs.unlink(file.path);
    
    // Update user storage
    await User.findByIdAndUpdate(userId, {
      $inc: { storageUsed: -file.size }
    });
    
    // Delete database record
    await file.remove();
    
    return { success: true };
  }
  
  async getUserFiles(userId, filters = {}) {
    const query = { owner: userId };
    
    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    
    if (filters.mimeType) {
      query.mimeType = { $regex: filters.mimeType, $options: 'i' };
    }
    
    if (filters.folder) {
      query.folder = filters.folder;
    }
    
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100);
    
    return files;
  }
  
  async generateShareLink(fileId, userId, expiryDays = 7) {
    const file = await File.findOne({ _id: fileId, owner: userId });
    
    if (!file) {
      throw new AppError('File not found', 404);
    }
    
    const shareLink = file.generateShareLink();
    await file.save();
    
    return `${process.env.BASE_URL}/share/${shareLink}`;
  }
  
  async getSharedFile(shareToken) {
    const file = await File.findOne({
      shareLink: shareToken,
      shareExpiry: { $gt: new Date() }
    });
    
    if (!file) {
      throw new AppError('Share link is invalid or expired', 404);
    }
    
    // Increment download count
    file.downloads += 1;
    await file.save();
    
    return file;
  }
  
  async getStorageAnalytics(userId) {
    const stats = await File.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          totalSize: { $sum: "$size" }
        }
      },
      { $sort: { "_id": 1 } },
      { $limit: 30 }
    ]);
    
    const totalFiles = await File.countDocuments({ owner: userId });
    const totalSize = await File.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: null, total: { $sum: "$size" } } }
    ]);
    
    return {
      dailyStats: stats,
      totalFiles,
      totalSize: totalSize[0]?.total || 0,
      fileTypeDistribution: await this.getFileTypeDistribution(userId)
    };
  }
  
  async getFileTypeDistribution(userId) {
    const distribution = await File.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: {
            $arrayElemAt: [{ $split: ["$mimeType", "/"] }, 0]
          },
          count: { $sum: 1 },
          size: { $sum: "$size" }
        }
      }
    ]);
    
    return distribution;
  }
}

module.exports = new FileService();