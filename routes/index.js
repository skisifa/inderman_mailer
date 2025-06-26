const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');

// Main page route - requires authentication
router.get('/', authenticate, (req, res) => {
  // Read saved SMTP configurations
  const smtpFilePath = path.join(__dirname, '..', 'smtp.json');
  let smtpConfigs = [];
  
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      const allConfigs = JSON.parse(smtpData);
      
      // Filter configurations to only show those belonging to the current user
      const userConfigs = allConfigs.filter(config => config.userId === req.session.userId);
      
      smtpConfigs = userConfigs.map(config => {
        // Don't send passwords to frontend
        return {
          id: config.id,
          host: config.host,
          port: config.port,
          user: config.user,
          // Password is omitted for security
        };
      });
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
  }
  
  res.render('index', { 
    title: 'Inderman Mailer',
    smtpConfigs: smtpConfigs,
    currentUser: req.session.username,
    userId: req.session.userId
  });
});

module.exports = router;
