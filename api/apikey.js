// Endpoint: /api/apikey
// Returns the configured API key ONLY to an authenticated admin session (JWT).
// This value is sensitive: it grants upload/delete access to the bucket.
// It must never be exposed publicly or with a wildcard CORS policy.

const { authenticateToken, handleCors, errorResponse } = require('./utils');

module.exports = async (req, res) => {
  // Credentialed CORS (reflects request origin, allows cookies). Never wildcard.
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'Method Not Allowed');
  }

  // Require a valid admin session. Without this, the API key would leak.
  try {
    authenticateToken(req);
  } catch (err) {
    return errorResponse(res, 401, 'Unauthorized', 'Valid admin session required');
  }

  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    return errorResponse(res, 404, 'API key not configured');
  }

  return res.status(200).json({ apiKey });
};
