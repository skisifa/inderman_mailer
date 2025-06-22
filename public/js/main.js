// Connect to Socket.IO server
const socket = io();

// Global variables
let emailList = [];
let currentJobId = null;
let currentViewMode = 'preview'; // 'preview' or 'html'
let emailTemplates = []; // Store email templates

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize HTML editor and preview
    const emailBodyHtml = document.getElementById('emailBodyHtml');
    const emailBodyPreview = document.getElementById('emailBodyPreview');
    
    // Set initial content
    emailBodyHtml.value = '<p>Enter your email content here...</p>';
    emailBodyPreview.innerHTML = emailBodyHtml.value;
    
    // Set up view toggle buttons
    document.getElementById('viewHtmlBtn').addEventListener('click', () => {
        currentViewMode = 'html';
        emailBodyHtml.style.display = 'block';
        emailBodyPreview.style.display = 'none';
        document.getElementById('viewHtmlBtn').classList.add('active');
        document.getElementById('viewPreviewBtn').classList.remove('active');
    });
    
    document.getElementById('viewPreviewBtn').addEventListener('click', () => {
        currentViewMode = 'preview';
        emailBodyHtml.style.display = 'none';
        emailBodyPreview.style.display = 'block';
        emailBodyPreview.innerHTML = emailBodyHtml.value; // Update preview with current HTML
        document.getElementById('viewPreviewBtn').classList.add('active');
        document.getElementById('viewHtmlBtn').classList.remove('active');
    });
    
    // Set up HTML textarea to update preview on change
    emailBodyHtml.addEventListener('input', () => {
        if (currentViewMode === 'preview') {
            emailBodyPreview.innerHTML = emailBodyHtml.value;
        }
    });
    
    // Set up HTML file upload
    document.getElementById('htmlFileUpload').addEventListener('change', handleHtmlFileUpload);
    
    // Set up template management
    document.getElementById('manageTemplatesBtn').addEventListener('click', showTemplateModal);
    document.getElementById('addTemplateBtn').addEventListener('click', addTemplate);
    
    // Load templates from localStorage
    loadTemplates();

    // Initialize Bootstrap modal
    const emailModal = new bootstrap.Modal(document.getElementById('emailModal'));

    // Event listeners
    document.getElementById('addSmtp').addEventListener('click', addSmtpConfig);
    document.getElementById('deleteSmtp').addEventListener('click', deleteSmtpConfig);
    document.getElementById('parseEmails').addEventListener('click', parseEmailsFromTextarea);
    document.getElementById('uploadEmails').addEventListener('click', uploadEmailFile);
    document.getElementById('addEmailBtn').addEventListener('click', showAddEmailModal);
    document.getElementById('clearEmails').addEventListener('click', clearEmails);
    document.getElementById('sendEmails').addEventListener('click', startSending);
    document.getElementById('stopSending').addEventListener('click', stopSending);
    document.getElementById('clearLogs').addEventListener('click', clearLogs);
    
    // Set preview as default view
    document.getElementById('viewPreviewBtn').classList.add('active');
    document.getElementById('saveEmail').addEventListener('click', saveEmail);

    // Socket.IO event listeners
    socket.on('log', handleLogMessage);
    socket.on('progress', updateProgress);

    // Add a welcome message to the terminal
    addLogMessage('[*] Inderman Mailer initialized and ready', 'info');
    addLogMessage('[*] Add SMTP configurations and email list to begin', 'info');
});

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
        body: JSON.stringify({ smtpString })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            addLogMessage(`[!] Error: ${data.error}`, 'error');
        } else {
            addLogMessage(`[✓] SMTP added: ${parts[0]}:${parts[1]} | ${parts[2]}`, 'success');
            document.getElementById('smtpConfig').value = '';
            
            // Add to select dropdown
            const option = document.createElement('option');
            option.value = data.id;
            option.textContent = `${data.host}:${data.port} | ${data.user}`;
            document.getElementById('smtpSelect').appendChild(option);
            
            updateStatusLine();
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
    });
}

function deleteSmtpConfig() {
    const smtpSelect = document.getElementById('smtpSelect');
    const selectedOptions = Array.from(smtpSelect.selectedOptions);
    
    if (selectedOptions.length === 0) {
        addLogMessage('[!] No SMTP selected for deletion', 'error');
        return;
    }
    
    const deletePromises = selectedOptions.map(option => {
        const id = option.value;
        return fetch(`/api/smtp/${id}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                smtpSelect.removeChild(option);
                return true;
            } else {
                addLogMessage(`[!] Error deleting SMTP: ${data.error}`, 'error');
                return false;
            }
        });
    });
    
    Promise.all(deletePromises)
        .then(results => {
            const successCount = results.filter(result => result).length;
            addLogMessage(`[✓] ${successCount} SMTP configuration(s) deleted`, 'success');
            updateStatusLine();
        })
        .catch(error => {
            addLogMessage(`[!] Error: ${error.message}`, 'error');
        });
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
        
        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;
        
        const tdEmail = document.createElement('td');
        tdEmail.textContent = email;
        
        const tdActions = document.createElement('td');
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline-warning btn-sm me-2';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => showEditEmailModal(index));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteEmail(index));
        
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
function startSending() {
    const senderName = document.getElementById('senderName').value.trim();
    const subject = document.getElementById('subject').value.trim();
    let emailBodyHtml = document.getElementById('emailBodyHtml').value.trim();
    const smtpSelect = document.getElementById('smtpSelect');
    
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
    
    // Process template placeholders
    emailBodyHtml = processTemplates(emailBodyHtml);
    
    if (emailList.length === 0) {
        addLogMessage('[!] Email list is empty', 'error');
        return;
    }
    
    if (smtpSelect.selectedOptions.length === 0) {
        addLogMessage('[!] No SMTP servers selected', 'error');
        return;
    }
    
    // Disable send button and enable stop button
    document.getElementById('sendEmails').disabled = true;
    document.getElementById('stopSending').disabled = false;
    
    // Send request to start sending
    fetch('/api/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            senderName,
            subject,
            emailBody: emailBodyHtml,
            emails: emailList,
            selectedSmtpIds: Array.from(smtpSelect.selectedOptions).map(option => option.value)
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
        } else {
            addLogMessage('[*] Stop signal sent. Waiting for current email to complete...', 'warning');
        }
    })
    .catch(error => {
        addLogMessage(`[!] Error: ${error.message}`, 'error');
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
        while (content.includes('{template}')) {
            // Get a random template
            // console.log(emailTemplates);
            
            const randomIndex = Math.floor(Math.random() * emailTemplates.length);
            const randomTemplate = emailTemplates[randomIndex];
            
            // Replace the first occurrence of {template}
            content = content.replace('{template}', randomTemplate.content);
            
            addLogMessage(`[*] Replaced {template} with "${randomTemplate.name}"`, 'info');
        }
    }
    
    return content;
}

function updateStatusLine() {
    const smtpCount = document.getElementById('smtpSelect').options.length;
    const emailCount = emailList.length;
    const templateCount = emailTemplates.length;
    
    const statusLine = document.getElementById('status-line');
    statusLine.innerHTML = `[*] Ready to send emails | SMTPs: ${smtpCount} | Emails: ${emailCount} | Templates: ${templateCount}`;
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
