const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Main page route
router.get('/', (req, res) => {
  // Read saved SMTP configurations
  const smtpFilePath = path.join(__dirname, '..', 'smtp.json');
  let smtpConfigs = [];
  
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      smtpConfigs = JSON.parse(smtpData).map(config => {
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
    title: 'Inderman Mailer v1.0',
    smtpConfigs: smtpConfigs
  });
});

module.exports = router;
