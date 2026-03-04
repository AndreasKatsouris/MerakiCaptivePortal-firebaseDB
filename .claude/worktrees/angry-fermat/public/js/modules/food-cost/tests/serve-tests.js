/**
 * Food Cost Module - Test Server
 * Version: 1.9.4-2025-04-19
 * 
 * Simple HTTP server to serve the test runner page with proper MIME types.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// MIME types mapping
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Create a server
const server = http.createServer((req, res) => {
    console.log(`Request: ${req.url}`);
    
    // Parse URL
    const parsedUrl = url.parse(req.url);
    
    // Extract path
    let pathname = `.${parsedUrl.pathname}`;
    
    // Map / to run-tests.html
    if (pathname === './') {
        pathname = './run-tests.html';
    }
    
    // Set the base directory
    const baseDir = path.resolve(__dirname);
    
    // Resolve the absolute path
    let filePath;
    if (pathname.startsWith('./..')) {
        // Handle paths to parent directories (e.g., ../components/...)
        filePath = path.join(path.dirname(baseDir), pathname.substring(3));
    } else {
        // Handle paths within the current directory (e.g., ./run-tests.html)
        filePath = path.join(baseDir, pathname.substring(2));
    }
    
    console.log(`Serving: ${filePath}`);
    
    // Get the file extension
    const ext = path.extname(filePath);
    
    // Get the MIME type
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Read the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found
                console.error(`File not found: ${filePath}`);
                res.writeHead(404);
                res.end('File not found');
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

// Define the port
const PORT = 3000;

// Start the server
server.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}/`);
    console.log(`Open http://localhost:${PORT}/ in your browser to run the tests`);
});
