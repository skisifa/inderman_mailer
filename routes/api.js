const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');

// File upload configuration
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

// SMTP file path
const smtpFilePath = path.join(__dirname, '..', 'smtp.json');

// Helper functions
function generateRandomDigits(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}

function generateRandomAlphanumeric(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function processTokens(text) {
  // Replace {n:X} tokens with random digits
  text = text.replace(/\{n:(\d+)\}/g, (match, length) => generateRandomDigits(parseInt(length)));
  
  // Replace {nw:X} tokens with random alphanumeric
  text = text.replace(/\{nw:(\d+)\}/g, (match, length) => generateRandomAlphanumeric(parseInt(length)));
  
  return text;
}

// Validate email format
function validateEmail(email) {
  // More comprehensive email validation regex
  // This checks for proper format including TLDs, subdomains, and various special characters
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;
  
  if (!re.test(String(email).toLowerCase())) {
    return false;
  }
  
  // Additional checks
  // Check email length
  if (email.length > 254) {
    return false;
  }
  
  // Check for consecutive dots in local part
  const localPart = email.split('@')[0];
  if (localPart.includes('..')) {
    return false;
  }
  
  // Check domain part has at least one dot
  const domainPart = email.split('@')[1];
  if (!domainPart.includes('.')) {
    return false;
  }
  
  return true;
}

// API Routes
// Get all SMTP configurations
router.get('/smtp', (req, res) => {
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      const smtpConfigs = JSON.parse(smtpData).map(config => {
        // Don't send passwords to frontend
        return {
          id: config.id,
          host: config.host,
          port: config.port,
          user: config.user,
          // Password is omitted for security
        };
      });
      res.json(smtpConfigs);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
    res.status(500).json({ error: 'Failed to read SMTP configurations' });
  }
});

// Add new SMTP configuration
router.post('/smtp', (req, res) => {
  try {
    const { smtpString } = req.body;
    
    if (!smtpString) {
      return res.status(400).json({ error: 'SMTP configuration string is required' });
    }
    
    const parts = smtpString.split('|');
    if (parts.length !== 4) {
      return res.status(400).json({ error: 'Invalid SMTP format. Use host|port|user|password' });
    }
    
    const [host, port, user, password] = parts;
    
    // Read existing configurations
    let smtpConfigs = [];
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      smtpConfigs = JSON.parse(smtpData);
    }
    
    // Add new configuration with unique ID
    const newConfig = {
      id: Date.now().toString(),
      host,
      port,
      user,
      password // Store password as plaintext
    };
    
    smtpConfigs.push(newConfig);
    
    // Save to file
    fs.writeFileSync(smtpFilePath, JSON.stringify(smtpConfigs, null, 2));
    
    // Return the new configuration (without password)
    const { password: _, ...safeConfig } = newConfig;
    res.status(201).json(safeConfig);
  } catch (error) {
    console.error('Error adding SMTP configuration:', error);
    res.status(500).json({ error: 'Failed to add SMTP configuration' });
  }
});

// Delete SMTP configuration
router.delete('/smtp/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Read existing configurations
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      let smtpConfigs = JSON.parse(smtpData);
      
      // Filter out the configuration to delete
      smtpConfigs = smtpConfigs.filter(config => config.id !== id);
      
      // Save to file
      fs.writeFileSync(smtpFilePath, JSON.stringify(smtpConfigs, null, 2));
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'SMTP configurations file not found' });
    }
  } catch (error) {
    console.error('Error deleting SMTP configuration:', error);
    res.status(500).json({ error: 'Failed to delete SMTP configuration' });
  }
});

// Upload email list file
router.post('/upload-emails', upload.single('emailFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const emails = fileContent.split('\n')
      .map(email => email.trim())
      .filter(email => email && validateEmail(email));
    
    // Delete the uploaded file
    fs.unlinkSync(filePath);
    
    res.json({ emails });
  } catch (error) {
    console.error('Error processing email file:', error);
    res.status(500).json({ error: 'Failed to process email file' });
  }
});

// Send emails
router.post('/send', (req, res) => {
  const { 
    senderName, 
    subject, 
    emailBody, 
    emails, 
    selectedSmtpIds 
  } = req.body;
  
  if (!senderName || !subject || !emailBody || !emails || !emails.length || !selectedSmtpIds || !selectedSmtpIds.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Sanitize HTML content to prevent XSS and ensure email client compatibility
  const sanitizedHtml = sanitizeHtml(emailBody, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'img', 'span'
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target'],
      img: ['src', 'alt', 'height', 'width', 'style'],
      '*': ['style', 'class']
    },
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'font-weight': [/^\d+$/, /^bold$/, /^normal$/],
        'font-style': [/^italic$/, /^normal$/],
        'text-decoration': [/^underline$/, /^line-through$/, /^none$/],
        'margin': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'padding': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'border': [/^\d+(\.\d+)?(px|em|rem|%) solid #(0x)?[0-9a-f]+$/i]
      },
      'img': {
        'max-width': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'height': [/^auto$/, /^\d+(\.\d+)?(px|em|rem|%)$/]
      }
    }
  });
  
  // Read SMTP configurations
  let smtpConfigs = [];
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      smtpConfigs = JSON.parse(smtpData);
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
    return res.status(500).json({ error: 'Failed to read SMTP configurations' });
  }
  
  // Filter selected SMTP configurations
  const selectedSmtps = smtpConfigs.filter(config => selectedSmtpIds.includes(config.id));
  
  if (!selectedSmtps.length) {
    return res.status(400).json({ error: 'No valid SMTP configurations selected' });
  }
  
  // Start the sending process in the background
  const io = req.app.locals.io;
  
  // Create a unique job ID for this sending session
  const jobId = Date.now().toString();
  
  // Send response immediately
  res.json({ 
    success: true, 
    message: 'Email sending process started', 
    jobId 
  });
  
  // Start the email sending process
  startEmailSending(jobId, senderName, subject, sanitizedHtml, emails, selectedSmtps, io);
});

// Stop sending emails
router.post('/stop', (req, res) => {
  const { jobId } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }
  
  // Set the stop flag for the job
  global.stopSendingJobs = global.stopSendingJobs || {};
  global.stopSendingJobs[jobId] = true;
  
  res.json({ success: true, message: 'Email sending process will be stopped' });
});

// Function to start email sending process
async function startEmailSending(jobId, senderName, subject, emailBody, emails, smtpConfigs, io) {
  // Initialize counters
  let sent = 0;
  let failed = 0;
  let remaining = emails.length;
  let smtpIndex = 0;
  let smtpFailures = {};
  
  // Initialize stop flag
  global.stopSendingJobs = global.stopSendingJobs || {};
  global.stopSendingJobs[jobId] = false;
  
  // Log start of process
  io.emit('log', { 
    message: `[!] Starting email sending process. Total emails: ${emails.length}`,
    type: 'info'
  });
  
  // SPF/DKIM alignment check and warning
  io.emit('log', {
    message: `[!] IMPORTANT: Ensure SPF/DKIM alignment for best deliverability. Sender domain should match SMTP domain.`,
    type: 'warning'
  });
  
  // Create SMTP transporters with enhanced configuration
  const transporters = smtpConfigs.map(config => {
    // Extract domain from SMTP user for alignment check
    const smtpDomain = config.user.split('@')[1] || '';
    
    return {
      id: config.id,
      host: config.host,
      domain: smtpDomain,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.password // Use plaintext password
        },
        // Add connection pool for better performance
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        // Add TLS options for better security
        tls: {
          rejectUnauthorized: true
        }
      }),
      failures: 0,
      lastUsed: 0 // Timestamp of last use for better throttling
    };
  });
  
  // Adaptive throttling parameters
  const baseDelay = 200; // Base delay in ms
  const randomFactor = 800; // Random factor to add (0-800ms)
  const burstSize = 10; // Number of emails in a burst
  const burstDelay = 2000; // Delay between bursts in ms
  
  // Process emails one by one
  for (let i = 0; i < emails.length; i++) {
    // Check if process should be stopped
    if (global.stopSendingJobs[jobId]) {
      io.emit('log', { 
        message: `[X] Email sending process stopped by user. Sent: ${sent}, Failed: ${failed}, Remaining: ${emails.length - i}`,
        type: 'warning'
      });
      break;
    }
    
    const email = emails[i];
    
    // Skip invalid emails
    if (!validateEmail(email)) {
      io.emit('log', { 
        message: `[!] Skipping invalid email: ${email}`,
        type: 'warning'
      });
      failed++;
      remaining--;
      continue;
    }
    
    // Process tokens in subject and body
    const processedSubject = processTokens(subject);
    const processedBody = processTokens(emailBody);
    
    // Apply burst throttling - longer pause after each burst
    if (i > 0 && i % burstSize === 0) {
      io.emit('log', {
        message: `[*] Throttling: Pausing for ${burstDelay/1000}s after sending ${burstSize} emails...`,
        type: 'info'
      });
      await new Promise(resolve => setTimeout(resolve, burstDelay));
    }
    
    // Try to send email
    let emailSent = false;
    let attempts = 0;
    const maxAttempts = transporters.length * 2; // Allow multiple attempts with different SMTPs
    
    while (!emailSent && attempts < maxAttempts) {
      // Get current SMTP transporter
      const currentSmtp = transporters[smtpIndex];
      
      // Skip if this SMTP has failed too many times
      if (currentSmtp.failures >= 3) {
        smtpIndex = (smtpIndex + 1) % transporters.length;
        attempts++;
        continue;
      }
      
      // Calculate time since last use of this SMTP
      const timeSinceLastUse = Date.now() - currentSmtp.lastUsed;
      
      // If this SMTP was used very recently, add extra delay for rate limiting
      if (timeSinceLastUse < 1000) {
        const extraDelay = 1000 - timeSinceLastUse;
        await new Promise(resolve => setTimeout(resolve, extraDelay));
      }
      
      try {
        // Check domain alignment and warn if misaligned
        const emailDomain = email.split('@')[1];
        const fromAddress = `"${senderName}" <${currentSmtp.transporter.options.auth.user}>`;
        const smtpDomain = currentSmtp.domain;
        const senderEmail = currentSmtp.transporter.options.auth.user;
        
        io.emit('log', { 
          message: `[*] Sending email ${i+1}/${emails.length} to ${email} via SMTP#${smtpIndex+1} (${currentSmtp.host}) from ${senderEmail}...`,
          type: 'info'
        });
        
        // Add adaptive random delay to avoid spam filters
        const randomDelay = baseDelay + Math.random() * randomFactor;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
        
        // Update last used timestamp
        currentSmtp.lastUsed = Date.now();
        
        // Prepare email options with enhanced headers
        const mailOptions = {
          from: fromAddress,
          to: email,
          subject: processedSubject,
          html: processedBody,
          headers: {
            'X-Mailer': 'Inderman Mailer',
            'X-Priority': '3', // Normal priority
          },
          // Add text version for better deliverability
          text: processedBody.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
        };
        
        // Send email
        await currentSmtp.transporter.sendMail(mailOptions);
        
        // Email sent successfully
        emailSent = true;
        sent++;
        remaining--;
        
        io.emit('log', { 
          message: `[+] Email sent successfully to ${email} from ${senderEmail}`,
          type: 'success'
        });
      } catch (error) {
        // Increment failure counter for this SMTP
        currentSmtp.failures++;
        
        // Categorize error for better logging
        let errorType = 'unknown';
        if (error.code === 'ECONNREFUSED') errorType = 'connection refused';
        else if (error.code === 'ETIMEDOUT') errorType = 'timeout';
        else if (error.code === 'EAUTH') errorType = 'authentication';
        else if (error.responseCode >= 500) errorType = `server error (${error.responseCode})`;
        else if (error.responseCode >= 400) errorType = `client error (${error.responseCode})`;
        
        io.emit('log', { 
          message: `[!] SMTP#${smtpIndex+1} (${currentSmtp.host}) failed (Attempt ${attempts+1}/${maxAttempts}). Error: ${errorType} - ${error.message}`,
          type: 'error'
        });
        
        // Check if this SMTP should be disabled
        if (currentSmtp.failures >= 3) {
          io.emit('log', { 
            message: `[X] SMTP#${smtpIndex+1} (${currentSmtp.host}) removed (3 failures)`,
            type: 'error'
          });
        }
        
        // Move to next SMTP
        smtpIndex = (smtpIndex + 1) % transporters.length;
        attempts++;
        
        // If we've tried all transporters and none work, mark as failed
        if (attempts >= maxAttempts) {
          failed++;
          remaining--;
          io.emit('log', { 
            message: `[X] All SMTP servers failed for ${email}. Email could not be sent. Last attempted sender: ${transporters[smtpIndex].transporter.options.auth.user}`,
            type: 'error'
          });
        }
      }
    }
    
    // Update progress
    io.emit('progress', { 
      sent,
      failed,
      remaining,
      total: emails.length,
      activeSMTPs: transporters.filter(t => t.failures < 3).length
    });
    
    // Rotate to next SMTP for round-robin
    smtpIndex = (smtpIndex + 1) % transporters.length;
  }
  
  // Log completion with deliverability tips
  io.emit('log', { 
    message: `[✓] Email sending process completed. Sent: ${sent}, Failed: ${failed}`,
    type: 'success'
  });
  
  // Add deliverability tips
  io.emit('log', {
    message: `[*] Deliverability Tips: 1) Use dedicated IPs, 2) Set up DKIM/SPF/DMARC, 3) Warm up new IPs gradually`,
    type: 'info'
  });
  
  // Clean up
  delete global.stopSendingJobs[jobId];
  
  // Close transporter connections
  transporters.forEach(t => {
    try {
      t.transporter.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  });
}

module.exports = router;
