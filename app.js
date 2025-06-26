const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const session = require('express-session');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware
const sessionConfig = {
  secret: 'inderman_mailer_secret_key',
  resave: true,
  saveUninitialized: true,
  rolling: true, // Reset expiration on every response
  name: 'PHPSESSID', // Match existing cookie name in browser
  cookie: { 
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Apply session middleware
app.use(session(sessionConfig));

// Add CORS headers for API requests
app.use((req, res, next) => {
  // Only add CORS headers for API routes
  if (req.path.includes('/api/')) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Add session check middleware for API routes
app.use('/api', (req, res, next) => {
  // Ensure session is properly loaded
  if (!req.session) {
    console.error('Session not available for API request:', req.path);
    return res.status(500).json({ error: 'Session unavailable' });
  }
  next();
});

// Debug middleware to log session data
app.use((req, res, next) => {
  console.log(`Request path: ${req.path}`);
  console.log(`Session ID: ${req.session.id}`);
  console.log(`Session data:`, req.session);
  next();
});

// File upload configuration
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

// Routes
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/', indexRoutes);
app.use('/api', apiRoutes);
app.use('/', authRoutes);
app.use('/admin', adminRoutes);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Store user information if available
  if (socket.handshake.query && socket.handshake.query.userId) {
    const userId = socket.handshake.query.userId;
    socket.userId = userId;
    console.log(`User ${userId} connected`);
    
    // Update user online status
    const { updateUserStatus } = require('./middleware/auth');
    updateUserStatus(userId, true, socket.handshake.address);
    
    // Join user-specific room for targeted messages
    socket.join(`user-${userId}`);
    
    // Notify admin panel of user connection
    io.to('admin-panel').emit('user-status-change', { userId, status: 'online' });
  }
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    
    // Update user status if this was a user socket
    if (socket.userId) {
      const { updateUserStatus } = require('./middleware/auth');
      updateUserStatus(socket.userId, false);
      
      // Notify admin panel of user disconnection
      io.to('admin-panel').emit('user-status-change', { userId: socket.userId, status: 'offline' });
    }
  });
  
  // Admin panel socket joins admin room
  socket.on('join-admin', () => {
    socket.join('admin-panel');
    console.log('Admin joined admin panel room');
  });
});

// SMTP management
const smtpFilePath = path.join(__dirname, 'smtp.json');

// Initialize SMTP file if it doesn't exist
if (!fs.existsSync(smtpFilePath)) {
  fs.writeFileSync(smtpFilePath, JSON.stringify([], null, 2));
}

// Initialize users file if it doesn't exist
const usersFilePath = path.join(__dirname, 'users.json');
if (!fs.existsSync(usersFilePath)) {
  const defaultUsers = [
    {
      "id": "admin",
      "username": "admin",
      "password": "admin123",
      "isAdmin": true,
      "lastLogin": null,
      "lastIP": null,
      "country": null,
      "countryCode": null,
      "online": false,
      "note": "Default administrator account",
      "emailCache": []
    }
  ];
  fs.writeFileSync(usersFilePath, JSON.stringify(defaultUsers, null, 2));
}

// Export for use in other modules
app.locals.io = io;

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };
