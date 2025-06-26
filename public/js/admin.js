// Connect to Socket.IO server
const socket = io({
  query: {
    isAdmin: true
  }
});

// Global variables
let selectedUserId = null;
let userLogs = {};
let liveLogsEnabled = true;

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Join admin room for broadcasts
  socket.emit('join-admin');
  
  // Initialize user table with data
  fetchUsers();
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up socket event handlers
  setupSocketHandlers();
});

// Fetch users from API
function fetchUsers() {
  fetch('/admin/api/users', {
    method: 'GET',
    credentials: 'include', // Add credentials to include cookies
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          try {
            // Try to parse as JSON
            const data = JSON.parse(text);
            if (data.error && data.redirect && response.status === 401) {
              console.log('Session expired, redirecting to login');
              window.location.href = data.redirect;
              throw new Error('Session expired. Please log in again.');
            } else if (data.error) {
              throw new Error(data.error || 'Failed to fetch users');
            }
          } catch (e) {
            throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
          }
        });
      }
      return response.json();
    })
    .then(users => {
      renderUserTable(users);
      addLogMessage(`[✓] Successfully loaded ${users.length} users`, 'success');
    })
    .catch(error => {
      console.error('Error fetching users:', error);
      addLogMessage(`[!] Error fetching users: ${error.message}`, 'error');
    });
}

// Render user table
function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.dataset.userId = user.id;
    
    // Online status with indicator
    const statusClass = user.online ? 'text-success' : 'text-danger';
    const statusIcon = user.online ? '●' : '○';
    
    // Country flag
    const countryFlag = user.countryCode 
      ? `<img src="https://flagcdn.com/16x12/${user.countryCode.toLowerCase()}.png" alt="${user.country}" title="${user.country}" class="me-1">`
      : '';
    
    tr.innerHTML = `
      <td>
        <div class="d-flex align-items-center">
          <span class="status-indicator ${user.online ? 'bg-success' : 'bg-danger'} me-2"></span>
          <strong>${user.username}</strong>
          ${user.isAdmin ? '<span class="badge bg-purple ms-2">Admin</span>' : ''}
        </div>
      </td>
      <td>
        <div class="password-display">
          <span class="text-warning fw-bold" style="font-family: monospace; letter-spacing: 0.5px;">
            ${user.password}
          </span>
        </div>
      </td>

      <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</td>
      <td>${user.lastIP || 'Unknown'}</td>
      <td>
        <span class="city-name">${user.city || 'Unknown'}</span>
      </td>
      <td>${countryFlag}${user.country || 'Unknown'}</td>
      <td class="note-cell" data-user-id="${user.id}">
        <div class="note-display">
          <span class="note-text">${user.note || ''}</span>
          <button class="btn btn-sm edit-note-btn" title="Edit Note">
            <i class="fa fa-pencil"></i>
          </button>
        </div>
        <div class="note-edit" style="display: none;">
          <div class="input-group input-group-sm">
            <input type="text" class="form-control note-input" value="${user.note || ''}">
            <button class="btn btn-terminal-success save-note-btn" title="Save">
              <i class="fa fa-check"></i>
            </button>
            <button class="btn btn-terminal-danger cancel-note-btn" title="Cancel">
              <i class="fa fa-times"></i>
            </button>
          </div>
        </div>
      </td>
      <td class="text-center">
        <div class="btn-group">
          <button class="btn btn-table-action edit edit-user" data-id="${user.id}" title="Edit User">
            <i class="fa fa-edit"></i>
          </button>
          <button class="btn btn-table-action view-user" data-id="${user.id}" title="View Details">
            <i class="fa fa-eye"></i>
          </button>
          ${!user.isAdmin ? `
            <button class="btn btn-table-action delete delete-user" data-id="${user.id}" title="Delete User">
              <i class="fa fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Add event listeners to buttons
  document.querySelectorAll('.view-user').forEach(btn => {
    btn.addEventListener('click', () => viewUser(btn.dataset.id));
  });
  
  document.querySelectorAll('.edit-user').forEach(btn => {
    btn.addEventListener('click', () => showEditUserModal(btn.dataset.id));
  });
  
  document.querySelectorAll('.delete-user').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.id));
  });
  
  // Add event listeners for inline note editing
  document.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', handleEditNoteClick);
  });
  
  document.querySelectorAll('.save-note-btn').forEach(btn => {
    btn.addEventListener('click', handleSaveNoteClick);
  });
  
  document.querySelectorAll('.cancel-note-btn').forEach(btn => {
    btn.addEventListener('click', handleCancelNoteClick);
  });
}

// Set up event listeners
function setupEventListeners() {
  // Add user button
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', showAddUserModal);
  }
  
  // Save user button in modal
  const saveUserBtn = document.getElementById('saveUserBtn');
  if (saveUserBtn) {
    saveUserBtn.addEventListener('click', saveUser);
  }
  
  // Toggle live logs button
  const toggleLogsBtn = document.getElementById('toggleLogsBtn');
  if (toggleLogsBtn) {
    toggleLogsBtn.addEventListener('click', toggleLiveLogs);
  }
  
  // Clear logs button
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearLogs);
  }
  
  // Download emails button
  const downloadEmailsBtn = document.getElementById('downloadEmailsBtn');
  if (downloadEmailsBtn) {
    downloadEmailsBtn.addEventListener('click', downloadUserEmails);
  }
}

// Handler for edit note button click
function handleEditNoteClick(event) {
  const noteCell = event.target.closest('.note-cell');
  const displayDiv = noteCell.querySelector('.note-display');
  const editDiv = noteCell.querySelector('.note-edit');
  
  // Hide display, show edit
  displayDiv.style.display = 'none';
  editDiv.style.display = 'block';
  
  // Focus on the input
  const input = editDiv.querySelector('.note-input');
  input.focus();
  input.select();
}

// Handler for save note button click
function handleSaveNoteClick(event) {
  const noteCell = event.target.closest('.note-cell');
  const userId = noteCell.dataset.userId;
  const input = noteCell.querySelector('.note-input');
  const noteText = noteCell.querySelector('.note-text');
  const newNote = input.value.trim();
  
  // Save the note via API
  saveUserNote(userId, newNote)
    .then(success => {
      if (success) {
        // Update the displayed note text
        noteText.textContent = newNote;
        
        // Switch back to display mode
        noteCell.querySelector('.note-display').style.display = 'block';
        noteCell.querySelector('.note-edit').style.display = 'none';
        
        // Show success message
        addLogMessage(`[✓] Note updated for user ${userId}`, 'success');
      }
    })
    .catch(error => {
      addLogMessage(`[!] Error updating note: ${error.message}`, 'error');
    });
}

// Handler for cancel note button click
function handleCancelNoteClick(event) {
  const noteCell = event.target.closest('.note-cell');
  const displayDiv = noteCell.querySelector('.note-display');
  const editDiv = noteCell.querySelector('.note-edit');
  
  // Reset input value to original
  const input = editDiv.querySelector('.note-input');
  input.value = noteCell.querySelector('.note-text').textContent;
  
  // Hide edit, show display
  displayDiv.style.display = 'block';
  editDiv.style.display = 'none';
}

// Function to save user note
async function saveUserNote(userId, note) {
  try {
    const response = await fetch(`/admin/api/users/${userId}/note`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      credentials: 'include',
      body: JSON.stringify({ note })
    });
    
    if (!response.ok) {
      const text = await response.text();
      try {
        // Try to parse as JSON
        const data = JSON.parse(text);
        if (data.error && data.redirect && response.status === 401) {
          console.log('Session expired, redirecting to login');
          window.location.href = data.redirect;
          throw new Error('Session expired. Please log in again.');
        } else if (data.error) {
          throw new Error(data.error);
        }
      } catch (e) {
        throw new Error(`Failed to save note: ${response.status} ${response.statusText}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
}

// Set up socket event handlers
function setupSocketHandlers() {
  // User status change (online/offline)
  socket.on('user-status-change', (data) => {
    updateUserStatus(data.userId, data.status);
  });
  
  // User log message
  socket.on('user-log', (data) => {
    if (liveLogsEnabled && data.userId === selectedUserId) {
      addLogMessage(data.message, data.type);
    }
    
    // Store log in memory
    if (!userLogs[data.userId]) {
      userLogs[data.userId] = [];
    }
    userLogs[data.userId].push({
      timestamp: new Date(),
      message: data.message,
      type: data.type
    });
  });
  
  // Update email count
  socket.on('email-count-update', (data) => {
    updateEmailCount(data.userId, data.count);
  });
}

// Update user status in the table
function updateUserStatus(userId, isOnline) {
  const userRow = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (userRow) {
    const statusIndicator = userRow.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.classList.toggle('online', isOnline);
      statusIndicator.classList.toggle('offline', !isOnline);
      statusIndicator.setAttribute('title', isOnline ? 'Online' : 'Offline');
    }
  }
}

// Update email count for a user
function updateEmailCount(userId, count) {
  const userRow = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (userRow) {
    const emailCell = userRow.querySelector('td:nth-child(8)');
    if (emailCell) {
      const countSpan = emailCell.querySelector('.email-count');
      if (countSpan) {
        countSpan.textContent = count;
      }
      
      // Update download button visibility
      const downloadBtn = emailCell.querySelector('.download-emails');
      const emptyIcon = emailCell.querySelector('.text-muted');
      
      if (count > 0) {
        if (downloadBtn) {
          downloadBtn.style.display = '';
        } else if (emptyIcon) {
          // Replace empty icon with download button
          const newBtn = document.createElement('a');
          newBtn.href = `/admin/api/users/${userId}/emails`;
          newBtn.className = 'btn btn-sm btn-terminal-info download-emails';
          newBtn.dataset.id = userId;
          newBtn.title = 'Download & Clear Emails';
          newBtn.innerHTML = '<i class="fa fa-download"></i>';
          emptyIcon.replaceWith(newBtn);
        }
      } else {
        if (downloadBtn) {
          // Replace download button with empty icon
          const emptySpan = document.createElement('span');
          emptySpan.className = 'text-muted';
          emptySpan.innerHTML = '<i class="fa fa-inbox"></i>';
          downloadBtn.replaceWith(emptySpan);
        }
      }
    }
  
    // If this is the currently selected user, update the status in the detail view
    if (selectedUserId === userId) {
      const userStatusElement = document.getElementById('userStatus');
      if (userStatusElement) {
        userStatusElement.className = status === 'online' ? 'text-success' : 'text-danger';
        userStatusElement.textContent = status === 'online' ? 'Online' : 'Offline';
      }
    }
  }
}

// Update user detail view status
function updateDetailViewStatus(userId, status) {
  // If this is the currently selected user, update the status in the detail view
  if (selectedUserId === userId) {
    const userStatusElement = document.getElementById('userStatus');
    if (userStatusElement) {
      userStatusElement.className = status === 'online' ? 'text-success' : 'text-danger';
      userStatusElement.textContent = status === 'online' ? 'Online' : 'Offline';
    }
  }
}

// Show add user modal
function showAddUserModal() {
  const modal = document.getElementById('userModal');
  const modalTitle = document.getElementById('userModalLabel');
  const userIdInput = document.getElementById('userId');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const isAdminCheck = document.getElementById('isAdmin');
  const noteInput = document.getElementById('userNote');
  
  // Reset form
  userIdInput.value = '';
  usernameInput.value = '';
  passwordInput.value = '';
  isAdminCheck.checked = false;
  noteInput.value = '';
  
  // Update modal title
  modalTitle.textContent = 'Add New User';
  
  // Show modal
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

// Show edit user modal
function showEditUserModal(userId) {
  console.log('Fetching user with ID:', userId);
  console.log('Document cookie:', document.cookie);
  
  fetch(`/admin/api/users/${userId}`, {
    method: 'GET',
    credentials: 'include', // Add credentials to include cookies
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache'
    }
  })
    .then(response => {
      if (!response.ok) {
        // First try to parse as JSON to get error message
        return response.text().then(text => {
          try {
            // Try to parse as JSON
            const data = JSON.parse(text);
            if (data.error && data.redirect && response.status === 401) {
              // Authentication error with redirect instruction
              console.log('Session expired, redirecting to login');
              window.location.href = data.redirect;
              throw new Error('Session expired. Please log in again.');
            } else if (data.error) {
              // Other JSON error
              throw new Error(data.error);
            }
          } catch (e) {
            // If not JSON or other parsing error
            throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
          }
        });
      }
      return response.json();
    })
    .then(user => {
      const modal = document.getElementById('userModal');
      const modalTitle = document.getElementById('userModalLabel');
      const userIdInput = document.getElementById('userId');
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const isAdminCheck = document.getElementById('isAdmin');
      const noteInput = document.getElementById('userNote');
      
      // Fill form with user data
      userIdInput.value = user.id;
      usernameInput.value = user.username;
      passwordInput.value = ''; // Don't prefill password for security
      passwordInput.placeholder = 'Leave blank to keep current password';
      isAdminCheck.checked = user.isAdmin;
      noteInput.value = user.note || '';
      
      // Update modal title
      modalTitle.textContent = `Edit User: ${user.username}`;
      
      // Show modal
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    })
    .catch(error => {
      console.error('Error fetching user:', error);
      addLogMessage(`[!] Error fetching user: ${error.message}`, 'error');
      alert(`Error: ${error.message}`);
    });
}

// Save user (create or update)
function saveUser() {
  const userIdInput = document.getElementById('userId');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const isAdminCheck = document.getElementById('isAdmin');
  const noteInput = document.getElementById('userNote');
  
  const userId = userIdInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const isAdmin = isAdminCheck.checked;
  const note = noteInput.value.trim();
  
  // Determine if this is a create or update operation
  const isUpdate = !!userId;
  
  // Validate
  if (!username) {
    alert('Username is required');
    return;
  }
  
  // For new users, password is required
  if (!isUpdate && !password) {
    alert('Password is required for new users');
    return;
  }
  
  // Create user data object
  const userData = {
    username,
    isAdmin,
    note
  };
  
  // Add password - always for new users, only if provided for updates
  if (!isUpdate || password) {
    userData.password = password;
  }
  
  // URL and method based on whether this is an update or create operation
  const url = isUpdate ? `/admin/api/users/${userId}` : '/admin/api/users';
  const method = isUpdate ? 'PUT' : 'POST';
  
  // Send request
  fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    credentials: 'include', // Add credentials to include cookies
    body: JSON.stringify(userData)
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          try {
            // Try to parse as JSON
            const data = JSON.parse(text);
            if (data.error && data.redirect && response.status === 401) {
              console.log('Session expired, redirecting to login');
              window.location.href = data.redirect;
              throw new Error('Session expired. Please log in again.');
            } else if (data.error) {
              throw new Error(data.error || 'Failed to save user');
            }
          } catch (e) {
            throw new Error(`Failed to save user: ${response.status} ${response.statusText}`);
          }
        });
      }
      return response.json();
    })
    .then(data => {
      // Close modal
      const modal = document.getElementById('userModal');
      const bsModal = bootstrap.Modal.getInstance(modal);
      bsModal.hide();
      
      // Refresh user list
      fetchUsers();
      
      // Show success message
      addLogMessage(`[✓] User ${isUpdate ? 'updated' : 'created'} successfully`, 'success');
    })
    .catch(error => {
      console.error('Error saving user:', error);
      alert(`Error: ${error.message}`);
    });
}

// Confirm delete user
function confirmDeleteUser(userId) {
  if (confirm('Are you sure you want to delete this user?')) {
    deleteUser(userId);
  }
}

// Delete user
function deleteUser(userId) {
  fetch(`/admin/api/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    credentials: 'include' // Add credentials to include cookies
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          try {
            // Try to parse as JSON
            const data = JSON.parse(text);
            if (data.error && data.redirect && response.status === 401) {
              console.log('Session expired, redirecting to login');
              window.location.href = data.redirect;
              throw new Error('Session expired. Please log in again.');
            } else if (data.error) {
              throw new Error(data.error || 'Failed to delete user');
            }
          } catch (e) {
            throw new Error(`Failed to delete user: ${response.status} ${response.statusText}`);
          }
        });
      }
      return response.json();
    })
    .then(data => {
      // Refresh user list
      fetchUsers();
      
      // Show success message
      addLogMessage('[✓] User deleted successfully', 'success');
    })
    .catch(error => {
      console.error('Error deleting user:', error);
      alert(`Error: ${error.message}`);
    });
}

// View user details
function viewUser(userId) {
  window.location.href = `/admin/users/${userId}`;
}

// Toggle live logs
function toggleLiveLogs() {
  liveLogsEnabled = !liveLogsEnabled;
  
  const toggleLogsBtn = document.getElementById('toggleLogsBtn');
  if (toggleLogsBtn) {
    toggleLogsBtn.textContent = liveLogsEnabled ? 'Pause Live Logs' : 'Resume Live Logs';
    toggleLogsBtn.className = liveLogsEnabled ? 'btn btn-outline-warning' : 'btn btn-outline-success';
  }
  
  addLogMessage(`[*] Live logs ${liveLogsEnabled ? 'enabled' : 'disabled'}`, 'info');
}

// Download user emails
function downloadUserEmails() {
  if (!selectedUserId) return;
  
  // Show loading message
  addLogMessage('[*] Downloading email cache and clearing from server...', 'info');
  
  // Create a direct download link and click it
  const downloadLink = document.createElement('a');
  downloadLink.href = `/admin/api/users/${selectedUserId}/emails`;
  downloadLink.download = `user_emails_${selectedUserId}.txt`; // Suggest filename for download
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);
  
  // Trigger click to start download
  downloadLink.click();
  
  // Remove the link after download starts
  setTimeout(() => {
    document.body.removeChild(downloadLink);
    addLogMessage('[✓] Email cache downloaded and cleared successfully', 'success');
    
    // Update the UI to show 0 emails in cache
    updateEmailCount(selectedUserId, 0);
  }, 1000);
}

// Terminal Log Functions
function addLogMessage(message, type = 'info') {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  
  const timestamp = document.createElement('span');
  timestamp.className = 'log-timestamp';
  timestamp.textContent = `[${new Date().toLocaleTimeString()}]`;
  
  logEntry.appendChild(timestamp);
  logEntry.appendChild(document.createTextNode(' ' + message));
  
  terminal.appendChild(logEntry);
  terminal.scrollTop = terminal.scrollHeight;
}

// Clear logs
function clearLogs() {
  const terminal = document.getElementById('terminal-logs');
  if (terminal) {
    terminal.innerHTML = '';
  }
  addLogMessage('[*] Terminal cleared', 'info');
}

// Load user logs
function loadUserLogs(userId) {
  selectedUserId = userId;
  
  // Clear existing logs
  clearLogs();
  
  // Add header
  addLogMessage(`[*] Loading logs for user ID: ${userId}`, 'info');
  
  // Load logs from API
  fetch(`/admin/api/users/${userId}/logs`, {
    credentials: 'include' // Add credentials to include cookies
  })
    .then(response => response.json())
    .then(logs => {
      if (logs.length === 0) {
        addLogMessage('[*] No logs found for this user', 'info');
      } else {
        logs.forEach(log => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          addLogMessage(`[${log.action}] ${log.details}`, 'info');
        });
      }
    })
    .catch(error => {
      console.error('Error loading logs:', error);
      addLogMessage(`[!] Error loading logs: ${error.message}`, 'error');
    });
  
  // Add any cached logs
  if (userLogs[userId] && userLogs[userId].length > 0) {
    addLogMessage('[*] Recent activity:', 'info');
    userLogs[userId].forEach(log => {
      addLogMessage(log.message, log.type);
    });
  }
}
