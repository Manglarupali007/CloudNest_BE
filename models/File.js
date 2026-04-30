const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shareLink: {
    type: String,
    unique: true,
    sparse: true
  },
  shareExpiry: {
    type: Date
  },
  downloads: {
    type: Number,
    default: 0
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [String],
  description: {
    type: String,
    maxlength: 500
  },
  folder: {
    type: String,
    default: 'root'
  }
}, {
  timestamps: true
});

// Index for faster search
fileSchema.index({ originalName: 'text', tags: 'text' });
fileSchema.index({ owner: 1, createdAt: -1 });

// Method to generate share link
fileSchema.methods.generateShareLink = function() {
  const crypto = require('crypto');
  this.shareLink = crypto.randomBytes(16).toString('hex');
  this.shareExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return this.shareLink;
};

module.exports = mongoose.model('File', fileSchema);