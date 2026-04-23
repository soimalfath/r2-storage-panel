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

    const form = new formidable.IncomingForm({ maxFileSize: 4 * 1024 * 1024, maxFiles: 1 });
    const [, files] = await form.parse(req);
    if (!files.file?.length) return errorResponse(res, 400, 'No file uploaded');
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file.size) return errorResponse(res, 400, 'Empty file uploaded');

    const fs = require('fs');
    const timestamp = Date.now();
    const originalName = file.originalFilename || 'unknown';
    let fileBuffer = fs.readFileSync(file.filepath);
    let contentType = file.mimetype || 'application/octet-stream';
    let fileKey = `${timestamp}-${originalName}`;

    if (contentType.startsWith('image/') && !['webp','svg','gif'].some(t => contentType.includes(t))) {
      try {
        const sharp = require('sharp');
        fileBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
        contentType = 'image/webp';
        const base = originalName.split('.').slice(0, -1).join('.') || originalName;
        fileKey = `${timestamp}-${base}.webp`;
      } catch (e) { console.error('Conversion failed, uploading original:', e); }
    }

    await putObject(client, { Bucket: bucketName, Key: fileKey, Body: fileBuffer, ContentType: contentType });
    const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${fileKey}` : null;

    return successResponse(res, { filename: fileKey, originalName, key: fileKey, size: fileBuffer.length, contentType, publicUrl, downloadUrl: `/r2/download/${fileKey}`, uploadedAt: new Date().toISOString() }, 'File uploaded successfully');
  } catch (error) {
    console.error('API Upload error:', error);
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) return errorResponse(res, 401, error.message);
    return errorResponse(res, 500, 'Upload failed', error.message);
  }
};
