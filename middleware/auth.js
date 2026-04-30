const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  
  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // Check for token in cookies
  else if (req.cookies.token) {
    token = req.cookies.token;
  }
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please login to access this resource'
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists'
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please login again'
    });
  }
};

const checkStorageLimit = async (req, res, next) => {
  const fileSize = req.file ? req.file.size : 0;
  
  if (req.user.storageUsed + fileSize > req.user.storageLimit) {
    return res.status(400).json({
      success: false,
      message: 'Storage limit exceeded. Delete some files to upload more.'
    });
  }
  next();
};

module.exports = { protect, checkStorageLimit };