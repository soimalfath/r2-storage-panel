const { authenticateHybrid, handleCors, errorResponse, successResponse, setCookie } = require('./utils');
const { resolveClientAndBucket, listObjects } = require('./r2-client');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024, sizes = ['Bytes','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET' && req.url === '/stats/test') {
    return successResponse(res, { message: 'Stats API is working' }, 'Test successful');
  }

  let ctx;
  try {
    ctx = await resolveClientAndBucket(req);
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
  const { client, bucketName } = ctx;

  // GET /api/stats/storage
  if (req.method === 'GET' && req.url === '/stats/storage') {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      let totalSize = 0, totalFiles = 0, fileTypes = {}, largestFiles = [], nextToken = null;
      do {
        const result = await listObjects(client, { Bucket: bucketName, ContinuationToken: nextToken, MaxKeys: 1000 });
        for (const obj of result.Contents || []) {
          totalSize += obj.Size; totalFiles++;
          const ext = obj.Key.toLowerCase().split('.').pop();
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
          largestFiles.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
        }
        nextToken = result.NextContinuationToken;
      } while (nextToken);

      largestFiles.sort((a, b) => b.size - a.size);
      largestFiles = largestFiles.slice(0, 10).map(f => ({ ...f, sizeFormatted: formatBytes(f.size) }));

      const freeTierLimit = 10 * 1024 * 1024 * 1024;
      const usagePercent = (totalSize / freeTierLimit) * 100;

      return successResponse(res, {
        storage: { totalSize, totalSizeFormatted: formatBytes(totalSize), totalFiles, freeTierLimit, freeTierLimitFormatted: formatBytes(freeTierLimit), usagePercent: Math.round(usagePercent * 100) / 100, remainingSize: freeTierLimit - totalSize, remainingSizeFormatted: formatBytes(freeTierLimit - totalSize), isNearLimit: usagePercent > 80, isOverLimit: usagePercent > 100 },
        fileTypes, largestFiles, lastUpdated: new Date().toISOString(),
        note: 'Traffic and request statistics are not available through R2 API.'
      }, 'Storage statistics retrieved successfully');
    } catch (error) {
      console.error('Stats error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to retrieve statistics', error.message);
    }
  }

  // GET /api/stats/quick
  if (req.method === 'GET' && req.url === '/stats/quick') {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const result = await listObjects(client, { Bucket: bucketName, MaxKeys: 1000 });
      let totalSize = 0, totalFiles = 0;
      for (const obj of result.Contents || []) { totalSize += obj.Size; totalFiles++; }

      const freeTierLimit = 10 * 1024 * 1024 * 1024;
      return successResponse(res, { totalSize, totalSizeFormatted: formatBytes(totalSize), totalFiles, usagePercent: Math.round((totalSize / freeTierLimit) * 10000) / 100, isEstimate: result.IsTruncated || false, lastUpdated: new Date().toISOString() }, 'Quick statistics retrieved successfully');
    } catch (error) {
      console.error('Quick stats error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to retrieve quick statistics', error.message);
    }
  }

  return errorResponse(res, 404, 'Not found');
};
