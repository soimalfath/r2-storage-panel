const { authenticateHybrid, handleCors, errorResponse, successResponse, setCookie } = require('./utils');
const { resolveClientAndBucket, listObjects, putObject, headObject, deleteObject, getPresignedUrl } = require('./r2-client');
const formidable = require('formidable');

function getKey(req) {
  if (req.query?.key) return req.query.key;
  if (req.url?.match(/\/([^/]+)$/)) return decodeURIComponent(req.url.match(/\/([^/]+)$/)[1]);
  return null;
}

function getContentTypeFromKey(key) {
  const ext = key.toLowerCase().split('.').pop();
  const m = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',pdf:'application/pdf',txt:'text/plain',json:'application/json',zip:'application/zip' };
  return m[ext] || 'application/octet-stream';
}

function getFileType(contentType) {
  if (!contentType) return 'doc';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (['application/zip','application/vnd.rar','application/x-7z-compressed','application/x-tar','application/gzip'].includes(contentType)) return 'archive';
  return 'doc';
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  let ctx;
  try {
    ctx = await resolveClientAndBucket(req);
  } catch (err) {
    return errorResponse(res, 400, err.message);
  }
  const { client, bucketName, publicUrl: baseUrl } = ctx;

  // GET /api/files
  if (req.method === 'GET' && req.url.startsWith('/files')) {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const { token, prefix, limit, search, type } = req.query;
      const result = await listObjects(client, { Bucket: bucketName, ContinuationToken: token || undefined, Prefix: typeof prefix === 'string' ? prefix : undefined, MaxKeys: parseInt(limit, 10) || 100 });

      let files = await Promise.all((result.Contents || []).map(async obj => {
        const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${obj.Key}` : null;
        let presignedUrl = null;
        try { presignedUrl = await getPresignedUrl(client, { Bucket: bucketName, Key: obj.Key, expiresIn: 3600 }); } catch (e) {}
        return { key: obj.Key, filename: obj.Key, size: obj.Size, lastModified: obj.LastModified, contentType: getContentTypeFromKey(obj.Key), publicUrl, presignedUrl, downloadUrl: `/r2/download/${encodeURIComponent(obj.Key)}` };
      }));

      if (search) files = files.filter(f => f.key.toLowerCase().includes(search.toLowerCase()));
      if (type && type !== 'all') files = files.filter(f => getFileType(f.contentType) === type);

      return successResponse(res, { files, pagination: { nextToken: result.NextContinuationToken || null, isTruncated: result.IsTruncated || false, count: files.length } });
    } catch (error) {
      console.error('API List files error:', error);
      if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to list files', error.message);
    }
  }

  // POST /api/files/upload
  if (req.method === 'POST' && req.url === '/files/upload') {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const form = new formidable.IncomingForm({ maxFileSize: 25 * 1024 * 1024, maxFiles: 1 });
      const [, files] = await form.parse(req);
      if (!files.file?.length) return errorResponse(res, 400, 'No file uploaded');
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file.size) return errorResponse(res, 400, 'Empty file uploaded');

      const fs = require('fs');
      const originalName = file.originalFilename || 'unknown';
      const filename = `${Date.now()}-${originalName}`;
      const fileBuffer = fs.readFileSync(file.filepath);
      await putObject(client, { Bucket: bucketName, Key: filename, Body: fileBuffer, ContentType: file.mimetype || 'application/octet-stream' });
      const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${filename}` : null;
      return successResponse(res, { filename, key: filename, size: file.size, contentType: file.mimetype, url, downloadUrl: `/r2/download/${filename}` });
    } catch (error) {
      console.error('API Upload error:', error);
      if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Upload failed', error.message);
    }
  }

  // POST /api/files/upload-webp
  if (req.method === 'POST' && req.url === '/files/upload-webp') {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const form = new formidable.IncomingForm({ maxFileSize: 10 * 1024 * 1024, maxFiles: 1 });
      const [fields, files] = await form.parse(req);
      if (!files.image?.length) return errorResponse(res, 400, 'No image uploaded');
      const file = Array.isArray(files.image) ? files.image[0] : files.image;
      if (!file.size) return errorResponse(res, 400, 'Empty file uploaded');
      if (!file.mimetype?.startsWith('image/')) return errorResponse(res, 400, 'Only image files allowed');

      const fs = require('fs');
      const sharp = require('sharp');
      const originalName = file.originalFilename || 'unknown';
      const quality = parseInt(fields.quality?.[0] || fields.quality || 80, 10);
      let fileBuffer = fs.readFileSync(file.filepath);
      let fileName = originalName;
      let wasConverted = false;

      if (file.mimetype !== 'image/webp') {
        fileBuffer = await sharp(fileBuffer).webp({ quality }).toBuffer();
        wasConverted = true;
        const base = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        fileName = `${base}.webp`;
      }

      const uniqueKey = `webp/${Date.now()}-${fileName}`;
      await putObject(client, { Bucket: bucketName, Key: uniqueKey, Body: fileBuffer, ContentType: 'image/webp' });
      const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${uniqueKey}` : null;
      return successResponse(res, { filename: uniqueKey, key: uniqueKey, originalName, convertedName: fileName, size: fileBuffer.length, contentType: 'image/webp', url, downloadUrl: `/r2/download/${uniqueKey}`, wasConverted, originalFormat: file.mimetype, uploadedAt: new Date().toISOString() }, 'Image uploaded and converted successfully');
    } catch (error) {
      console.error('API WebP Upload error:', error);
      if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'WebP upload failed', error.message);
    }
  }

  // DELETE /api/files/:key
  if (req.method === 'DELETE' && req.url.startsWith('/files/')) {
    try {
      const { newAccessToken } = authenticateHybrid(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const key = getKey(req);
      if (!key) return errorResponse(res, 400, 'File key is required');
      try { await headObject(client, { Bucket: bucketName, Key: key }); } catch (err) {
        if (err.name === 'NotFound') return errorResponse(res, 404, 'File not found');
        throw err;
      }
      await deleteObject(client, { Bucket: bucketName, Key: key });
      return successResponse(res, { message: 'File deleted successfully', key });
    } catch (error) {
      console.error('API Delete error:', error);
      if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to delete file', error.message);
    }
  }

  return errorResponse(res, 404, 'Not found');
};
