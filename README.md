# Inderman Mailer

A Node.js/Express/EJS web application with Socket.IO + AJAX for bulk email delivery with a Kali Linux terminal theme.

## Features

- **Hacker Terminal UI**: Dark theme with green/cyan text, monospace font, and interactive terminal logs.
- **Dynamic Email Tokens**: Support for random tokens in subject lines and email body.
- **Email List Management**: Paste emails, upload .txt files, and manage emails in an editable table.
- **SMTP Rotation**: Automatically rotate through multiple SMTP servers for better deliverability.
- **Real-time Logging**: Terminal-style logs with color-coded status messages.
- **Error Handling**: Auto-disable failing SMTP servers after 3 failures and retry with next available server.

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/inderman_mailer.git
cd inderman_mailer
```

2. Install dependencies:
```
npm install
```

3. Start the application:
```
node app.js
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### 1. Configure SMTP Servers

Add your SMTP servers in the format:
```
host|port|username|password
```

Example:
```
smtp.gmail.com|587|your-email@gmail.com|your-password
```

### 2. Add Email Recipients

You can add email recipients in three ways:
- Paste emails in the textarea (one per line)
- Upload a .txt file with emails (one per line)
- Add emails individually using the "Add Email" button

### 3. Compose Your Email

- Enter your sender name
- Write your subject line (with optional tokens)
- Compose your email body using the rich text editor

#### Available Tokens:
- `{n:5}` - Random 5-digit number (e.g., 72941)
- `{nw:8}` - Random 8-character alphanumeric string (e.g., x9F4q2Wz)

### 4. Send Emails

1. Select one or more SMTP servers from the dropdown
2. Click the "SEND" button to start the email sending process
3. Monitor the progress in the terminal logs
4. Click "STOP" if you need to abort the process

## Technical Details

- **Backend**: Node.js/Express, EJS, Nodemailer
- **Frontend**: EJS templates, Socket.IO, AJAX, Bootstrap
- **Real-time**: Socket.IO for logs and progress updates
- **Email Sending**: Nodemailer with SMTP rotation and retry logic

## Security Notes

- SMTP passwords are stored in plaintext in the `smtp.json` file
- For production use, consider implementing proper encryption for sensitive data
- This application is designed for legitimate bulk email sending, not for spamming

## License

MIT
