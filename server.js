require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/cloudnest')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Ensure directories exist
const dirs = ['./uploads', './public', './public/css', './public/js'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session
app.use(session({
  secret: 'cloudnest-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ========== MODELS ==========
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  storageUsed: { type: Number, default: 0 },
  storageLimit: { type: Number, default: 100 * 1024 * 1024 },
  theme: { type: String, default: 'dark' },
  notifications: { type: Boolean, default: true },
  autoDelete: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  createdAt: { type: Date, default: Date.now }
});

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isFavourite: { type: Boolean, default: false },
  shareLink: { type: String, default: null },
  shareExpiry: { type: Date, default: null },
  downloads: { type: Number, default: 0 },
  tags: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const File = mongoose.model('File', fileSchema);

// ========== MULTER ==========
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ========== AUTH MIDDLEWARE ==========
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, 'cloudnest-jwt-secret');
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    const token = jwt.sign({ id: user._id }, 'cloudnest-jwt-secret', { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, storageUsed: user.storageUsed, storageLimit: user.storageLimit } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, 'cloudnest-jwt-secret', { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, storageUsed: user.storageUsed, storageLimit: user.storageLimit } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

app.put('/api/user/settings', auth, async (req, res) => {
  try {
    const { theme, notifications, autoDelete, language } = req.body;
    if (theme) req.user.theme = theme;
    if (notifications !== undefined) req.user.notifications = notifications;
    if (autoDelete !== undefined) req.user.autoDelete = autoDelete;
    if (language) req.user.language = language;
    await req.user.save();
    res.json({ success: true, user: req.user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== FILE ROUTES ==========
app.post('/api/files/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (req.user.storageUsed + req.file.size > req.user.storageLimit) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Storage limit exceeded' });
    }
    const file = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      owner: req.user._id,
      tags: req.body.tags ? req.body.tags.split(',') : []
    });
    req.user.storageUsed += req.file.size;
    await req.user.save();
    res.json({ success: true, file, storageUsed: req.user.storageUsed, storageLimit: req.user.storageLimit });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/files/my-files', auth, async (req, res) => {
  try {
    const { search, type, favourite } = req.query;
    let query = { owner: req.user._id };
    if (search) query.originalName = { $regex: search, $options: 'i' };
    if (type && type !== 'all') {
      if (type === 'image') query.mimeType = { $regex: '^image/' };
      else if (type === 'pdf') query.mimeType = 'application/pdf';
      else if (type === 'document') query.mimeType = { $regex: 'text|word|document' };
      else query.mimeType = { $regex: type, $options: 'i' };
    }
    if (favourite === 'true') query.isFavourite = true;
    const files = await File.find(query).sort({ createdAt: -1 });
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/files/:id', auth, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    req.user.storageUsed -= file.size;
    await req.user.save();
    await file.deleteOne();
    res.json({ success: true, message: 'File deleted', storageUsed: req.user.storageUsed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/files/:id/favourite', auth, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    file.isFavourite = !file.isFavourite;
    await file.save();
    res.json({ success: true, isFavourite: file.isFavourite });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/files/:id/share', auth, async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    const crypto = require('crypto');
    const shareLink = crypto.randomBytes(16).toString('hex');
    file.shareLink = shareLink;
    file.shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await file.save();
    res.json({ success: true, shareLink: `http://localhost:3000/share/${shareLink}`, expiry: file.shareExpiry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/files/:id/tags', auth, async (req, res) => {
  try {
    const { tags } = req.body;
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    file.tags = tags;
    await file.save();
    res.json({ success: true, tags: file.tags });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/share/:link', async (req, res) => {
  try {
    const file = await File.findOne({ shareLink: req.params.link, shareExpiry: { $gt: new Date() } });
    if (!file) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:50px">
          <h1>🔗 Link Expired or Invalid</h1>
          <p>This share link is no longer valid.</p>
          <a href="http://localhost:3000">Go to CloudNest</a>
        </body></html>
      `);
    }
    file.downloads += 1;
    await file.save();
    res.download(file.path, file.originalName);
  } catch (err) {
    res.status(500).send('Error downloading file');
  }
});

// ========== ANALYTICS ==========
app.get('/api/analytics/stats', auth, async (req, res) => {
  try {
    const totalFiles = await File.countDocuments({ owner: req.user._id });
    const sharedFiles = await File.countDocuments({ owner: req.user._id, shareLink: { $ne: null } });
    const totalDownloadsResult = await File.aggregate([
      { $match: { owner: req.user._id } },
      { $group: { _id: null, total: { $sum: "$downloads" } } }
    ]);
    const favouriteFiles = await File.countDocuments({ owner: req.user._id, isFavourite: true });

    const fileTypes = await File.aggregate([
      { $match: { owner: req.user._id } },
      { $group: {
        _id: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: "$mimeType", regex: "^image/" } }, then: "Images" },
              { case: { $eq: ["$mimeType", "application/pdf"] }, then: "PDFs" },
              { case: { $regexMatch: { input: "$mimeType", regex: "text|word|document" } }, then: "Documents" }
            ],
            default: "Others"
          }
        },
        count: { $sum: 1 },
        size: { $sum: "$size" }
      } }
    ]);

    const allTags = await File.aggregate([
      { $match: { owner: req.user._id, tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const count = await File.countDocuments({
        owner: req.user._id,
        createdAt: { $gte: date, $lt: nextDay }
      });
      last7Days.push({ date: date.toLocaleDateString(), count });
    }

    const insights = [];
    if (totalFiles === 0) insights.push("📁 Upload your first file to get started!");
    if (req.user.storageUsed / req.user.storageLimit > 0.8) insights.push("⚠️ You're using over 80% of your storage. Consider upgrading.");
    if (sharedFiles > 5) insights.push(`🔗 You've shared ${sharedFiles} files. Great for collaboration!`);
    if (favouriteFiles > 10) insights.push(`❤️ You have ${favouriteFiles} favourite files. Quick access!`);
    if (insights.length === 0) insights.push("🎉 You're doing great! Keep using CloudNest.");

    res.json({
      success: true,
      stats: {
        totalFiles,
        sharedFiles,
        totalDownloads: totalDownloadsResult[0]?.total || 0,
        favouriteFiles,
        storageUsed: req.user.storageUsed,
        storageLimit: req.user.storageLimit,
        storagePercentage: (req.user.storageUsed / req.user.storageLimit) * 100,
        fileTypes,
        allTags,
        last7Days,
        insights
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== AI SEARCH ==========
app.post('/api/tools/ai-search', auth, async (req, res) => {
  try {
    const { query } = req.body;
    const files = await File.find({ owner: req.user._id, originalName: { $regex: query, $options: 'i' } });
    const suggestions = ["documents", "images", "pdf files", "recent files", "large files", "favourites"];
    res.json({
      success: true,
      results: files,
      suggestions: suggestions.filter(s => s.includes(query.toLowerCase())),
      message: files.length > 0 ? `Found ${files.length} matching files` : "No files found. Try different keywords."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/tools/bulk-delete', auth, async (req, res) => {
  try {
    const { fileIds } = req.body;
    let deletedCount = 0;
    let freedSpace = 0;
    for (const fileId of fileIds) {
      const file = await File.findOne({ _id: fileId, owner: req.user._id });
      if (file) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        freedSpace += file.size;
        await file.deleteOne();
        deletedCount++;
      }
    }
    req.user.storageUsed -= freedSpace;
    await req.user.save();
    res.json({ success: true, deletedCount, freedSpace });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== SERVE FRONTEND ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CloudNest running on http://localhost:${PORT}`);
  console.log(`✅ MongoDB Connected`);
});