const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Manual API routing handler
app.use('/r2', (req, res, next) => {
  // Proxy /r2/* to /api/r2/* for local dev parity with Vercel rewrites
  req.url = '/r2' + req.url;
  return require('./api/r2')(req, res);
});

app.use('/api', async (req, res, next) => {
  const path = req.path;
  const method = req.method;

  // Special: /api/apikey direct handler
  if (path === '/apikey') {
    const apikeyHandler = require('./api/apikey');
    return await apikeyHandler(req, res);
  }

  try {
    if (path.startsWith('/auth/') || path === '/auth') {
      const authHandler = require('./api/auth');
      return await authHandler(req, res);
    }
    
    if (path.startsWith('/r2/') || path === '/r2') {
      const r2Handler = require('./api/r2');
      return await r2Handler(req, res);
    }
    
    if (path === '/upload-multiple') {
      const uploadMultipleHandler = require('./api/upload-multiple');
      return await uploadMultipleHandler(req, res);
    }
    
    if (path === '/convert-existing') {
      const convertExistingHandler = require('./api/convert-existing');
      return await convertExistingHandler(req, res);
    }
    
    if (path === '/upload') {
      const uploadHandler = require('./api/upload');
      return await uploadHandler(req, res);
    }
    
    if (path.startsWith('/files')) {
      const filesHandler = require('./api/files');
      return await filesHandler(req, res);
    }
    
    if (path === '/info') {
      const infoHandler = require('./api/info');
      return await infoHandler(req, res);
    }
    
    if (path.startsWith('/stats')) {
      const statsHandler = require('./api/stats');
      return await statsHandler(req, res);
    }
    
    // Default 404 for API routes
    res.status(404).json({ error: 'API endpoint not found' });
    
  } catch (error) {
    console.error('API handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Auth routes without /api prefix
app.use('/auth', async (req, res, next) => {
  try {
    const authHandler = require('./api/auth');
    return await authHandler(req, res);
  } catch (error) {
    console.error('Auth handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Serve test files for testing


app.get('/api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'api-docs.html'));
});


app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


app.get('/webp-converter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'webp-converter.html'));
});

app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

// Fallback to serve index.html for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
