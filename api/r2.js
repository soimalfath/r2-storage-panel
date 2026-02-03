const formidable = require('formidable');
const { authenticateToken, handleCors, errorResponse, successResponse, setCookie } = require('./utils');
// Only allow JWT session authentication for this endpoint
function authenticateJwtOnly(req) {
  return authenticateToken(req);
}
const { putObject, listObjects, headObject, getObject, deleteObject, getPresignedUrl } = require('./r2-client');

// Helper: get key from req
function getKey(req) {
  if (req.query && req.query.key) return req.query.key;
  if (req.query && req.query["[key]"]) return req.query["[key]"];
  if (req.url && req.url.match(/\/([^\/]+)$/)) return decodeURIComponent(req.url.match(/\/([^\/]+)$/)[1]);
  return null;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // --- Upload file (POST /r2/upload) ---
  if (req.method === 'POST' && req.url === '/r2/upload') {
    try {
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      const form = new formidable.IncomingForm({ maxFileSize: 25 * 1024 * 1024, maxFiles: 1 });
      const [fields, files] = await form.parse(req);
      if (!files.file || files.file.length === 0) return errorResponse(res, 400, 'No file uploaded');
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file.size || file.size === 0) return errorResponse(res, 400, 'Empty file uploaded');
      const originalName = file.originalFilename || file.name || 'unknown';
      let filename = originalName;
      const fs = require('fs');
      let fileBuffer = fs.readFileSync(file.filepath);
      let contentType = file.mimetype || 'application/octet-stream';
      
      // Auto-convert to WebP if image
      if (contentType.startsWith('image/') && !contentType.includes('webp') && !contentType.includes('svg') && !contentType.includes('gif')) {
        try {
          const sharp = require('sharp');
          const convertedBuffer = await sharp(fileBuffer)
            .webp({ quality: 80 })
            .toBuffer();
            
          fileBuffer = convertedBuffer;
          contentType = 'image/webp';
          
          const nameParts = originalName.split('.');
          const nameWithoutExt = nameParts.length > 1 ? nameParts.slice(0, -1).join('.') : originalName;
          filename = `${nameWithoutExt}.webp`;
          console.log(`Auto-converted ${originalName} to ${filename}`);
        } catch (e) {
          console.error('Auto-conversion failed:', e);
        }
      }

      await putObject({ Bucket: process.env.R2_BUCKET_NAME, Key: filename, Body: fileBuffer, ContentType: contentType });
      const baseUrl = process.env.R2_PUBLIC_URL || '';
      const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${filename}` : null;
      // Samakan response dengan /api/files/upload: data: { file: {...} }
      return require('./utils').successResponse(
        res,
        { file: { filename, key: filename, size: file.size, contentType: file.mimetype || 'application/octet-stream', url: publicUrl, downloadUrl: `/r2/download/${filename}` } },
        'File uploaded successfully'
      );
    } catch (error) {
      console.error('R2 Upload error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Upload failed', error.message);
    }
  }

  // --- Upload & Convert to WebP (POST /r2/upload-webp) ---
  if (req.method === 'POST' && req.url === '/r2/upload-webp') {
    try {
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      const form = new formidable.IncomingForm({ maxFileSize: 10 * 1024 * 1024, maxFiles: 1 });
      const [fields, files] = await form.parse(req);
      
      if (!files.image || files.image.length === 0) return errorResponse(res, 400, 'No image file uploaded');
      const file = Array.isArray(files.image) ? files.image[0] : files.image;
      if (!file.size || file.size === 0) return errorResponse(res, 400, 'Empty file uploaded');
      
      // Check if file is an image
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return errorResponse(res, 400, 'Only image files are allowed');
      }
      
      const sharp = require('sharp');
      const fs = require('fs');
      const originalName = file.originalFilename || file.name || 'unknown';
      const originalSize = file.size; // Store original file size
      const quality = parseInt(fields.quality?.[0] || fields.quality || 80, 10);
      
      let fileBuffer = fs.readFileSync(file.filepath);
      let fileName = originalName;
      let contentType = 'image/webp';
      let wasConverted = false;

      // Check if file is already WebP
      if (file.mimetype !== 'image/webp') {
        console.log(`Converting ${fileName} to WebP format...`);
        
        // Convert to WebP
        try {
          fileBuffer = await sharp(fileBuffer).webp({ quality }).toBuffer();
          wasConverted = true;
          
          // Update filename to have .webp extension
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
          fileName = `${nameWithoutExt}.webp`;
        } catch (convertError) {
          console.error('WebP conversion error:', convertError);
          return errorResponse(res, 500, 'Failed to convert image to WebP', convertError.message);
        }
      }

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const uniqueFileName = `webp/${timestamp}-${fileName}`;

      // Upload to R2
      await putObject({ 
        Bucket: process.env.R2_BUCKET_NAME, 
        Key: uniqueFileName, 
        Body: fileBuffer, 
        ContentType: contentType 
      });
      
      const baseUrl = process.env.R2_PUBLIC_URL || '';
      const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${uniqueFileName}` : null;
      
      return successResponse(
        res,
        {
          file: {
            key: uniqueFileName,
            originalName: originalName,
            convertedName: fileName,
            filename: uniqueFileName,
            size: fileBuffer.length,
            originalSize: originalSize,
            contentType: contentType,
            url: publicUrl,
            downloadUrl: `/r2/download/${uniqueFileName}`,
            wasConverted: wasConverted,
            originalFormat: file.mimetype,
            uploadedAt: new Date().toISOString()
          }
        },
        'Image uploaded and converted successfully'
      );
    } catch (error) {
      console.error('R2 WebP Upload error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'WebP upload failed', error.message);
    }
  }

  // --- List files (GET /r2/files) ---
  if (req.method === 'GET' && req.url.startsWith('/r2/files')) {
    try {
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      const { token, prefix, limit } = req.query;
      const Bucket = process.env.R2_BUCKET_NAME;
      if (!Bucket) return errorResponse(res, 500, 'Server configuration error: Bucket name is missing.');
      const result = await listObjects({ Bucket, ContinuationToken: token || undefined, Prefix: prefix || '', MaxKeys: parseInt(limit, 10) || 100 });
      const baseUrl = process.env.R2_PUBLIC_URL || '';
      const files = await Promise.all((result.Contents || []).map(async obj => {
        const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${obj.Key}` : null;
        let presignedUrl = null;
        try {
          presignedUrl = await getPresignedUrl ? await getPresignedUrl({
            Bucket,
            Key: obj.Key,
            expiresIn: 3600
          }) : null;
        } catch (e) {
          presignedUrl = null;
        }
        // getContentTypeFromKey logic (inline, match files.js)
        const ext = obj.Key.toLowerCase().split('.').pop();
        const mimeTypes = {
          'jpg': 'image/jpeg','jpeg': 'image/jpeg','png': 'image/png','gif': 'image/gif','webp': 'image/webp','svg': 'image/svg+xml','bmp': 'image/bmp','ico': 'image/x-icon',
          'mp4': 'video/mp4','avi': 'video/x-msvideo','mov': 'video/quicktime','wmv': 'video/x-ms-wmv','flv': 'video/x-flv','webm': 'video/webm','mkv': 'video/x-matroska',
          'mp3': 'audio/mpeg','wav': 'audio/wav','ogg': 'audio/ogg','aac': 'audio/aac','flac': 'audio/flac','m4a': 'audio/mp4',
          'pdf': 'application/pdf','doc': 'application/msword','docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','xls': 'application/vnd.ms-excel','xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','ppt': 'application/vnd.ms-powerpoint','pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation','txt': 'text/plain','html': 'text/html','css': 'text/css','js': 'application/javascript','json': 'application/json','xml': 'application/xml','csv': 'text/csv',
          'zip': 'application/zip','rar': 'application/vnd.rar','7z': 'application/x-7z-compressed','tar': 'application/x-tar','gz': 'application/gzip'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        return {
          key: obj.Key,
          filename: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          contentType,
          url: publicUrl,
          presignedUrl,
          downloadUrl: `/r2/download/${encodeURIComponent(obj.Key)}`
        };
      }));
      return require('./utils').successResponse(res, { files, pagination: { nextToken: result.NextContinuationToken || null, isTruncated: result.IsTruncated || false, count: files.length } });
    } catch (error) {
      console.error('R2 List files error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to list files', error.message);
    }
  }

  // --- Download file (GET /r2/download/:key) ---
  if (req.method === 'GET' && req.url.startsWith('/r2/download/')) {
    try {
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      // Parse URL to extract file key, support /r2/download/:key or ?key=
      const { parse } = require('url');
      const { pathname, query } = parse(req.url, true);
      let key = query.key || pathname.replace('/r2/download/', '');
      if (!key) return errorResponse(res, 400, 'File key is required');
      const decodedKey = decodeURIComponent(key);
      const Bucket = process.env.R2_BUCKET_NAME;
      if (!Bucket) return errorResponse(res, 500, 'Server configuration error: Bucket name is missing.');
      // Stream file from R2 directly to force download
      const headResult = await headObject({ Bucket, Key: decodedKey });
      if (!headResult) return errorResponse(res, 404, 'File not found');
      try {
        const result = await getObject({ Bucket, Key: decodedKey });
        const originalName = decodedKey.includes('-') ? decodedKey.substring(decodedKey.indexOf('-') + 1) : decodedKey;
        
        // Set headers
        res.setHeader('Content-Type', headResult.ContentType || result.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
        if (headResult.ContentLength || result.ContentLength) {
          res.setHeader('Content-Length', headResult.ContentLength || result.ContentLength);
        }

        // Handle streaming appropriately
        if (result.Body && typeof result.Body.pipe === 'function') {
          // Use event handlers to properly handle end and error cases
          result.Body.on('error', (err) => {
            console.error('Stream error:', err);
            // Only end response if it hasn't been sent yet
            if (!res.headersSent) {
              res.status(500).end();
            }
          });
          
          // Stream to response
          return result.Body.pipe(res);
        } else if (result.Body) {
          // Buffer approach when pipe not available
          const chunks = [];
          for await (const chunk of result.Body) { 
            chunks.push(chunk); 
          }
          const buffer = Buffer.concat(chunks);
          return res.end(buffer);
        } else {
          throw new Error('No file content received');
        }
      } catch (streamError) {
        console.error('R2 streaming error:', streamError);
        if (!res.headersSent) {
          return errorResponse(res, 500, 'Failed to stream file', streamError.message);
        }
      }
    } catch (error) {
      console.error('R2 Download error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      if (error.name === 'NoSuchKey' || error.message.includes('not found')) return errorResponse(res, 404, 'File not found');
      return errorResponse(res, 500, 'Failed to download file', error.message);
    }
  }

  // --- Delete file (DELETE /r2/files/:key) ---
  if (req.method === 'DELETE' && req.url.startsWith('/r2/files/')) {
    try {
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      const key = getKey(req);
      if (!key) return errorResponse(res, 400, 'File key is required');
      const Bucket = process.env.R2_BUCKET_NAME;
      try {
        await headObject({ Bucket, Key: key });
      } catch (err) {
        if (err.name === 'NotFound' || err.message.includes('not found')) return errorResponse(res, 404, 'File not found');
        throw err;
      }
      await deleteObject({ Bucket, Key: key });
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
      const { user, newAccessToken } = authenticateJwtOnly(req);
      if (newAccessToken) {
        const { setCookie } = require('./utils');
        const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
        res.setHeader('Set-Cookie', accessCookie);
      }
      const key = getKey(req);
      const expires = req.query && req.query.expires ? req.query.expires : undefined;
      if (!key) return errorResponse(res, 400, 'File key is required');
      const Bucket = process.env.R2_BUCKET_NAME;
      const headResult = await headObject({ Bucket, Key: key });
      if (!headResult) return errorResponse(res, 404, 'File not found');
      const expiresIn = parseInt(expires, 10) || 3600;
      const url = await getPresignedUrl({ Bucket, Key: key, expiresIn });
      return successResponse(res, { url, expiresIn });
    } catch (error) {
      console.error('R2 Presigned URL error:', error);
      if (error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
      return errorResponse(res, 500, 'Failed to generate presigned URL', error.message);
    }
  }

  // --- Not found ---
  return errorResponse(res, 404, 'Not found');
}
