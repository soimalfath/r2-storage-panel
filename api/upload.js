const formidable = require('formidable');
const { 
  authenticateHybrid, 
  handleCors, 
  errorResponse, 
  successResponse 
} = require('./utils');
const { putObject } = require('./r2-client');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  try {
    // Authenticate using hybrid authentication (supports both API key and JWT session)
    const { user, newAccessToken } = authenticateHybrid(req);
    
    // Set new access token if JWT was refreshed
    if (newAccessToken) {
      const { setCookie } = require('./utils');
      const accessCookie = setCookie('accessToken', newAccessToken, { maxAge: 15 * 60 });
      res.setHeader('Set-Cookie', accessCookie);
    }
    
    // Parse form data
    const form = new formidable.IncomingForm({
      maxFileSize: 4 * 1024 * 1024, // 4MB for Vercel Hobby compatibility
      maxFiles: 1
    });
    
    const [fields, files] = await form.parse(req);
    
    if (!files.file || files.file.length === 0) {
      return errorResponse(res, 400, 'No file uploaded', 'Please provide a file in the "file" field');
    }
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    
    // Validate file
    if (!file.size || file.size === 0) {
      return errorResponse(res, 400, 'Empty file uploaded');
    }
    
    // Generate filename with timestamp to avoid conflicts
    const timestamp = Date.now();
    const originalName = file.originalFilename || file.name || 'unknown';
    const filename = `${timestamp}-${originalName}`;
    
    // Read file buffer
    const fs = require('fs');
    let fileBuffer = fs.readFileSync(file.filepath);
    
    // Check if file is an image and not already WebP
    // We only convert jpg, jpeg, png, tiff, etc. to webp
    let contentType = file.mimetype || 'application/octet-stream';
    let fileKey = filename;
    
    if (contentType.startsWith('image/') && !contentType.includes('webp') && !contentType.includes('svg') && !contentType.includes('gif')) {
      try {
        const sharp = require('sharp');
        const convertedBuffer = await sharp(fileBuffer)
          .webp({ quality: 80 }) // Default quality 80
          .toBuffer();
          
        fileBuffer = convertedBuffer;
        contentType = 'image/webp';
        
        // Update filename extension to .webp
        const nameParts = originalName.split('.');
        const nameWithoutExt = nameParts.length > 1 ? nameParts.slice(0, -1).join('.') : originalName;
        const newOriginalName = `${nameWithoutExt}.webp`;
        fileKey = `${timestamp}-${newOriginalName}`;
        
        console.log(`Converted ${originalName} to ${newOriginalName}`);
      } catch (conversionError) {
        console.error('Image conversion failed, uploading original:', conversionError);
        // Fallback to original file if conversion fails
      }
    }
    
    // Upload to R2
    await putObject({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: contentType,
    });
    
    // Build file URLs
    const baseUrl = process.env.R2_PUBLIC_URL || '';
    const publicUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${fileKey}` : null;
    const downloadUrl = `/r2/download/${fileKey}`;
    
    return successResponse(res, {
      filename: fileKey,
      originalName: originalName,
      key: fileKey,
      size: fileBuffer.length, // Use actual buffer length after conversion
      contentType: contentType,
      publicUrl: publicUrl,
      downloadUrl: downloadUrl,
      uploadedAt: new Date().toISOString()
    }, 'File uploaded successfully');
    
  } catch (error) {
    console.error('API Upload error:', error);
    if (error.message.includes('API key') || error.message.includes('token') || error.message.includes('authenticate')) {
      return errorResponse(res, 401, error.message);
    }
    return errorResponse(res, 500, 'Upload failed', error.message);
  }
}
