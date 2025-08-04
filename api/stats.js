const { authenticateHybrid, handleCors, errorResponse, successResponse } = require('./utils');
const { listObjects } = require('./r2-client');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Test endpoint
  if (req.method === 'GET' && req.url === '/stats/test') {
    return successResponse(res, { message: 'Stats API is working' }, 'Test successful');
  }

  // --- Get Storage Statistics (GET /api/stats/storage) ---
  if (req.method === 'GET' && req.url === '/stats/storage') {
    try {
      const { user, newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }

      const Bucket = process.env.R2_BUCKET_NAME;
      if (!Bucket) return errorResponse(res, 500, 'Server configuration error: Bucket name is missing.');

      let totalSize = 0;
      let totalFiles = 0;
      let fileTypes = {};
      let largestFiles = [];
      let nextToken = null;

      // Iterate through all objects to calculate total size
      do {
        const result = await listObjects({ 
          Bucket, 
          ContinuationToken: nextToken,
          MaxKeys: 1000 // Get more files per request for efficiency
        });

        if (result.Contents) {
          for (const obj of result.Contents) {
            totalSize += obj.Size;
            totalFiles++;

            // Track file types
            const ext = obj.Key.toLowerCase().split('.').pop();
            fileTypes[ext] = (fileTypes[ext] || 0) + 1;

            // Track largest files (keep top 10)
            largestFiles.push({
              key: obj.Key,
              size: obj.Size,
              lastModified: obj.LastModified
            });
          }
        }

        nextToken = result.NextContinuationToken;
      } while (nextToken);

      // Sort and limit largest files to top 10
      largestFiles.sort((a, b) => b.size - a.size);
      largestFiles = largestFiles.slice(0, 10);

      // Calculate limits and usage percentages
      const freeTierLimits = {
        storage: 10 * 1024 * 1024 * 1024, // 10 GB in bytes
        requests: 100000, // 100k requests per month (we can't track this from R2 directly)
        bandwidth: 100 * 1024 * 1024 * 1024 // 100 GB in bytes (we can't track this from R2 directly)
      };

      const storageUsagePercent = (totalSize / freeTierLimits.storage) * 100;

      const stats = {
        storage: {
          totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          totalFiles,
          freeTierLimit: freeTierLimits.storage,
          freeTierLimitFormatted: formatBytes(freeTierLimits.storage),
          usagePercent: Math.round(storageUsagePercent * 100) / 100,
          remainingSize: freeTierLimits.storage - totalSize,
          remainingSizeFormatted: formatBytes(freeTierLimits.storage - totalSize),
          isNearLimit: storageUsagePercent > 80,
          isOverLimit: storageUsagePercent > 100
        },
        fileTypes,
        largestFiles: largestFiles.map(file => ({
          ...file,
          sizeFormatted: formatBytes(file.size)
        })),
        lastUpdated: new Date().toISOString(),
        note: "Traffic and request statistics are not available through R2 API. Please check your Cloudflare dashboard for complete usage metrics."
      };

      return successResponse(res, stats, 'Storage statistics retrieved successfully');

    } catch (error) {
      console.error('Stats error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) {
        return errorResponse(res, 401, error.message);
      }
      return errorResponse(res, 500, 'Failed to retrieve statistics', error.message);
    }
  }

  // --- Get Quick Stats (GET /api/stats/quick) ---
  if (req.method === 'GET' && req.url === '/stats/quick') {
    try {
      const { user, newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }

      const Bucket = process.env.R2_BUCKET_NAME;
      if (!Bucket) return errorResponse(res, 500, 'Server configuration error: Bucket name is missing.');

      // Get first 1000 files to give a quick estimate
      const result = await listObjects({ 
        Bucket, 
        MaxKeys: 1000 
      });

      let totalSize = 0;
      let totalFiles = 0;

      if (result.Contents) {
        for (const obj of result.Contents) {
          totalSize += obj.Size;
          totalFiles++;
        }
      }

      const freeTierLimit = 10 * 1024 * 1024 * 1024; // 10 GB
      const usagePercent = (totalSize / freeTierLimit) * 100;

      const quickStats = {
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        totalFiles,
        usagePercent: Math.round(usagePercent * 100) / 100,
        isEstimate: result.IsTruncated || false,
        estimateNote: result.IsTruncated ? "This is an estimate based on first 1000 files. Use /stats/storage for complete data." : null,
        lastUpdated: new Date().toISOString()
      };

      return successResponse(res, quickStats, 'Quick statistics retrieved successfully');

    } catch (error) {
      console.error('Quick stats error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) {
        return errorResponse(res, 401, error.message);
      }
      return errorResponse(res, 500, 'Failed to retrieve quick statistics', error.message);
    }
  }

  return errorResponse(res, 404, 'Not found');
};

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
