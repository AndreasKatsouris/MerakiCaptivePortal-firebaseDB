/**
 * Food Cost Module - Simple HTTP Server for Tests
 * This server allows running tests without CORS issues
 * Run with: node test-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Port to run the server on
const PORT = 8080;

// Map of file extensions to MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf'
};

// Create a simple HTTP server
const server = http.createServer((req, res) => {
    console.log(`Request: ${req.method} ${req.url}`);
    
    // Handle default route
    let filePath = req.url === '/' 
        ? path.join(__dirname, 'run-enhanced-tests.html')
        : path.join(process.cwd(), req.url);
    
    // Convert URL paths to file system paths
    filePath = filePath.replace(/\//g, path.sep);
    
    // Get file extension
    const extname = path.extname(filePath);
    
    // Default content type
    let contentType = MIME_TYPES[extname] || 'text/plain';
    
    // Read file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found
                console.error(`File not found: ${filePath}`);
                res.writeHead(404);
                res.end('404 - File Not Found');
            } else {
                // Server error
                console.error(`Server error: ${err.code}`);
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`
======================================================
    Food Cost Module Test Server
======================================================
    
    Server running at http://localhost:${PORT}/
    
    Test pages:
    - Enhanced Tests: http://localhost:${PORT}/tests/run-enhanced-tests.html
    - Basic Tests: http://localhost:${PORT}/tests/run-tests.html
    
    Press Ctrl+C to stop the server
======================================================
`);
});
