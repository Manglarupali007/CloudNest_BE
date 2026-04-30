const File = require('../models/File');
const User = require('../models/User');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Total files
    const totalFiles = await File.countDocuments({ owner: userId });
    
    // Storage used
    const user = await User.findById(userId);
    const storageUsed = user.storageUsed;
    const storageLimit = user.storageLimit;
    const storagePercentage = (storageUsed / storageLimit) * 100;
    
    // File type distribution
    const fileTypes = await File.aggregate([
      { $match: { owner: userId } },
      {
        $group: {
          _id: {
            $arrayElemAt: [{ $split: ["$mimeType", "/"] }, 0]
          },
          count: { $sum: 1 },
          totalSize: { $sum: "$size" }
        }
      }
    ]);
    
    // Recent activity (last 7 days)
    const last7Days = await File.aggregate([
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
      { $limit: 7 }
    ]);
    
    // Most downloaded files
    const topFiles = await File.find({ owner: userId })
      .sort({ downloads: -1 })
      .limit(5)
      .select('originalName downloads size');
    
    res.json({
      success: true,
      stats: {
        totalFiles,
        storageUsed,
        storageLimit,
        storagePercentage,
        fileTypes,
        last7Days,
        topFiles
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};