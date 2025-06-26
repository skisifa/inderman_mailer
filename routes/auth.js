const express = require('express');
const router = express.Router();
const path = require('path');
const { getUserByUsername, updateUserStatus } = require('../middleware/auth');

// Login page route
router.get('/login', (req, res) => {
  // If already logged in, redirect to appropriate page
  if (req.session && req.session.userId) {
    if (req.session.isAdmin) {
      return res.redirect('/admin');
    } else {
      return res.redirect('/');
    }
  }
  
  res.render('login', { 
    title: 'Inderman Mailer - Login',
    error: null
  });
});

// Login form submission
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple validation
  if (!username || !password) {
    return res.render('login', {
      title: 'Inderman Mailer - Login',
      error: 'Username and password are required'
    });
  }
  
  // Find user
  const user = getUserByUsername(username);
  
  // Check if user exists and password matches (plain text as requested)
  if (user && user.password === password) {
    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;
    
    // Update user status with IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    updateUserStatus(user.id, true, ip);
    
    // Redirect based on user type
    if (user.isAdmin) {
      return res.redirect('/admin');
    } else {
      return res.redirect('/');
    }
  } else {
    // Invalid credentials
    return res.render('login', {
      title: 'Inderman Mailer - Login',
      error: 'Invalid username or password'
    });
  }
});

// Logout route
router.get('/logout', (req, res) => {
  // Update user status if logged in
  if (req.session && req.session.userId) {
    updateUserStatus(req.session.userId, false);
  }
  
  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
