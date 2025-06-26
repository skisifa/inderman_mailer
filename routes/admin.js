const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticateAdmin, getUsers, saveUsers, getUserById } = require('../middleware/auth');

// Path to users.json file
const usersFilePath = path.join(__dirname, '..', 'users.json');

// Path to email cache directory
const emailCachePath = path.join(__dirname, '..', 'email_cache');

// Ensure email cache directory exists
if (!fs.existsSync(emailCachePath)) {
  fs.mkdirSync(emailCachePath, { recursive: true });
}

// Admin dashboard - Main page
router.get('/', authenticateAdmin, (req, res) => {
  const users = getUsers();
  
  res.render('admin/dashboard', {
    title: 'Admin Panel - Inderman Mailer',
    users: users,
    currentUser: req.session.username
  });
});

// API: Get all users
router.get('/api/users', authenticateAdmin, (req, res) => {
  // Log session info for debugging
  console.log('Session in /api/users:', req.session.id);
  console.log('User in session:', req.session.userId);
  
  // Include passwords in the API response as requested
  const users = getUsers();
  
  // Get SMTP configurations for all users
  const smtpFilePath = path.join(__dirname, '..', 'smtp.json');
  let allSmtps = [];
  
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      allSmtps = JSON.parse(smtpData);
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
  }
  
  // Add SMTP data to each user
  const usersWithSmtp = users.map(user => {
    const userSmtps = allSmtps.filter(smtp => smtp.userId === user.id);
    return { ...user, smtps: userSmtps };
  });
  
  // Set cache control headers to prevent caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  res.json(usersWithSmtp);
});

// API: Get specific user
router.get('/api/users/:id', authenticateAdmin, (req, res) => {
  // Log session info for debugging
  console.log('Session in /api/users/:id:', req.session.id);
  console.log('User in session:', req.session.userId);
  
  const { id } = req.params;
  const user = getUserById(id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Include password in the API response as requested
  const safeUser = { ...user };
  
  // Set cache control headers to prevent caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  // Get SMTP configurations used by this user
  const smtpFilePath = path.join(__dirname, '..', 'smtp.json');
  let userSmtps = [];
  
  try {
    if (fs.existsSync(smtpFilePath)) {
      const smtpData = fs.readFileSync(smtpFilePath, 'utf8');
      const allSmtps = JSON.parse(smtpData);
      // Filter SMTPs for this user only
      userSmtps = allSmtps.filter(smtp => smtp.userId === id);
    }
  } catch (error) {
    console.error('Error reading SMTP configurations:', error);
  }
  
  // Add SMTP data to response (including passwords)
  safeUser.smtps = userSmtps;
  
  res.json(safeUser);
});

// API: Create new user
router.post('/api/users', authenticateAdmin, (req, res) => {
  const { username, password, isAdmin = false, note = '' } = req.body;
  
  // Validate required fields
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Check if username already exists
  const users = getUsers();
  if (users.some(user => user.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  // Create new user
  const newUser = {
    id: uuidv4(),
    username,
    password,
    isAdmin: Boolean(isAdmin),
    lastLogin: null,
    lastIP: null,
    country: null,
    countryCode: null,
    online: false,
    note,
    emailCache: []
  };
  
  // Add to users array
  users.push(newUser);
  
  // Save to file
  if (saveUsers(users)) {
    // Don't send password in the API response
    const { password, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  } else {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// API: Update user note
router.put('/api/users/:id/note', authenticateAdmin, (req, res) => {
  // Log session info for debugging
  console.log('Session in /api/users/:id/note:', req.session.id);
  console.log('User in session:', req.session.userId);
  
  const { id } = req.params;
  const { note } = req.body;
  
  if (note === undefined) {
    return res.status(400).json({ error: 'Note is required' });
  }
  
  const users = getUsers();
  const userIndex = users.findIndex(user => user.id === id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Update note
  users[userIndex].note = note;
  
  // Save users
  saveUsers(users);
  
  // Set cache control headers to prevent caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  res.json({ success: true });
});

// API: Update user
router.put('/api/users/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { username, password, isAdmin, note } = req.body;
  
  // Get users
  const users = getUsers();
  const userIndex = users.findIndex(user => user.id === id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Check if username already exists (if changing username)
  if (username && username !== users[userIndex].username) {
    if (users.some(user => user.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  }
  
  // Update user fields
  if (username) users[userIndex].username = username;
  if (password) users[userIndex].password = password;
  if (isAdmin !== undefined) users[userIndex].isAdmin = Boolean(isAdmin);
  if (note !== undefined) users[userIndex].note = note;
  
  // Save to file
  if (saveUsers(users)) {
    // Don't send password in the API response
    const { password, ...safeUser } = users[userIndex];
    res.json(safeUser);
  } else {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// API: Delete user
router.delete('/api/users/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  
  // Get users
  const users = getUsers();
  const userIndex = users.findIndex(user => user.id === id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Prevent deleting the last admin
  const isLastAdmin = users[userIndex].isAdmin && 
                     users.filter(user => user.isAdmin).length === 1;
  
  if (isLastAdmin) {
    return res.status(400).json({ error: 'Cannot delete the last admin user' });
  }
  
  // Remove user
  users.splice(userIndex, 1);
  
  // Save to file
  if (saveUsers(users)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// API: Get user logs
router.get('/api/users/:id/logs', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const user = getUserById(id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // In a real application, we would fetch logs from a database
  // For this example, we'll return some sample logs
  const logs = [
    { timestamp: new Date().toISOString(), action: 'Login', details: `User ${user.username} logged in` },
    { timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'Email Sent', details: 'Sent 10 emails via SMTP' }
  ];
  
  res.json(logs);
});

// API: Download user email cache
router.get('/api/users/:id/emails', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const user = getUserById(id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Path to the user's email cache file
  const emailCacheFile = path.join(emailCachePath, `${user.id}_emails.txt`);
  
  try {
    // Check if the file exists
    if (!fs.existsSync(emailCacheFile)) {
      return res.status(404).json({ error: 'No email cache found for this user' });
    }
    
    // Send file for download
    res.download(emailCacheFile, `${user.username}_emails.txt`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        return;
      }
      
      // Delete the file completely after download
      fs.unlink(emailCacheFile, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Error deleting file:', unlinkErr);
        } else {
          console.log(`Email cache file for user ${user.id} deleted successfully`);
        }
        
        // Update the user's email cache count
        const users = getUsers();
        const userIndex = users.findIndex(u => u.id === user.id);
        if (userIndex !== -1) {
          users[userIndex].emailCache = 0;
          saveUsers(users);

          // Emit socket event to notify all clients that emails were downloaded
          if (req.app.get('io')) {
            req.app.get('io').emit('email-count-update', {
              userId: user.id,
              username: user.username,
              count: 0
            });
          }
        }
      });
    });
  } catch (error) {
    console.error('Error creating email cache file:', error);
    res.status(500).json({ error: 'Failed to download email cache' });
  }
});

// User detail page
router.get('/users/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const user = getUserById(id);
  
  if (!user) {
    return res.redirect('/admin');
  }
  
  res.render('admin/user-detail', {
    title: `Admin - User ${user.username}`,
    user: user,
    currentUser: req.session.username
  });
});

module.exports = router;
