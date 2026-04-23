const formidable = require('formidable');
const { authenticateToken, handleCors, errorResponse, successResponse, setCookie } = require('./utils');
const { resolveClientAndBucket, putObject, listObjects, headObject, getObject, deleteObject, getPresignedUrl } = require('./r2-client');

function getKey(req) {
  if (req.query && req.query.key) return req.query.key;
  if (req.url && req.url.match(/\/([^/]+)$/)) return decodeURIComponent(req.url.match(/\/([^/]+)$/)[1]);
  return null;
}

const MIME_MAP = {
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',ico:'image/x-icon',
  mp4:'video/mp4',avi:'video/x-msvideo',mov:'video/quicktime',wmv:'video/x-ms-wmv',flv:'video/x-flv',webm:'video/webm',mkv:'video/x-matroska',
  mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',flac:'audio/flac',m4a:'audio/mp4',
  pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt:'text/plain',html:'text/html',css:'text/css',js:'application/javascript',json:'application/json',xml:'application/xml',csv:'text/csv',
  zip:'application/zip',rar:'application/vnd.rar','7z':'application/x-7z-compressed',tar:'application/x-tar',gz:'application/gzip',
};

function mimeFromKey(key) {
  return MIME_MAP[key.toLowerCase().split('.').pop()] || 'application/octet-stream';
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

  // --- Upload (POST /r2/upload) ---
  if (req.method === 'POST' && req.url === '/r2/upload') {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const form = new formidable.IncomingForm({ maxFileSize: 25 * 1024 * 1024, maxFiles: 1 });
      const [fields, files] = await form.parse(req);
      if (!files.file?.length) return errorResponse(res, 400, 'No file uploaded');
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file.size) return errorResponse(res, 400, 'Empty file uploaded');

      const fs = require('fs');
      const originalName = file.originalFilename || 'unknown';
      let fileBuffer = fs.readFileSync(file.filepath);
      let contentType = file.mimetype || 'application/octet-stream';
      let filename = originalName;

      if (contentType.startsWith('image/') && !['webp','svg','gif'].some(t => contentType.includes(t))) {
        try {
          const sharp = require('sharp');
          fileBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
          contentType = 'image/webp';
          const base = originalName.split('.').slice(0, -1).join('.') || originalName;
          filename = `${base}.webp`;
        } catch (e) { console.error('Auto-convert failed:', e); }
      }

      await putObject(client, { Bucket: bucketName, Key: filename, Body: fileBuffer, ContentType: contentType });
      const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${filename}` : null;
      return successResponse(res, { file: { filename, key: filename, size: file.size, contentType, url, downloadUrl: `/r2/download/${filename}` } }, 'File uploaded successfully');
    } catch (error) {
      console.error('R2 Upload error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Upload failed', error.message);
    }
  }

  // --- Upload WebP (POST /r2/upload-webp) ---
  if (req.method === 'POST' && req.url === '/r2/upload-webp') {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
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
      let wasConverted = false;
      let fileName = originalName;

      if (file.mimetype !== 'image/webp') {
        fileBuffer = await sharp(fileBuffer).webp({ quality }).toBuffer();
        wasConverted = true;
        const base = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
        fileName = `${base}.webp`;
      }

      const uniqueKey = `webp/${Date.now()}-${fileName}`;
      await putObject(client, { Bucket: bucketName, Key: uniqueKey, Body: fileBuffer, ContentType: 'image/webp' });
      const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${uniqueKey}` : null;
      return successResponse(res, { file: { key: uniqueKey, filename: uniqueKey, originalName, convertedName: fileName, size: fileBuffer.length, originalSize: file.size, contentType: 'image/webp', url, downloadUrl: `/r2/download/${uniqueKey}`, wasConverted, originalFormat: file.mimetype, uploadedAt: new Date().toISOString() } }, 'Image uploaded and converted successfully');
    } catch (error) {
      console.error('R2 WebP Upload error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'WebP upload failed', error.message);
    }
  }

  // --- List files (GET /r2/files) ---
  if (req.method === 'GET' && req.url.startsWith('/r2/files')) {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const { token, prefix, limit } = req.query;
      const result = await listObjects(client, { Bucket: bucketName, ContinuationToken: token || undefined, Prefix: prefix || '', MaxKeys: parseInt(limit, 10) || 100 });
      const files = await Promise.all((result.Contents || []).map(async obj => {
        const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${obj.Key}` : null;
        let presignedUrl = null;
        try { presignedUrl = await getPresignedUrl(client, { Bucket: bucketName, Key: obj.Key, expiresIn: 3600 }); } catch (e) {}
        return { key: obj.Key, filename: obj.Key, size: obj.Size, lastModified: obj.LastModified, contentType: mimeFromKey(obj.Key), url, presignedUrl, downloadUrl: `/r2/download/${encodeURIComponent(obj.Key)}` };
      }));
      return successResponse(res, { files, pagination: { nextToken: result.NextContinuationToken || null, isTruncated: result.IsTruncated || false, count: files.length } });
    } catch (error) {
      console.error('R2 List error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to list files', error.message);
    }
  }

  // --- Download (GET /r2/download/:key) ---
  if (req.method === 'GET' && req.url.startsWith('/r2/download/')) {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const { parse } = require('url');
      const { pathname, query } = parse(req.url, true);
      const key = decodeURIComponent(query.key || pathname.replace('/r2/download/', ''));
      if (!key) return errorResponse(res, 400, 'File key is required');

      const headResult = await headObject(client, { Bucket: bucketName, Key: key });
      const result = await getObject(client, { Bucket: bucketName, Key: key });
      const originalName = key.includes('-') ? key.substring(key.indexOf('-') + 1) : key;

      res.setHeader('Content-Type', headResult.ContentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
      if (headResult.ContentLength) res.setHeader('Content-Length', headResult.ContentLength);

      if (result.Body && typeof result.Body.pipe === 'function') {
        result.Body.on('error', () => { if (!res.headersSent) res.status(500).end(); });
        return result.Body.pipe(res);
      }
      const chunks = [];
      for await (const chunk of result.Body) chunks.push(chunk);
      return res.end(Buffer.concat(chunks));
    } catch (error) {
      console.error('R2 Download error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      if (error.name === 'NoSuchKey') return errorResponse(res, 404, 'File not found');
      return errorResponse(res, 500, 'Failed to download file', error.message);
    }
  }

  // --- Delete (DELETE /r2/files/:key) ---
  if (req.method === 'DELETE' && req.url.startsWith('/r2/files/')) {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const key = getKey(req);
      if (!key) return errorResponse(res, 400, 'File key is required');
      try { await headObject(client, { Bucket: bucketName, Key: key }); } catch (err) {
        if (err.name === 'NotFound') return errorResponse(res, 404, 'File not found');
        throw err;
      }
      await deleteObject(client, { Bucket: bucketName, Key: key });
      return res.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('R2 Delete error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to delete file', error.message);
    }
  }

  // --- Presigned URL (GET /r2/presigned/:key) ---
  if (req.method === 'GET' && req.url.startsWith('/r2/presigned/')) {
    try {
      const { newAccessToken } = require('./utils').authenticateToken(req);
      if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

      const key = getKey(req);
      if (!key) return errorResponse(res, 400, 'File key is required');
      await headObject(client, { Bucket: bucketName, Key: key });
      const expiresIn = parseInt(req.query?.expires, 10) || 3600;
      const url = await getPresignedUrl(client, { Bucket: bucketName, Key: key, expiresIn });
      return successResponse(res, { url, expiresIn });
    } catch (error) {
      console.error('R2 Presigned error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to generate presigned URL', error.message);
    }
  }

  return errorResponse(res, 404, 'Not found');
};
