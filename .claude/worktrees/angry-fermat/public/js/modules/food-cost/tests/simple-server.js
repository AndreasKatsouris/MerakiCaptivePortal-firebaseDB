// Simple HTTP server for testing components
const http = require('http');
const fs = require('fs');
const path = require('path');

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css'
};

// Create the server
http.createServer((req, res) => {
    // Parse the URL
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './run-tests.html';
    }
    
    // Get the file extension
    const extname = path.extname(filePath);
    let contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // Handle paths that go up to parent directories
    if (filePath.includes('..')) {
        const parts = filePath.split('/');
        const correctedPath = parts
            .filter(part => part !== '.' && part !== '')
            .join('/');
        
        filePath = '../' + correctedPath;
    }
    
    // Read the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.error(`File not found: ${filePath}`);
                res.writeHead(404);
                res.end('File not found');
            } else {
                console.error(`Server error: ${err.code}`);
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(3000);

console.log('Test server running at http://localhost:3000/');
console.log('Open this URL in your browser to run the component tests');
