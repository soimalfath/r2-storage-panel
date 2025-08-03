// Simple stats handler for testing
module.exports = async function handler(req, res) {
  console.log(`[STATS Handler] Method: ${req.method}, URL: ${req.url}`);
  
  // Test endpoint
  if (req.method === 'GET' && (req.url === '/test' || req.url === '/stats/test')) {
    console.log('[STATS Handler] Test endpoint matched');
    return res.json({ 
      success: true, 
      data: { message: 'Stats API is working' }, 
      message: 'Test successful' 
    });
  }

  console.log('[STATS Handler] No route matched');
  return res.status(404).json({ 
    success: false, 
    error: 'Not found', 
    message: 'Endpoint not found' 
  });
};
