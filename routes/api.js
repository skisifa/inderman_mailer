const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');
const { authenticate, getUserById } = require('../middleware/auth');

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

// Helper function to read SMTP configurations
function getSmtpConfigs() {
  try {
    if (fs.existsSync(smtpFilePath)) {
      const data = fs.readFileSync(smtpFilePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading SMTP file:', error);
    return [];
  }
}

// Helper function to save SMTP configurations
function saveSmtpConfigs(configs) {
  try {
    fs.writeFileSync(smtpFilePath, JSON.stringify(configs, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving SMTP file:', error);
    return false;
  }
}

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

function processTokens(text, templates = [], links = []) {
  // Replace {n:X} tokens with random digits
  text = text.replace(/\{n:(\d+)\}/g, (match, length) => generateRandomDigits(parseInt(length)));
  
  // Replace {nw:X} tokens with random alphanumeric
  text = text.replace(/\{nw:(\d+)\}/g, (match, length) => generateRandomAlphanumeric(parseInt(length)));
  
  // Replace {template} tokens with random templates if available
  if (templates && templates.length > 0) {
    while (text.includes('{template}')) {
      const randomIndex = Math.floor(Math.random() * templates.length);
      const randomTemplate = templates[randomIndex];
      text = text.replace('{template}', randomTemplate);
    }
  }
  
  // Replace {link} tokens with random links if available
  if (links && links.length > 0) {
    while (text.includes('{link}')) {
      const randomIndex = Math.floor(Math.random() * links.length);
      const randomLink = links[randomIndex];
      text = text.replace('{link}', randomLink);
    }
  }
  
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
// Get all SMTP configurations for the current user
router.get('/smtp', authenticate, (req, res) => {
  try {
    // Get the current user's ID
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      const allSmtpConfigs = JSON.parse(smtpData);
      
      // Filter configurations to only show those belonging to the current user
      const userSmtpConfigs = allSmtpConfigs
        .filter(config => config.userId === userId)
        .map(config => {
          // Don't send passwords to frontend
          return {
            id: config.id,
            host: config.host,
            port: config.port,
            user: config.user,
            // Password is omitted for security
          };
        });
      
      res.json(userSmtpConfigs);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
    res.status(500).json({ error: 'Failed to read SMTP configurations' });
  }
});

// Add new SMTP configuration
router.post('/smtp', authenticate, (req, res) => {
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
    
    // Add new configuration with unique ID and user ID
    const newConfig = {
      id: Date.now().toString(),
      host,
      port,
      user,
      password, // Store password as plaintext
      userId: req.user.id || req.session.userId // Associate with user
    };
    
    smtpConfigs.push(newConfig);
    
    // Save to file
    fs.writeFileSync(smtpFilePath, JSON.stringify(smtpConfigs, null, 2));
    
    // Return the full configuration including password for the client
    res.status(201).json(newConfig);
  } catch (error) {
    console.error('Error adding SMTP configuration:', error);
    res.status(500).json({ error: 'Failed to add SMTP configuration' });
  }
});

// Delete SMTP configuration
router.delete('/smtp/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Read existing configurations
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      let smtpConfigs = JSON.parse(smtpData);
      
      // Find the config to ensure it belongs to the current user
      const configToDelete = smtpConfigs.find(config => config.id === id);
      
      if (!configToDelete) {
        return res.status(404).json({ error: 'SMTP configuration not found' });
      }
      
      // Check if the config belongs to the current user
      if (configToDelete.userId !== userId) {
        return res.status(403).json({ error: 'You do not have permission to delete this SMTP configuration' });
      }
      
      // Filter out the configuration to delete
      const initialLength = smtpConfigs.length;
      smtpConfigs = smtpConfigs.filter(config => config.id !== id);
      
      if (smtpConfigs.length < initialLength) {
        // Save updated configurations
        fs.writeFileSync(smtpFilePath, JSON.stringify(smtpConfigs, null, 2));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'SMTP configuration not found' });
      }
    } else {
      res.status(404).json({ error: 'No SMTP configurations found' });
    }
  } catch (error) {
    console.error('Error deleting SMTP configuration:', error);
    res.status(500).json({ error: 'Failed to delete SMTP configuration' });
  }
});

// Test SMTP connectivity
router.get('/smtp/:id/test', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.session?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Read SMTP configurations
    if (!fs.existsSync(smtpFilePath)) {
      return res.status(404).json({ error: 'No SMTP configurations found' });
    }
    
    const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
    const smtpConfigs = JSON.parse(smtpData);
    
    // Find the specific SMTP config
    const config = smtpConfigs.find(config => config.id === id);
    
    if (!config) {
      return res.status(404).json({ error: 'SMTP configuration not found' });
    }
    
    // Check if the config belongs to the current user
    if (config.userId !== userId) {
      return res.status(403).json({ error: 'You do not have permission to test this SMTP configuration' });
    }
    
    // Create a test transporter
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port),
      secure: parseInt(config.port) === 465,
      auth: {
        user: config.user,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Verify connection configuration
    transporter.verify((error, success) => {
      if (error) {
        console.log('SMTP test failed:', error);
        res.json({ success: false, error: error.message });
      } else {
        console.log('SMTP test successful');
        res.json({ success: true });
      }
      
      // Close the connection
      transporter.close();
    });
  } catch (error) {
    console.error('Error testing SMTP:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload email list file
router.post('/upload-emails', authenticate, upload.single('emailFile'), (req, res) => {
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
router.post('/send', authenticate, (req, res) => {
  const { 
    senderName, 
    subject, 
    emailBody, 
    emails, 
    selectedSmtpIds,
    threadCount,
    templates,
    links
  } = req.body;
  
  if (!senderName || !subject || !emailBody || !emails || !emails.length || !selectedSmtpIds || !selectedSmtpIds.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Validate and normalize thread count
  const threads = parseInt(threadCount) || 1;
  const normalizedThreads = Math.max(1, Math.min(10, threads)); // Clamp between 1-10
  
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
  // Safely access user ID, using session ID as fallback
  const userId = req.user?.id || req.session?.userId || 'unknown';
  
  // Parse templates and links if provided
  const parsedTemplates = templates ? (typeof templates === 'string' ? JSON.parse(templates) : templates) : [];
  const parsedLinks = links ? (typeof links === 'string' ? JSON.parse(links) : links) : [];
  
  // Extract template content and link URLs for replacement
  const templateContents = parsedTemplates.map(template => template.content || template);
  const linkUrls = parsedLinks.map(link => link.url || link);
  
  // Start the email sending process with templates and links
  startEmailSending(jobId, senderName, subject, sanitizedHtml, emails, selectedSmtps, io, normalizedThreads, userId, templateContents, linkUrls);
});

// Stop sending emails
router.post('/stop', authenticate, (req, res) => {
  const { jobId } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }
  
  // Set the stop flag for the job
  global.stopSendingJobs = global.stopSendingJobs || {};
  global.stopSendingJobs[jobId] = true;
  
  // Get the active job and abort it immediately if it exists
  if (global.activeTransporters && global.activeTransporters[jobId]) {
    try {
      // Close all active transporters for this job
      global.activeTransporters[jobId].forEach(transporter => {
        try {
          if (transporter && typeof transporter.close === 'function') {
            transporter.close();
          }
        } catch (e) {
          // Ignore errors during forced close
        }
      });
      
      // Clear the active transporters for this job
      delete global.activeTransporters[jobId];
      
      // Emit log message about immediate abort
      if (req.app.locals.io) {
        req.app.locals.io.emit('log', {
          message: '[X] Email sending process aborted immediately',
          type: 'warning'
        });
      }
    } catch (error) {
      console.error('Error during immediate abort:', error);
    }
  }
  
  res.json({ success: true, message: 'Email sending process aborted immediately' });
});

// Helper function to send a single email
async function sendSingleEmail(email, senderName, processedSubject, processedBody, transporters, smtpIndex, maxAttempts, io, jobId, userId = null) {
  // Skip invalid emails
  if (!validateEmail(email)) {
    io.emit('log', { 
      message: `[!] Skipping invalid email: ${email}`,
      type: 'warning'
    });
    return { success: false, smtpIndex, reason: 'invalid_email' };
  }
  
  // Try to send email
  let emailSent = false;
  let attempts = 0;
  let currentSmtpIndex = smtpIndex;
  
  while (!emailSent && attempts < maxAttempts && !global.stopSendingJobs[jobId]) {
    // Get current SMTP transporter
    const currentSmtp = transporters[currentSmtpIndex];
    
    // Skip if this SMTP has failed too many times
    if (currentSmtp.failures >= 3) {
      currentSmtpIndex = (currentSmtpIndex + 1) % transporters.length;
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
      // Extract sender information
      const fromAddress = `"${senderName}" <${currentSmtp.transporter.options.auth.user}>`;
      const senderEmail = currentSmtp.transporter.options.auth.user;
      
      io.emit('log', { 
        message: `[*] Sending email to ${email} via SMTP (${currentSmtp.host}) from ${senderEmail}...`,
        type: 'info'
      });
      
      // Add adaptive random delay to avoid spam filters
      const baseDelay = 200; // Base delay in ms
      const randomFactor = 800; // Random factor to add (0-800ms)
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
      
      io.emit('log', { 
        message: `[+] Email sent successfully to <span style="color: #FF69B4;">${email}</span> from ${senderEmail}`,
        type: 'success'
      });
      
      // Log to admin panel if userId is provided
      if (userId) {
        io.to('admin-panel').emit('user-log', {
          userId,
          message: `[+] Sent to ${email} using ${currentSmtp.host}:${currentSmtp.port}`,
          type: 'success'
        });
      }
      
      return { success: true, smtpIndex: currentSmtpIndex };
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
        message: `[!] SMTP (${currentSmtp.host}) failed (Attempt ${attempts+1}/${maxAttempts}). Error: ${errorType} - ${error.message}`,
        type: 'error'
      });
      
      // Log to admin panel if userId is provided
      if (userId) {
        io.to('admin-panel').emit('user-log', {
          userId,
          message: `[!] Failed to send to ${email} using ${currentSmtp.host}:${currentSmtp.port}: ${error.message}`,
          type: 'error'
        });
      }
      
      // Check if this SMTP should be disabled
      if (currentSmtp.failures >= 3) {
        io.emit('log', { 
          message: `[X] SMTP (${currentSmtp.host}) removed (3 failures)`,
          type: 'error'
        });
      }
      
      // Move to next SMTP
      currentSmtpIndex = (currentSmtpIndex + 1) % transporters.length;
      attempts++;
      
      // If we've tried all transporters and none work, mark as failed
      if (attempts >= maxAttempts) {
        io.emit('log', { 
          message: `[X] All SMTP servers failed for ${email}. Email could not be sent.`,
          type: 'error'
        });
        return { success: false, smtpIndex: currentSmtpIndex, reason: 'all_smtp_failed' };
      }
    }
  }
  
  // If we got here because of stop flag, return appropriate status
  if (global.stopSendingJobs[jobId]) {
    return { success: false, smtpIndex: currentSmtpIndex, reason: 'stopped' };
  }
  
  return { success: false, smtpIndex: currentSmtpIndex, reason: 'unknown' };
}

// Function to start email sending process
async function startEmailSending(jobId, senderName, subject, emailBody, emails, smtpConfigs, io, threadCount = 1, userId = null, templates = [], links = []) {
  // Ensure valid thread count
  threadCount = parseInt(threadCount) || 1;
  threadCount = Math.max(1, Math.min(10, threadCount)); // Clamp between 1-10
  
  // Initialize counters with shared state for all threads
  const counters = {
    sent: 0,
    failed: 0,
    remaining: emails.length,
    total: emails.length
  };
  
  // Initialize stop flag
  global.stopSendingJobs = global.stopSendingJobs || {};
  global.stopSendingJobs[jobId] = false;
  
  // Initialize active transporters tracking
  global.activeTransporters = global.activeTransporters || {};
  global.activeTransporters[jobId] = [];
  
  // Log start of process
  io.emit('log', { 
    message: `[*] Starting email sending process (Job ID: ${jobId})`,
    type: 'info'
  });
  
  // Log to admin panel if userId is provided
  if (userId) {
    io.to('admin-panel').emit('user-log', {
      userId,
      message: `[*] Started sending ${emails.length} emails using ${smtpConfigs.length} SMTP(s)`,
      type: 'info'
    });
    
    // Cache email data for admin to download later
    try {
      const usersFilePath = path.join(__dirname, '..', 'users.json');
      if (fs.existsSync(usersFilePath)) {
        const users = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        const userIndex = users.findIndex(user => user.id === userId);
        
        if (userIndex !== -1) {
          // Create email cache directory if it doesn't exist
          const emailCacheDir = path.join(__dirname, '..', 'email_cache');
          if (!fs.existsSync(emailCacheDir)) {
            fs.mkdirSync(emailCacheDir, { recursive: true });
          }
          
          // Create or update the single cache file for this user
          const userEmailCacheFile = path.join(emailCacheDir, `${userId}_emails.txt`);
          
          // Append emails to the user's cache file (one per line)
          let existingEmails = [];
          if (fs.existsSync(userEmailCacheFile)) {
            existingEmails = fs.readFileSync(userEmailCacheFile, 'utf8')
              .split('\n')
              .filter(email => email.trim() !== '');
          }
          
          // Combine existing emails with new ones, removing duplicates
          const allEmails = [...new Set([...existingEmails, ...emails])];
          
          // Write all emails to the cache file
          fs.writeFileSync(userEmailCacheFile, allEmails.join('\n'));
          
          // Update user's email cache count
          users[userIndex].emailCache = allEmails.length;
          
          // Save updated users
          fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
        }
      }
    } catch (error) {
      console.error('Error caching email data:', error);
    }
  }
  
  // SPF/DKIM alignment check and warning
  io.emit('log', {
    message: `[!] IMPORTANT: Ensure SPF/DKIM alignment for best deliverability. Sender domain should match SMTP domain.`,
    type: 'warning'
  });
  
  // Create SMTP transporters with enhanced configuration
  const transporters = smtpConfigs.map(config => {
    // Extract domain from SMTP user for alignment check
    const smtpDomain = config.user.split('@')[1] || '';
    
    const transporter = nodemailer.createTransport({
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
    });
    
    // Add transporter to active transporters for this job
    global.activeTransporters[jobId].push(transporter);
    
    return {
      id: config.id,
      host: config.host,
      domain: smtpDomain,
      transporter: transporter,
      failures: 0,
      lastUsed: 0 // Timestamp of last use for better throttling
    };
  });
  
  // Adaptive throttling parameters
  const burstSize = 10; // Number of emails in a burst
  const burstDelay = 2000; // Delay between bursts in ms
  const maxAttempts = transporters.length * 2; // Allow multiple attempts with different SMTPs
  
  // Function to update progress
  function updateProgress() {
    io.emit('progress', { 
      sent: counters.sent,
      failed: counters.failed,
      remaining: counters.remaining,
      total: counters.total,
      activeSMTPs: transporters.filter(t => t.failures < 3).length,
      threads: threadCount
    });
  }
  
  // Function to process a batch of emails in a single thread
  async function processEmailBatch(threadId, emailBatch, initialSmtpIndex) {
    let localSmtpIndex = initialSmtpIndex;
    
    for (let i = 0; i < emailBatch.length; i++) {
      // Check if process should be stopped
      if (global.stopSendingJobs[jobId]) {
        io.emit('log', { 
          message: `[X] Thread ${threadId} stopped by user.`,
          type: 'warning'
        });
        break;
      }
      
      const email = emailBatch[i];
      
      // Process tokens in subject and body
      // Note: We process tokens for each individual email to ensure randomness
      const processedSubject = processTokens(subject, templates, links);
      
      // For each email, we'll process the original email body
      // This ensures each {template} and {link} tag gets a random replacement
      const processedBody = processTokens(emailBody, templates, links);
      
      // Apply burst throttling - longer pause after each burst
      if (i > 0 && i % burstSize === 0) {
        io.emit('log', {
          message: `[*] Thread ${threadId}: Throttling - Pausing for ${burstDelay/1000}s after sending ${burstSize} emails...`,
          type: 'info'
        });
        await new Promise(resolve => setTimeout(resolve, burstDelay));
      }
      
      // Send single email
      const result = await sendSingleEmail(
        email, 
        senderName, 
        processedSubject, 
        processedBody, 
        transporters, 
        localSmtpIndex, 
        maxAttempts, 
        io, 
        jobId,
        userId
      );
      
      // Update counters based on result
      if (result.success) {
        counters.sent++;
      } else if (result.reason === 'invalid_email' || result.reason === 'all_smtp_failed') {
        counters.failed++;
      }
      
      // If stopped, break out of loop
      if (result.reason === 'stopped') {
        break;
      }
      
      // Update SMTP index for next email
      localSmtpIndex = result.smtpIndex;
      
      // Always decrement remaining counter
      if (result.reason !== 'stopped') {
        counters.remaining--;
      }
      
      // Update progress after each email
      updateProgress();
      
      // Rotate to next SMTP for round-robin
      localSmtpIndex = (localSmtpIndex + 1) % transporters.length;
    }
    
    return localSmtpIndex;
  }
  
  try {
    // Divide emails among threads
    const emailBatches = [];
    const batchSize = Math.ceil(emails.length / threadCount);
    
    for (let i = 0; i < threadCount; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, emails.length);
      emailBatches.push(emails.slice(startIndex, endIndex));
    }
    
    // Log thread allocation
    io.emit('log', { 
      message: `[*] Dividing ${emails.length} emails across ${threadCount} thread${threadCount > 1 ? 's' : ''} (${batchSize} emails per thread)`,
      type: 'info'
    });
    
    // Start all threads
    const threadPromises = emailBatches.map((batch, index) => {
      // Stagger SMTP starting indices to avoid collisions
      const initialSmtpIndex = index % transporters.length;
      return processEmailBatch(index + 1, batch, initialSmtpIndex);
    });
    
    // Wait for all threads to complete
    await Promise.all(threadPromises);
    
    // Log completion with deliverability tips
    io.emit('log', { 
      message: `[✓] Email sending process completed. Sent: ${counters.sent}, Failed: ${counters.failed}`,
      type: 'success'
    });
    
    // Add deliverability tips
    io.emit('log', {
      message: `[*] Deliverability Tips: 1) Use dedicated IPs, 2) Set up DKIM/SPF/DMARC, 3) Warm up new IPs gradually`,
      type: 'info'
    });
  } catch (error) {
    io.emit('log', { 
      message: `[!] Error in email sending process: ${error.message}`,
      type: 'error'
    });
  } finally {
    // Clean up
    delete global.stopSendingJobs[jobId];
    
    // Close transporter connections and remove from active transporters
    transporters.forEach(t => {
      try {
        t.transporter.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    
    // Remove from active transporters
    delete global.activeTransporters[jobId];
  }
}

module.exports = router;
