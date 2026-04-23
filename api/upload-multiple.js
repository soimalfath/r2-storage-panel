const formidable = require('formidable');
const { authenticateHybrid, handleCors, errorResponse, successResponse, setCookie } = require('./utils');
const { resolveClientAndBucket, putObject } = require('./r2-client');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  try {
    const { newAccessToken } = authenticateHybrid(req);
    if (newAccessToken) res.setHeader('Set-Cookie', setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 }));

    const { client, bucketName, publicUrl: baseUrl } = await resolveClientAndBucket(req);

    const form = new formidable.IncomingForm({ maxFileSize: 4 * 1024 * 1024, maxFiles: 10 });
    const [, files] = await form.parse(req);
    if (!files.files?.length) return errorResponse(res, 400, 'No files uploaded');

    const fileArray = Array.isArray(files.files) ? files.files : [files.files];
    const uploaded = [];
    const errors = [];

    for (const file of fileArray) {
      try {
        if (!file.size) { errors.push({ file: file.originalFilename, error: 'Empty file' }); continue; }

        const fs = require('fs');
        const timestamp = Date.now();
        const rand = Math.random().toString(36).substring(2, 8);
        const originalName = file.originalFilename || 'unknown';
        let fileBuffer = fs.readFileSync(file.filepath);
        let contentType = file.mimetype || 'application/octet-stream';
        let fileKey = `${timestamp}-${rand}-${originalName}`;

        if (contentType.startsWith('image/') && !['webp','svg','gif'].some(t => contentType.includes(t))) {
          try {
            const sharp = require('sharp');
            fileBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
            contentType = 'image/webp';
            const base = originalName.split('.').slice(0, -1).join('.') || originalName;
            fileKey = `${timestamp}-${rand}-${base}.webp`;
          } catch (e) { console.error('Conversion failed:', e); }
        }

        await putObject(client, { Bucket: bucketName, Key: fileKey, Body: fileBuffer, ContentType: contentType });
        const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${fileKey}` : null;
        uploaded.push({ filename: fileKey, originalName, key: fileKey, size: fileBuffer.length, contentType, publicUrl, downloadUrl: `/r2/download/${fileKey}`, uploadedAt: new Date().toISOString() });
      } catch (e) {
        errors.push({ file: file.originalFilename, error: e.message });
      }
    }

    return successResponse(res, { uploaded, errors, summary: { total: fileArray.length, successful: uploaded.length, failed: errors.length } }, `${uploaded.length} files uploaded successfully${errors.length ? `, ${errors.length} failed` : ''}`);
  } catch (error) {
    console.error('API Multiple upload error:', error);
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
    return errorResponse(res, 500, 'Upload failed', error.message);
  }
};
