const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// @desc    Get dashboard statistics
// @route   GET /api/analytics/stats
const getStats = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Total files
        const totalFiles = await prisma.file.count({
            where: { ownerId: userId }
        });
        
        // Shared files
        const sharedFiles = await prisma.file.count({
            where: { 
                ownerId: userId,
                shareLink: { not: null }
            }
        });
        
        // Total downloads
        const totalDownloadsAgg = await prisma.file.aggregate({
            where: { ownerId: userId },
            _sum: { downloads: true }
        });
        const totalDownloads = totalDownloadsAgg._sum.downloads || 0;
        
        // Favourite files
        const favouriteFiles = await prisma.file.count({
            where: { ownerId: userId, isFavourite: true }
        });
        
        // File type distribution
        const files = await prisma.file.findMany({
            where: { ownerId: userId },
            select: { mimeType: true, size: true }
        });
        
        const fileTypes = {};
        files.forEach(file => {
            let type = 'Others';
            if (file.mimeType.startsWith('image/')) type = 'Images';
            else if (file.mimeType === 'application/pdf') type = 'PDFs';
            else if (file.mimeType.includes('word') || file.mimeType.includes('text')) type = 'Documents';
            else if (file.mimeType.startsWith('video/')) type = 'Videos';
            else if (file.mimeType.startsWith('audio/')) type = 'Audio';
            
            if (!fileTypes[type]) {
                fileTypes[type] = { count: 0, size: 0 };
            }
            fileTypes[type].count++;
            fileTypes[type].size += file.size;
        });
        
        const fileTypesArray = Object.keys(fileTypes).map(key => ({
            name: key,
            count: fileTypes[key].count,
            size: fileTypes[key].size
        }));
        
        // Popular tags
        const allFiles = await prisma.file.findMany({
            where: { ownerId: userId, tags: { not: '' } },
            select: { tags: true }
        });
        
        const tagCounts = {};
        allFiles.forEach(file => {
            if (file.tags) {
                const tagsArray = file.tags.split(',').map(t => t.trim()).filter(t => t);
                tagsArray.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });
        
        const popularTags = Object.keys(tagCounts)
            .map(tag => ({ tag, count: tagCounts[tag] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        // Last 7 days activity
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            
            const count = await prisma.file.count({
                where: {
                    ownerId: userId,
                    createdAt: { gte: date, lt: nextDay }
                }
            });
            
            last7Days.push({
                date: date.toLocaleDateString(),
                count
            });
        }
        
        // AI Insights
        const insights = [];
        
        // Fetch fresh user data to get latest storageUsed
        const freshUser = await prisma.user.findUnique({
            where: { id: userId }
        });
        
        const storagePercentage = (freshUser.storageUsed / freshUser.storageLimit) * 100;
        
        if (totalFiles === 0) {
            insights.push("📁 Upload your first file to get started!");
        } else {
            insights.push(`📁 You have ${totalFiles} file${totalFiles > 1 ? 's' : ''} in your cloud`);
        }
        
        if (storagePercentage > 80) {
            insights.push("⚠️ You're using over 80% of your storage. Consider upgrading or deleting old files.");
        } else if (storagePercentage > 50) {
            insights.push(`📊 You've used ${storagePercentage.toFixed(1)}% of your storage. Good going!`);
        }
        
        if (sharedFiles > 0) {
            insights.push(`🔗 You've shared ${sharedFiles} file${sharedFiles > 1 ? 's' : ''}. Great for collaboration!`);
        }
        
        if (favouriteFiles > 5) {
            insights.push(`❤️ You have ${favouriteFiles} favourite files. Quick access to important documents!`);
        }
        
        if (totalDownloads > 10) {
            insights.push(`📈 Your files have been downloaded ${totalDownloads} times. Popular content!`);
        }
        
        if (insights.length === 0) {
            insights.push("🎉 You're doing great! Keep using CloudNest for secure storage.");
        }
        
        res.json({
            success: true,
            stats: {
                totalFiles,
                sharedFiles,
                totalDownloads,
                favouriteFiles,
                storageUsed: freshUser.storageUsed,
                storageLimit: freshUser.storageLimit,
                storagePercentage,
                fileTypes: fileTypesArray,
                popularTags,
                last7Days,
                insights
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getStats };