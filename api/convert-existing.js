const { 
  authenticateHybrid, 
  handleCors, 
  errorResponse, 
  successResponse 
} = require('./utils');
const { 
  listObjects, 
  getObject, 
  putObject, 
  deleteObject 
} = require('./r2-client');
const sharp = require('sharp');

// Improve stream to buffer helper
const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  try {
    // Authenticate
    const { user } = authenticateHybrid(req);
    
    // Check for admin/authorized user if needed context provided
    // For now assuming any valid user can trigger this (or restrict to admin)

    const { limit = 20, continuationToken, replace = false, prefix = '' } = req.body;
    
    // List objects
    const listParams = {
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: limit,
      ContinuationToken: continuationToken,
      Prefix: prefix
    };

    const listResult = await listObjects(listParams);
    
    const converted = [];
    const errors = [];
    const skipped = [];
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      return successResponse(res, { 
        message: 'No files found to process',
        converted, 
        errors, 
        skipped,
        nextContinuationToken: null 
      });
    }

    for (const object of listResult.Contents) {
      const key = object.Key;
      
      // Skip if already webp
      if (key.toLowerCase().endsWith('.webp')) {
        skipped.push({ key, reason: 'Already WebP' });
        continue;
      }
      
      // Check extension
      const isImage = key.match(/\.(jpg|jpeg|png|tiff|bmp)$/i);
      if (!isImage) {
        skipped.push({ key, reason: 'Not a supported image type' });
        continue;
      }
      
      try {
        console.log(`Processing ${key}...`);
        
        // Download object
        const getObj = await getObject({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key
        });
        
        const buffer = await streamToBuffer(getObj.Body);
        
        // Convert to WebP
        const convertedBuffer = await sharp(buffer)
          .webp({ quality: 80 })
          .toBuffer();
          
        // Construct new key
        const keyParts = key.split('.');
        const newKey = keyParts.slice(0, -1).join('.') + '.webp';
        
        // Check if new key already exists to avoid overwriting unless forced?
        // Actually PUT overwrites.
        
        // Upload new object
        await putObject({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: newKey,
          Body: convertedBuffer,
          ContentType: 'image/webp'
        });
        
        // Delete old object if replace is true
        if (replace) {
           await deleteObject({
             Bucket: process.env.R2_BUCKET_NAME,
             Key: key
           });
        }
        
        converted.push({
          oldKey: key,
          newKey: newKey,
          originalSize: object.Size,
          newSize: convertedBuffer.length
        });
        
      } catch (err) {
        console.error(`Failed to convert ${key}:`, err);
        errors.push({ key, error: err.message });
      }
    }

    return successResponse(res, {
      converted,
      errors,
      skippedCount: skipped.length,
      nextContinuationToken: listResult.NextContinuationToken,
      isTruncated: listResult.IsTruncated
    }, `Processed ${listResult.Contents.length} files. Converted: ${converted.length}, Errors: ${errors.length}`);

  } catch (error) {
    console.error('Convert Existing Error:', error);
    return errorResponse(res, 500, 'Conversion failed', error.message);
  }
};
