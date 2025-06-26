// Get user ID from the page if available
const userId = document.getElementById('userId') ? document.getElementById('userId').value : null;

// Connect to Socket.IO server with user ID if available
const socket = io({
  query: {
    userId: userId
  }
});

// Global variables
let emailList = [];
let currentJobId = null;
let currentViewMode = 'preview'; // 'preview' or 'html'
let emailTemplates = []; // Store email templates
let emailLinks = []; // Store email links
let draggedItem = null; // Track the currently dragged item

// Initialize the application when DOM is ready
// Drag and Drop Functions for Email List
function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    
    // Set data for drag operation
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
    
    // Add a visual indicator to all rows
    const tbody = document.getElementById('emailTable').querySelector('tbody');
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.classList.add('drag-active');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); // Necessary to allow dropping
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation(); // Stops some browsers from redirecting
    }
    
    // Only process if we're not dropping onto the same element
    if (draggedItem !== this) {
        const fromIndex = parseInt(draggedItem.dataset.index);
        const toIndex = parseInt(this.dataset.index);
        
        // Reorder the emailList array
        const movedItem = emailList[fromIndex];
        
        // Remove the item from its original position
        emailList.splice(fromIndex, 1);
        
        // Insert the item at the new position
        emailList.splice(toIndex, 0, movedItem);
        
        // Re-render the table with updated order
        renderEmailTable();
        
        // Log the reordering
        addLogMessage(`[✓] Email moved from position ${fromIndex + 1} to ${toIndex + 1}`, 'success');
    }
    
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    
    // Remove visual indicators from all rows
    const tbody = document.getElementById('emailTable').querySelector('tbody');
    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.classList.remove('drag-active');
        row.classList.remove('drag-over');
    });
}

// Links Management Functions
function showLinksModal() {
    // Load links from localStorage if available
    loadLinks();
    
    // Render the links list
    renderLinksList();
    
    // Show the modal
    const linksModal = new bootstrap.Modal(document.getElementById('linksModal'));
    linksModal.show();
}

function addLink() {
    const linkUrl = document.getElementById('linkUrl').value.trim();
    const linkDescription = document.getElementById('linkDescription').value.trim();
    
    if (!linkUrl) {
        addLogMessage('[!] Link URL is required', 'error');
        return;
    }
    
    // Validate URL format
    try {
        new URL(linkUrl); // This will throw an error if the URL is invalid
    } catch (e) {
        addLogMessage('[!] Invalid URL format', 'error');
        return;
    }
    
    // Create a new link object
    const newLink = {
        id: Date.now().toString(),
        url: linkUrl,
        description: linkDescription || linkUrl
    };
    
    // Add to links array
    emailLinks.push(newLink);
    
    // Save to localStorage
    saveLinks();
    
    // Clear form fields
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkDescription').value = '';
    
    // Re-render the links list
    renderLinksList();
    
    // Update status line
    updateStatusLine();
    
    addLogMessage(`[✓] Link "${newLink.description}" added successfully`, 'success');
}

function deleteLink(id) {
    // Find the link to delete
    const linkIndex = emailLinks.findIndex(link => link.id === id);
    
    if (linkIndex === -1) {
        addLogMessage('[!] Link not found', 'error');
        return;
    }
    
    const deletedLink = emailLinks[linkIndex];
    
    // Remove from array
    emailLinks.splice(linkIndex, 1);
    
    // Save to localStorage
    saveLinks();
    
    // Re-render the links list
    renderLinksList();
    
    // Update status line
    updateStatusLine();
    
    addLogMessage(`[✓] Link "${deletedLink.description}" deleted`, 'success');
}

function renderLinksList() {
    const linksList = document.getElementById('linksList');
    
    if (!linksList) return;
    
    // Clear current content
    linksList.innerHTML = '';
    
    if (emailLinks.length === 0) {
        linksList.innerHTML = '<div class="alert alert-secondary">No links added yet.</div>';
        return;
    }
    
    // Create list of links
    const list = document.createElement('div');
    list.className = 'list-group';
    
    emailLinks.forEach(link => {
        const item = document.createElement('div');
        item.className = 'list-group-item bg-dark text-light d-flex justify-content-between align-items-center';
        
        const linkInfo = document.createElement('div');
        linkInfo.innerHTML = `
            <strong>${link.description}</strong><br>
            <small class="text-muted">${link.url}</small>
        `;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.innerHTML = '<i class="fa fa-trash"></i>';
        deleteBtn.onclick = () => deleteLink(link.id);
        
        item.appendChild(linkInfo);
        item.appendChild(deleteBtn);
        list.appendChild(item);
    });
    
    linksList.appendChild(list);
}

function saveLinks() {
    localStorage.setItem('emailLinks', JSON.stringify(emailLinks));
}

function loadLinks() {
    const storedLinks = localStorage.getItem('emailLinks');
    if (storedLinks) {
        emailLinks = JSON.parse(storedLinks);
    }
}

function processLinks(content) {
    // Check if content contains {link} placeholder
    if (content.includes('{link}')) {
        // Make sure we have links
        if (emailLinks.length === 0) {
            addLogMessage('[!] Warning: {link} found but no links are available', 'warning');
            return content;
        }
        
        // Replace all instances of {link} with a random link
        let linkCount = 0;
        while (content.includes('{link}')) {
            // Get a random link
            const randomIndex = Math.floor(Math.random() * emailLinks.length);
            const randomLink = emailLinks[randomIndex];
            
            // Replace the first occurrence of {link}
            content = content.replace('{link}', randomLink.url);
            
            linkCount++;
        }
        
        addLogMessage(`[*] Replaced ${linkCount} {link} tags with random links`, 'info');
    }
    
    return content;
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize HTML editor and preview
    const emailBodyHtml = document.getElementById('emailBodyHtml');
    const emailBodyPreview = document.getElementById('emailBodyPreview');
    
    // Set initial content
    emailBodyHtml.value = '<p>Enter your email content here...</p>';
    emailBodyPreview.innerHTML = emailBodyHtml.value;
    
    // Set up view toggle buttons with null checks
    const viewHtmlBtn = document.getElementById('viewHtmlBtn');
    const viewPreviewBtn = document.getElementById('viewPreviewBtn');
    
    if (viewHtmlBtn) {
        viewHtmlBtn.addEventListener('click', () => {
            currentViewMode = 'html';
            if (emailBodyHtml) emailBodyHtml.style.display = 'block';
            if (emailBodyPreview) emailBodyPreview.style.display = 'none';
            
            if (viewHtmlBtn) viewHtmlBtn.classList.add('active');
            if (viewPreviewBtn) viewPreviewBtn.classList.remove('active');
        });
    }
    
    if (viewPreviewBtn) {
        viewPreviewBtn.addEventListener('click', () => {
            currentViewMode = 'preview';
            if (emailBodyHtml) emailBodyHtml.style.display = 'none';
            if (emailBodyPreview) {
                emailBodyPreview.style.display = 'block';
                if (emailBodyHtml) emailBodyPreview.innerHTML = emailBodyHtml.value;
            }
            
            if (viewPreviewBtn) viewPreviewBtn.classList.add('active');
            if (viewHtmlBtn) viewHtmlBtn.classList.remove('active');
        });
    }
    
    // Set up HTML textarea to update preview on change with null checks
    if (emailBodyHtml) {
        emailBodyHtml.addEventListener('input', () => {
            if (currentViewMode === 'preview' && emailBodyPreview) {
                emailBodyPreview.innerHTML = emailBodyHtml.value;
            }
        });
    }
    
    // Set up HTML file upload with null check
    const htmlFileUpload = document.getElementById('htmlFileUpload');
    if (htmlFileUpload) {
        htmlFileUpload.addEventListener('change', handleHtmlFileUpload);
    }
    
    // Set up template management with null checks
    const manageTemplatesBtn = document.getElementById('manageTemplatesBtn');
    if (manageTemplatesBtn) {
        manageTemplatesBtn.addEventListener('click', showTemplateModal);
    }
    
    // Set up links management
    const manageLinksBtn = document.getElementById('manageLinksBtn');
    if (manageLinksBtn) {
        manageLinksBtn.addEventListener('click', showLinksModal);
    }
    
    // Set up add link button
    const addLinkBtn = document.getElementById('addLinkBtn');
    if (addLinkBtn) {
        addLinkBtn.addEventListener('click', addLink);
    }
    
    const addTemplateBtn = document.getElementById('addTemplateBtn');
    if (addTemplateBtn) {
        addTemplateBtn.addEventListener('click', addTemplate);
    }
    
    // Load templates from localStorage
    loadTemplates();

    // Initialize Bootstrap modal with null check
    let emailModal;
    const emailModalElement = document.getElementById('emailModal');
    if (emailModalElement) {
        emailModal = new bootstrap.Modal(emailModalElement);
    }

    // Event listeners - with null checks
    const addSmtpBtn = document.getElementById('addSmtp');
    if (addSmtpBtn) {
        addSmtpBtn.addEventListener('click', function() {
            addSmtpConfig();
        });
    }
    
    const uploadEmailsForm = document.getElementById('uploadEmailsForm');
    if (uploadEmailsForm) {
        uploadEmailsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadEmailFile();
        });
    }
    
    // Add null checks for all event listeners
    const parseEmailsBtn = document.getElementById('parseEmails');
    if (parseEmailsBtn) {
        parseEmailsBtn.addEventListener('click', parseEmailsFromTextarea);
    }
    
    const uploadEmailsBtn = document.getElementById('uploadEmails');
    if (uploadEmailsBtn) {
        uploadEmailsBtn.addEventListener('click', uploadEmailFile);
    }
    
    const addEmailBtn = document.getElementById('addEmailBtn');
    if (addEmailBtn) {
        addEmailBtn.addEventListener('click', showAddEmailModal);
    }
    
    const clearEmailsBtn = document.getElementById('clearEmails');
    if (clearEmailsBtn) {
        clearEmailsBtn.addEventListener('click', clearEmails);
    }
    
    const sendEmailsBtn = document.getElementById('sendEmails');
    if (sendEmailsBtn) {
        sendEmailsBtn.addEventListener('click', function() {
            const threadCount = document.getElementById('threadCount')?.value || 1;
            startSending(threadCount);
        });
    }
    
    const stopSendingBtn = document.getElementById('stopSending');
    if (stopSendingBtn) {
        stopSendingBtn.addEventListener('click', stopSending);
    }
    
    const clearLogsBtn = document.getElementById('clearLogs');
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearLogs);
    }
    
    // Set preview as default view
    document.getElementById('viewPreviewBtn').classList.add('active');
    document.getElementById('saveEmail').addEventListener('click', saveEmail);

    // Socket.IO event listeners
    socket.on('log', handleLogMessage);
    socket.on('progress', updateProgress);

    // Initialize SMTP list
    initializeSmtpList();

    // Add a welcome message to the terminal
    addLogMessage('[*] Inderman Mailer initialized and ready', 'info');
    addLogMessage('[*] Add SMTP configurations and email list to begin', 'info');

    // Thread count slider
    const threadCountSlider = document.getElementById('threadCount');
    const threadCountValue = document.getElementById('threadCountValue');
    
    if (threadCountSlider && threadCountValue) {
        threadCountSlider.addEventListener('input', function() {
            threadCountValue.textContent = this.value;
        });
    }
});

// Initialize SMTP list with toggle buttons and event listeners
function initializeSmtpList() {
    const smtpList = document.getElementById('smtpList');
    if (!smtpList) return;
    
    const smtpItems = smtpList.querySelectorAll('.smtp-item');
    
    // Add click event listeners to select buttons
    const selectButtons = document.querySelectorAll('.smtp-select');
    if (selectButtons) {
        selectButtons.forEach(button => {
            button.addEventListener('click', function() {
                const smtpId = this.getAttribute('data-id');
                toggleSmtpSelection(smtpId, this);
            });
        });
    }

    // Add click event listeners to delete buttons
    const deleteButtons = document.querySelectorAll('.smtp-delete');
    if (deleteButtons) {
        deleteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const smtpId = this.getAttribute('data-id');
                deleteSmtpById(smtpId);
            });
        });
    }
    
    // Add click event listeners to verify buttons
    const verifyButtons = document.querySelectorAll('.smtp-verify');
    if (verifyButtons) {
        verifyButtons.forEach(button => {
            button.addEventListener('click', function() {
                const smtpId = this.getAttribute('data-id');
                verifySmtpConnection(smtpId, this);
            });
        });
    }

    // Initialize selected state based on hidden input
    const selectedSmtps = getSelectedSmtps();
    selectedSmtps.forEach(id => {
        const button = document.querySelector(`.smtp-select[data-id="${id}"]`);
        if (button) {
            button.classList.add('selected');
            button.innerHTML = '<i class="fa fa-check-square-o"></i>';
        }
    });
    
    // If no SMTPs, show empty message
    if (smtpItems.length === 0) {
        smtpList.innerHTML = '<div class="empty-message">No SMTP configurations added yet.</div>';
    }
}

// SMTP Management Functions
function addSmtpConfig() {
    const smtpString = document.getElementById('smtpConfig').value.trim();
    
    if (!smtpString) {
        addLogMessage('[!] SMTP configuration string is required', 'error');
        return;
    }
    
    const parts = smtpString.split('|');
    if (parts.length !== 4) {
        addLogMessage('[!] Invalid SMTP format. Use host|port|user|password', 'error');
        return;
    }
    
    fetch('/api/smtp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include', // Include session cookies
        body: JSON.stringify({ smtpString })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                // Session expired or not authenticated
                addLogMessage('[!] Authentication error. Please refresh the page and try again.', 'error');
                setTimeout(() => window.location.href = '/login', 2000); // Redirect to login
                throw new Error('Authentication failed');
            }
            return response.text().then(text => {
                // Try to parse as JSON, but handle non-JSON responses
                try {
                    return JSON.parse(text);
                } catch (e) {
                    throw new Error(`Server error: ${text || response.statusText}`);
                }
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            addLogMessage(`[!] Error: ${data.error}`, 'error');
        } else {
            addLogMessage(`[✓] SMTP added: ${parts[0]}:${parts[1]} | ${parts[2]}`, 'success');
            document.getElementById('smtpConfig').value = '';
            
            // Add to SMTP list
            const smtpList = document.getElementById('smtpList');
            
            // Remove "no SMTPs" message if it exists
            const emptyMessage = smtpList.querySelector('.smtp-empty');
            if (emptyMessage) {
                smtpList.removeChild(emptyMessage);
            }
            
            // Create new SMTP item
            const smtpItem = document.createElement('div');
            smtpItem.className = 'smtp-item';
            smtpItem.dataset.id = data.id;
            
            smtpItem.innerHTML = `
                <div class="smtp-info">${data.host}:${data.port} (${data.user})</div>
                <div class="smtp-actions">
                    <button class="btn btn-sm btn-toggle smtp-select" data-id="${data.id}" title="Select/Unselect">
                        <i class="fa fa-square-o"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary smtp-verify" data-id="${data.id}" title="Verify Connection">
                        <i class="fa fa-check-circle"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger smtp-delete" data-id="${data.id}" title="Delete">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            `;
            
            smtpList.appendChild(smtpItem);
            
            // Add event listeners
            const selectBtn = smtpItem.querySelector('.smtp-select');
            selectBtn.addEventListener('click', toggleSmtpSelection);
            
            const deleteBtn = smtpItem.querySelector('.smtp-delete');
            deleteBtn.addEventListener('click', () => deleteSmtpById(data.id));
            
            const verifyBtn = smtpItem.querySelector('.smtp-verify');
            verifyBtn.addEventListener('click', () => verifySmtpConnection(data.id, verifyBtn));
            
            updateStatusLine();
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
    });
}

// Toggle SMTP selection
function toggleSmtpSelection(smtpId, buttonElement) {
    // Handle both event objects and direct button element parameters
    let button;
    
    if (typeof smtpId === 'object' && smtpId.currentTarget) {
        // Called from an event listener
        button = smtpId.currentTarget;
        smtpId = button.getAttribute('data-id');
    } else {
        // Called directly with ID and button
        button = buttonElement;
    }
    
    // Safety check - if button is undefined, try to find it
    if (!button) {
        button = document.querySelector(`.smtp-select[data-id="${smtpId}"]`);
        if (!button) {
            console.error(`Could not find button for SMTP ID: ${smtpId}`);
            return; // Exit if we can't find the button
        }
    }
    
    const icon = button.querySelector('i');
    if (!icon) {
        console.error('Could not find icon element in button');
        return;
    }
    
    // Toggle selected state
    if (button.classList.contains('selected')) {
        // Deselect
        button.classList.remove('selected');
        icon.className = 'fa fa-square-o';
        removeSelectedSmtp(smtpId);
    } else {
        // Select
        button.classList.add('selected');
        icon.className = 'fa fa-check-square-o';
        addSelectedSmtp(smtpId);
    }
    
    updateStatusLine();
}

// Add SMTP ID to selected list
function addSelectedSmtp(id) {
    const selectedSmtps = getSelectedSmtps();
    if (!selectedSmtps.includes(id)) {
        selectedSmtps.push(id);
        document.getElementById('selectedSmtps').value = JSON.stringify(selectedSmtps);
    }
}

// Remove SMTP ID from selected list
function removeSelectedSmtp(id) {
    const selectedSmtps = getSelectedSmtps();
    const index = selectedSmtps.indexOf(id);
    if (index !== -1) {
        selectedSmtps.splice(index, 1);
        document.getElementById('selectedSmtps').value = JSON.stringify(selectedSmtps);
    }
}

// Get array of selected SMTP IDs
function getSelectedSmtps() {
    const selectedSmtpsValue = document.getElementById('selectedSmtps').value;
    return selectedSmtpsValue ? JSON.parse(selectedSmtpsValue) : [];
}

// Delete SMTP by ID
function deleteSmtpById(id) {
    if (!id) return;
    
    fetch(`/api/smtp/${id}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Remove from UI
            const smtpItem = document.querySelector(`.smtp-item[data-id="${id}"]`);
            if (smtpItem) {
                smtpItem.remove();
            }
            
            // Remove from selected SMTPs if present
            removeSelectedSmtp(id);
            
            // Update status line
            updateStatusLine();
            
            // Show success message
            addLogMessage(`[✓] SMTP configuration deleted successfully`, 'success');
            
            // Show empty message if no SMTPs left
            const smtpList = document.getElementById('smtpList');
            if (smtpList && smtpList.children.length === 0) {
                smtpList.innerHTML = '<div class="empty-message">No SMTP configurations added yet.</div>';
            }
        } else {
            addLogMessage(`[!] Error deleting SMTP: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
    });
}

// Verify SMTP Connection
function verifySmtpConnection(id, button) {
    if (!id || !button) return;
    
    // Update button state to show it's verifying
    button.classList.add('verifying');
    button.disabled = true;
    button.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    
    // Log the verification attempt
    const smtpItem = button.closest('.smtp-item');
    const smtpHost = smtpItem ? smtpItem.querySelector('.smtp-info').textContent : 'Unknown';
    addLogMessage(`[*] Testing connection to SMTP server: ${smtpHost}...`, 'info');
    
    // Call the API to test the connection
    fetch(`/api/smtp/${id}/test`)
        .then(response => response.json())
        .then(data => {
            // Remove verifying state
            button.classList.remove('verifying');
            button.disabled = false;
            
            if (data.success) {
                // Connection successful
                button.classList.add('success');
                button.classList.remove('failure');
                button.innerHTML = '<i class="fa fa-check-circle"></i> ';
                addLogMessage(`[✓] SMTP connection successful: ${smtpHost}`, 'success');
                
                // Reset button state after 3 seconds
                setTimeout(() => {
                    button.classList.remove('success');
                    button.innerHTML = '<i class="fa fa-check-circle"></i>';
                }, 3000);
            } else {
                // Connection failed
                button.classList.add('failure');
                button.classList.remove('success');
                button.innerHTML = '<i class="fa fa-times-circle"></i> ';
                addLogMessage(`[!] SMTP connection failed: ${smtpHost} - ${data.error}`, 'error');
                
                // Reset button state after 3 seconds
                setTimeout(() => {
                    button.classList.remove('failure');
                    button.innerHTML = '<i class="fa fa-check-circle"></i>';
                }, 3000);
            }
        })
        .catch(error => {
            // Handle fetch errors
            button.classList.remove('verifying');
            button.disabled = false;
            button.classList.add('failure');
            button.innerHTML = '<i class="fa fa-times-circle"></i> ';
            addLogMessage(`[!] Error testing SMTP: ${error.message}`, 'error');
            
            // Reset button state after 3 seconds
            setTimeout(() => {
                button.classList.remove('failure');
                button.innerHTML = '<i class="fa fa-check-circle"></i>';
            }, 3000);
        });
}

// Legacy function - no longer used but kept for reference
function deleteSmtpConfig() {
    // This function is replaced by individual delete buttons
    addLogMessage('[!] Please use the delete buttons next to each SMTP', 'warning');
}

// Email Management Functions
function parseEmailsFromTextarea() {
    const textarea = document.getElementById('emailList');
    const text = textarea.value.trim();
    
    if (!text) {
        addLogMessage('[!] Email list is empty', 'error');
        return;
    }
    
    const emails = text.split('\n')
        .map(email => email.trim())
        .filter(email => email && validateEmail(email));
    
    if (emails.length === 0) {
        addLogMessage('[!] No valid emails found', 'error');
        return;
    }
    
    addEmailsToTable(emails);
    textarea.value = '';
    addLogMessage(`[✓] ${emails.length} email(s) added to the list`, 'success');
}

function uploadEmailFile() {
    const fileInput = document.getElementById('emailFile');
    const file = fileInput.files[0];
    
    if (!file) {
        addLogMessage('[!] No file selected', 'error');
        return;
    }
    
    if (file.type !== 'text/plain') {
        addLogMessage('[!] Only .txt files are allowed', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('emailFile', file);
    
    fetch('/api/upload-emails', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            addLogMessage(`[!] Error: ${data.error}`, 'error');
        } else if (data.emails && data.emails.length > 0) {
            addEmailsToTable(data.emails);
            fileInput.value = '';
            addLogMessage(`[✓] ${data.emails.length} email(s) loaded from file`, 'success');
        } else {
            addLogMessage('[!] No valid emails found in file', 'warning');
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
    });
}

function addEmailsToTable(emails) {
    const uniqueEmails = [...new Set(emails)];
    const existingEmails = new Set(emailList);
    
    const newEmails = uniqueEmails.filter(email => !existingEmails.has(email));
    
    if (newEmails.length === 0) {
        addLogMessage('[!] All emails already exist in the list', 'warning');
        return;
    }
    
    emailList = [...emailList, ...newEmails];
    
    renderEmailTable();
    updateStatusLine();
}

function renderEmailTable() {
    const tbody = document.getElementById('emailTable').querySelector('tbody');
    tbody.innerHTML = '';
    
    emailList.forEach((email, index) => {
        const tr = document.createElement('tr');
        tr.draggable = true; // Make row draggable
        tr.dataset.index = index; // Store the index for drag operations
        
        // Add drag event listeners
        tr.addEventListener('dragstart', handleDragStart);
        tr.addEventListener('dragover', handleDragOver);
        tr.addEventListener('dragenter', handleDragEnter);
        tr.addEventListener('dragleave', handleDragLeave);
        tr.addEventListener('drop', handleDrop);
        tr.addEventListener('dragend', handleDragEnd);
        
        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;
        
        const tdEmail = document.createElement('td');
        tdEmail.textContent = email;
        
        const tdActions = document.createElement('td');
        
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle me-2';
        dragHandle.innerHTML = '&#9776;'; // Unicode hamburger icon
        dragHandle.style.cursor = 'grab';
        dragHandle.title = 'Drag to reorder';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline-primary btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => showEditEmailModal(index));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm ms-2';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteEmail(index));
        
        tdActions.appendChild(dragHandle);
        tdActions.appendChild(editBtn);
        tdActions.appendChild(deleteBtn);
        
        tr.appendChild(tdIndex);
        tr.appendChild(tdEmail);
        tr.appendChild(tdActions);
        
        tbody.appendChild(tr);
    });
    
    document.getElementById('emailCount').textContent = `${emailList.length} emails`;
}

function showAddEmailModal() {
    document.getElementById('emailModalLabel').textContent = 'Add Email';
    document.getElementById('modalEmail').value = '';
    document.getElementById('saveEmail').dataset.index = '-1';
    
    const emailModal = new bootstrap.Modal(document.getElementById('emailModal'));
    emailModal.show();
}

function showEditEmailModal(index) {
    document.getElementById('emailModalLabel').textContent = 'Edit Email';
    document.getElementById('modalEmail').value = emailList[index];
    document.getElementById('saveEmail').dataset.index = index;
    
    const emailModal = new bootstrap.Modal(document.getElementById('emailModal'));
    emailModal.show();
}

function saveEmail() {
    const emailInput = document.getElementById('modalEmail');
    const email = emailInput.value.trim();
    const index = parseInt(document.getElementById('saveEmail').dataset.index);
    
    if (!email || !validateEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    if (index >= 0) {
        // Edit existing email
        emailList[index] = email;
        addLogMessage(`[✓] Email updated: ${email}`, 'success');
    } else {
        // Add new email
        emailList.push(email);
        addLogMessage(`[✓] Email added: ${email}`, 'success');
    }
    
    renderEmailTable();
    updateStatusLine();
    
    // Close modal
    const emailModal = bootstrap.Modal.getInstance(document.getElementById('emailModal'));
    emailModal.hide();
}

function deleteEmail(index) {
    const email = emailList[index];
    emailList.splice(index, 1);
    renderEmailTable();
    updateStatusLine();
    addLogMessage(`[✓] Email removed: ${email}`, 'success');
}

function clearEmails() {
    if (emailList.length === 0) {
        addLogMessage('[!] Email list is already empty', 'warning');
        return;
    }
    
    const count = emailList.length;
    emailList = [];
    renderEmailTable();
    updateStatusLine();
    addLogMessage(`[✓] Cleared ${count} email(s) from the list`, 'success');
}

// Sending Functions
function startSending(threadCount = 1) {
    const senderName = document.getElementById('senderName').value.trim();
    const subject = document.getElementById('subject').value.trim();
    let emailBodyHtml = document.getElementById('emailBodyHtml').value.trim();
    
    // Ensure thread count is valid
    threadCount = parseInt(threadCount) || 1;
    threadCount = Math.max(1, Math.min(10, threadCount)); // Clamp between 1-10
    
    // Validate inputs
    if (!senderName) {
        addLogMessage('[!] Sender name is required', 'error');
        return;
    }
    
    if (!subject) {
        addLogMessage('[!] Subject is required', 'error');
        return;
    }
    
    if (!emailBodyHtml) {
        addLogMessage('[!] Email body is required', 'error');
        return;
    }
    
    if (emailList.length === 0) {
        addLogMessage('[!] No emails to send', 'error');
        return;
    }
    
    // Get selected SMTP IDs from our hidden input
    const selectedSmtpIds = getSelectedSmtps();
    if (selectedSmtpIds.length === 0) {
        addLogMessage('[!] No SMTP selected', 'error');
        return;
    }
    
    // Keep the original email body with tags for processing per email
    // This ensures each {template} and {link} tag gets a random replacement for each email
    
    // Load templates and links to send to the backend for processing
    loadTemplates();
    loadLinks();
    
    // Disable send button and enable stop button
    document.getElementById('sendEmails').disabled = true;
    document.getElementById('stopSending').disabled = false;
    
    // Log thread count
    addLogMessage(`[*] Starting email sending with ${threadCount} thread${threadCount > 1 ? 's' : ''}`, 'info');
    
    // Send request to start sending
    fetch('/api/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            senderName: senderName,
            subject: subject,
            emailBody: emailBodyHtml,
            emails: emailList,
            selectedSmtpIds: selectedSmtpIds,
            threadCount: threadCount,
            templates: emailTemplates,
            links: emailLinks
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            addLogMessage(`[!] Error: ${data.error}`, 'error');
            resetSendingButtons();
        } else {
            currentJobId = data.jobId;
            addLogMessage(`[*] Email sending process started with Job ID: ${currentJobId}`, 'info');
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
        resetSendingButtons();
    });
}

function stopSending() {
    if (!currentJobId) {
        addLogMessage('[!] No active sending job to stop', 'error');
        return;
    }
    
    // Disable the stop button to prevent multiple clicks
    document.getElementById('stopSending').disabled = true;
    
    // Show immediate feedback
    addLogMessage('[*] Aborting email sending process immediately...', 'warning');
    
    fetch('/api/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId: currentJobId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            addLogMessage(`[!] Error: ${data.error}`, 'error');
            // Re-enable button in case of error
            document.getElementById('stopSending').disabled = false;
        } else {
            addLogMessage('[X] Email sending process aborted', 'warning');
            // Reset UI state since the process was aborted
            resetSendingButtons();
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
        // Re-enable button in case of error
        document.getElementById('stopSending').disabled = false;
    });
}

function resetSendingButtons() {
    document.getElementById('sendEmails').disabled = false;
    document.getElementById('stopSending').disabled = true;
    currentJobId = null;
}

// Terminal Log Functions
function addLogMessage(message, type) {
    const terminalLogs = document.getElementById('terminal-logs');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    const logContent = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    
    logEntry.innerHTML = logContent;
    terminalLogs.appendChild(logEntry);
    
    // Auto-scroll to bottom
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

function clearLogs() {
    const terminalLogs = document.getElementById('terminal-logs');
    terminalLogs.innerHTML = '';
    addLogMessage('[*] Terminal logs cleared', 'info');
}

// Socket.IO Event Handlers
function handleLogMessage(data) {
    addLogMessage(data.message, data.type);
}

// Track sending start time for ETA calculation
let sendingStartTime = null;
let lastSentCount = 0;
let sendingRateHistory = [];

function updateProgress(data) {
    const { sent, failed, remaining, total, activeSMTPs } = data;
    
    // Initialize start time if this is the first progress update
    if (sendingStartTime === null && sent > 0) {
        sendingStartTime = Date.now();
    }
    
    // Calculate percentage complete
    const percentComplete = total > 0 ? Math.round((sent + failed) / total * 100) : 0;
    
    // Calculate sending rate and ETA
    let etaText = 'Calculating...';
    let rateText = 'Calculating...';
    
    if (sendingStartTime && sent > 0) {
        // Calculate current sending rate
        const elapsedSeconds = (Date.now() - sendingStartTime) / 1000;
        const currentRate = sent / elapsedSeconds;
        
        // Track rate changes for more accurate ETA
        if (sent > lastSentCount) {
            const newSent = sent - lastSentCount;
            const timeSinceLastUpdate = elapsedSeconds;
            if (timeSinceLastUpdate > 0) {
                // Add to rate history (keep last 5 rates)
                sendingRateHistory.push(currentRate);
                if (sendingRateHistory.length > 5) {
                    sendingRateHistory.shift();
                }
            }
            lastSentCount = sent;
        }
        
        // Calculate average rate from history
        const avgRate = sendingRateHistory.length > 0 ? 
            sendingRateHistory.reduce((sum, rate) => sum + rate, 0) / sendingRateHistory.length : 
            currentRate;
        
        // Calculate ETA
        if (avgRate > 0 && remaining > 0) {
            const etaSeconds = Math.round(remaining / avgRate);
            if (etaSeconds < 60) {
                etaText = `${etaSeconds} sec`;
            } else if (etaSeconds < 3600) {
                etaText = `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`;
            } else {
                etaText = `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`;
            }
            rateText = `${avgRate.toFixed(1)}/sec`;
        }
    }
    
    // Create progress bar HTML
    const progressBarHtml = `
        <div class="progress-container">
            <div class="progress-bar" style="width: ${percentComplete}%">
                <span class="progress-text">${percentComplete}%</span>
            </div>
        </div>
    `;
    
    // Update status line with all information
    const statusLine = document.getElementById('status-line');
    statusLine.innerHTML = `
        [✓] Emails: ${sent}/${total} sent | Failed: ${failed} | Remaining: ${remaining} | Rate: ${rateText} | ETA: ${etaText} | SMTPs: ${activeSMTPs}
        ${progressBarHtml}
    `;
    
    // If all emails are processed, reset buttons and tracking variables
    if (sent + failed >= total) {
        resetSendingButtons();
        sendingStartTime = null;
        lastSentCount = 0;
        sendingRateHistory = [];
    }
}

// Template Management Functions
function showTemplateModal() {
    // Show the template modal
    const templateModal = new bootstrap.Modal(document.getElementById('templateModal'));
    templateModal.show();
    
    // Refresh the templates list
    renderTemplatesList();
}

function addTemplate() {
    const templateName = document.getElementById('templateName').value.trim();
    const templateContent = document.getElementById('templateContent').value.trim();
    
    if (!templateName) {
        addLogMessage('[!] Template name is required', 'error');
        return;
    }
    
    if (!templateContent) {
        addLogMessage('[!] Template content is required', 'error');
        return;
    }
    
    // Add the template to the array
    const template = {
        id: Date.now().toString(),
        name: templateName,
        content: templateContent
    };
    
    emailTemplates.push(template);
    
    // Save templates to localStorage
    saveTemplates();
    
    // Clear the form
    document.getElementById('templateName').value = '';
    document.getElementById('templateContent').value = '';
    
    // Refresh the templates list
    renderTemplatesList();
    
    // Update status line
    updateStatusLine();
    
    addLogMessage(`[✓] Template "${templateName}" added successfully`, 'success');
}

function deleteTemplate(id) {
    // Find the template index
    const index = emailTemplates.findIndex(template => template.id === id);
    
    if (index !== -1) {
        const templateName = emailTemplates[index].name;
        
        // Remove the template
        emailTemplates.splice(index, 1);
        
        // Save templates to localStorage
        saveTemplates();
        
        // Refresh the templates list
        renderTemplatesList();
        
        // Update status line
        updateStatusLine();
        
        addLogMessage(`[✓] Template "${templateName}" deleted successfully`, 'success');
    }
}

function renderTemplatesList() {
    const templatesList = document.getElementById('templatesList');
    
    if (emailTemplates.length === 0) {
        templatesList.innerHTML = '<div class="alert alert-secondary">No templates added yet.</div>';
        return;
    }
    
    let html = '';
    
    emailTemplates.forEach(template => {
        html += `
            <div class="card bg-dark mb-2">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="card-title mb-0">${template.name}</h6>
                        <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${template.id}')">Delete</button>
                    </div>
                    <hr class="my-2">
                    <pre class="card-text text-light" style="max-height: 100px; overflow-y: auto;">${template.content}</pre>
                </div>
            </div>
        `;
    });
    
    templatesList.innerHTML = html;
}

function saveTemplates() {
    localStorage.setItem('emailTemplates', JSON.stringify(emailTemplates));
}

function loadTemplates() {
    const templates = localStorage.getItem('emailTemplates');
    
    if (templates) {
        emailTemplates = JSON.parse(templates);
    }
}

function processTemplates(content) {
    // Check if content contains {template} placeholder
    if (content.includes('{template}')) {
        // Make sure we have templates
        if (emailTemplates.length === 0) {
            addLogMessage('[!] Warning: {template} found but no templates are available', 'warning');
            return content;
        }
        
        // Replace all instances of {template} with a random template
        let templateCount = 0;
        while (content.includes('{template}')) {
            // Get a random template for each occurrence
            const randomIndex = Math.floor(Math.random() * emailTemplates.length);
            const randomTemplate = emailTemplates[randomIndex];
            
            // Replace the first occurrence of {template}
            content = content.replace('{template}', randomTemplate.content);
            
            templateCount++;
        }
        
        addLogMessage(`[*] Replaced ${templateCount} {template} tags with random templates`, 'info');
    }
    
    return content;
}

function updateStatusLine() {
    // Get SMTP count from the SMTP list items instead of the old select dropdown
    const smtpList = document.getElementById('smtpList');
    const smtpItems = smtpList ? smtpList.querySelectorAll('.smtp-item') : [];
    const smtpCount = smtpItems.length;
    
    // Get selected SMTP count
    const selectedSmtps = getSelectedSmtps();
    const selectedCount = selectedSmtps.length;
    
    const emailCount = emailList.length;
    const templateCount = emailTemplates ? emailTemplates.length : 0;
    
    const statusLine = document.getElementById('status-line');
    if (statusLine) {
        statusLine.innerHTML = `[*] Ready to send emails | SMTPs: ${smtpCount} (${selectedCount} selected) | Emails: ${emailCount} | Templates: ${templateCount}`;
    }
}

// HTML File Upload Handler
function handleHtmlFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        addLogMessage('[!] No file selected', 'error');
        return;
    }
    
    // Check if file is HTML
    if (!file.type.match('text/html') && !file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
        addLogMessage('[!] Selected file is not HTML', 'error');
        event.target.value = ''; // Clear the file input
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const htmlContent = e.target.result;
        
        // Update the HTML textarea
        const emailBodyHtml = document.getElementById('emailBodyHtml');
        emailBodyHtml.value = htmlContent;
        
        // Update the preview if in preview mode
        if (currentViewMode === 'preview') {
            document.getElementById('emailBodyPreview').innerHTML = htmlContent;
        }
        
        // Show HTML view
        document.getElementById('viewHtmlBtn').click();
        
        addLogMessage(`[✓] HTML file "${file.name}" loaded successfully`, 'success');
    };
    
    reader.onerror = function() {
        addLogMessage('[!] Error reading the HTML file', 'error');
    };
    
    reader.readAsText(file);
    
    // Clear the file input for future uploads
    event.target.value = '';
}

// Helper Functions
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
