const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Path to users.json file
const usersFilePath = path.join(__dirname, '..', 'users.json');

// Path to geo cache file
const geoCacheFilePath = path.join(__dirname, '..', 'geo_cache.json');

// Cache for IP geolocation data to reduce API calls
let geoCache = {};

// Geo API services in order of preference
const geoServices = [
  {
    name: 'ipapi',
    url: (ip) => `https://ipapi.co/${ip}/json/`,
    extract: (data) => ({
      country: data.country_name,
      countryCode: data.country_code,
      city: data.city || 'Unknown'
    }),
    rateLimit: { count: 0, lastReset: Date.now(), backoff: 1000 }
  },
  {
    name: 'ipinfo',
    url: (ip) => `https://ipinfo.io/${ip}/json`,
    extract: (data) => ({
      country: data.country === 'US' ? 'United States' : data.country,
      countryCode: data.country,
      city: data.city || 'Unknown'
    }),
    rateLimit: { count: 0, lastReset: Date.now(), backoff: 1000 }
  },
  {
    name: 'ipwho',
    url: (ip) => `https://ipwho.is/${ip}`,
    extract: (data) => ({
      country: data.country,
      countryCode: data.country_code,
      city: data.city || 'Unknown'
    }),
    rateLimit: { count: 0, lastReset: Date.now(), backoff: 1000 }
  }
];

// Load geo cache from file if exists
try {
  if (fs.existsSync(geoCacheFilePath)) {
    const cacheData = fs.readFileSync(geoCacheFilePath, 'utf8');
    const parsedCache = JSON.parse(cacheData);
    
    // Filter out expired entries
    const now = Date.now();
    geoCache = Object.fromEntries(
      Object.entries(parsedCache).filter(([_, entry]) => {
        return entry.expires > now;
      })
    );
    
    console.log(`Loaded ${Object.keys(geoCache).length} valid geo cache entries`);
  }
} catch (error) {
  console.error('Error loading geo cache:', error.message);
  geoCache = {};
}

// Save geo cache to file
function saveGeoCache() {
  try {
    fs.writeFileSync(geoCacheFilePath, JSON.stringify(geoCache, null, 2));
  } catch (error) {
    console.error('Error saving geo cache:', error.message);
  }
}

// Get geolocation data with fallback services and caching
async function getGeoData(ip) {
  // Check cache first (with TTL)
  if (geoCache[ip] && geoCache[ip].expires > Date.now()) {
    console.log(`Using cached geolocation for IP: ${ip} (expires in ${Math.round((geoCache[ip].expires - Date.now()) / 1000 / 60)} minutes)`);
    return geoCache[ip].data;
  }
  
  // Try each service in order until one works
  for (const service of geoServices) {
    // Check if service is in backoff mode
    const now = Date.now();
    if (service.rateLimit.backoff > 1000 && 
        now - service.rateLimit.lastAttempt < service.rateLimit.backoff) {
      console.log(`Skipping ${service.name} - in backoff mode for ${Math.round((service.rateLimit.backoff - (now - service.rateLimit.lastAttempt)) / 1000)} more seconds`);
      continue;
    }
    
    // Reset rate limit counter if it's been more than 1 minute
    if (now - service.rateLimit.lastReset > 60000) {
      service.rateLimit.count = 0;
      service.rateLimit.lastReset = now;
      service.rateLimit.backoff = 1000; // Reset backoff
    }
    
    // Track attempt time
    service.rateLimit.lastAttempt = now;
    
    try {
      console.log(`Trying geolocation service: ${service.name} for IP: ${ip}`);
      const response = await axios.get(service.url(ip), { timeout: 3000 });
      
      // Check for rate limit response
      if (response.status === 429) {
        console.log(`Rate limited by ${service.name}, increasing backoff`);
        service.rateLimit.backoff *= 2; // Exponential backoff
        continue;
      }
      
      // Extract data using service-specific extractor
      if (response.data) {
        const geoData = service.extract(response.data);
        
        // Cache the result with TTL (24 hours)
        const TTL = 24 * 60 * 60 * 1000; // 24 hours
        geoCache[ip] = {
          data: geoData,
          expires: Date.now() + TTL,
          service: service.name
        };
        
        // Save cache to file periodically (every 10 cache updates)
        if (Object.keys(geoCache).length % 10 === 0) {
          saveGeoCache();
        }
        
        console.log(`Successfully fetched geolocation for IP: ${ip} using ${service.name} - ${geoData.country}`);
        return geoData;
      }
    } catch (error) {
      console.log(`Error with ${service.name} geolocation service: ${error.message}`);
      
      // Check if it's a rate limit error
      if (error.response && error.response.status === 429) {
        console.log(`Rate limited by ${service.name}, increasing backoff`);
        service.rateLimit.backoff *= 2; // Exponential backoff
      }
    }
  }
  
  // If all services failed, return default values
  console.log(`All geolocation services failed for IP: ${ip}, using default values`);
  return {
    country: 'Unknown',
    countryCode: 'XX',
    city: 'Unknown'
  };
}

// Function to read users from file
const getUsers = () => {
  try {
    if (fs.existsSync(usersFilePath)) {
      const usersData = fs.readFileSync(usersFilePath, 'utf8');
      return JSON.parse(usersData);
    }
    return [];
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
};

// Function to save users to file
const saveUsers = (users) => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing users file:', error);
    return false;
  }
};

// Function to get user by username
const getUserByUsername = (username) => {
  const users = getUsers();
  return users.find(user => user.username === username);
};

// Function to get user by ID
const getUserById = (id) => {
  const users = getUsers();
  return users.find(user => user.id === id);
};

// Function to get location information from IP
const getCountryFromIP = async (ip) => {
  try {
    // Skip for localhost or private IPs
    if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { country: 'Local', countryCode: 'LO', city: 'Local' };
    }
    
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    return {
      country: response.data.country_name,
      countryCode: response.data.country_code,
      city: response.data.city || 'Unknown'
    };
  } catch (error) {
    console.error('Error getting location from IP:', error);
    return { country: 'Unknown', countryCode: 'XX', city: 'Unknown' };
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  // Check if user is already authenticated
  if (req.session && req.session.userId) {
    // User is authenticated
    // Set req.user for easier access in route handlers
    const user = getUserById(req.session.userId);
    if (user) {
      req.user = user;
    } else {
      // User ID in session but not found in database
      req.session.destroy();
      return res.redirect('/login');
    }
    return next();
  }
  
  // Not authenticated, redirect to login
  res.redirect('/login');
};

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  // Debug session information
  console.log('Session ID:', req.session.id);
  console.log('Session cookie:', req.headers.cookie);
  console.log('Session data:', req.session);
  console.log('Request path:', req.path);
  
  // Check if user is authenticated and is admin
  if (req.session && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user && user.isAdmin) {
      // User is admin - set req.user for easier access in route handlers
      req.user = user;
      return next();
    }
  }
  
  console.log('Authentication failed, session invalid or user not admin');
  
  // Check if this is an API request (URL contains /api/)
  if (req.path.includes('/api/')) {
    // Return JSON error for API requests
    console.log('API request detected, returning 401 JSON response');
    return res.status(401).json({ error: 'Authentication required', redirect: '/login' });
  } else {
    // Not admin, redirect to login for regular pages
    console.log('Regular page request, redirecting to login');
    res.redirect('/login');
  }
};

// Update user status (online/offline) and IP information
async function updateUserStatus(userId, isOnline, ip = null) {
  try {
    const users = getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex !== -1) {
      // Update online status
      users[userIndex].online = isOnline;
      
      // If IP is provided, update IP and country info
      if (ip && isOnline) {
        // Clean the IP address (remove IPv6 prefix if present)
        const cleanIp = ip.replace(/^.*:/, '');
        users[userIndex].lastIP = cleanIp;
        
        try {
          // Get geolocation data with fallback and caching
          const geoData = await getGeoData(cleanIp);
          
          if (geoData) {
            users[userIndex].country = geoData.country;
            users[userIndex].countryCode = geoData.countryCode;
            users[userIndex].city = geoData.city || 'Unknown';
          }
        } catch (geoError) {
          console.error('Error getting geolocation data:', geoError.message);
        }
        
        // Update last login time
        users[userIndex].lastLogin = new Date().toISOString();
      }
      
      // Save updated users
      saveUsers(users);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating user status:', error);
    return false;
  }
};

module.exports = {
  authenticate,
  authenticateAdmin,
  getUsers,
  saveUsers,
  getUserByUsername,
  getUserById,
  updateUserStatus,
  getCountryFromIP
};
