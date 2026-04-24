const { authenticateToken, handleCors, errorResponse, successResponse } = require('./utils');
const { listBuckets, getBucketById, addBucket, updateBucket, deleteBucket, toPublic } = require('./bucket-store');
const { createR2Client } = require('./r2-client');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Create bucket in Cloudflare R2 via CF API
async function createCloudflareBucket(name) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) throw new Error('CF_ACCOUNT_ID and CF_API_TOKEN are required');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }
  );

  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.[0]?.message || 'Failed to create bucket on Cloudflare';
    throw new Error(msg);
  }
  return data.result;
}

// Validate R2 credentials by attempting a list operation
async function validateCredentials(config) {
  try {
    const client = createR2Client(config);
    await client.send(new ListObjectsV2Command({ Bucket: config.name, MaxKeys: 1 }));
    return true;
  } catch (err) {
    throw new Error(`Invalid credentials or bucket not accessible: ${err.message}`);
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const path = req.path || req.url || '';
  const method = req.method;

  // All bucket management requires JWT auth
  try {
    authenticateToken(req);
  } catch (err) {
    return errorResponse(res, 401, 'Authentication required');
  }

  // GET /api/buckets/config — expose panel config flags to frontend
  if (method === 'GET' && path === '/buckets/config') {
    return successResponse(res, {
      hasSharedCreds: !!(process.env.R2_SHARED_ACCESS_KEY_ID && process.env.R2_SHARED_SECRET_ACCESS_KEY),
      hasCfConfig: !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN),
    }, 'Config retrieved');
  }

  // GET /api/buckets/cf-list — list bucket names from Cloudflare API
  if (method === 'GET' && path === '/buckets/cf-list') {
    try {
      const accountId = process.env.CF_ACCOUNT_ID;
      const apiToken = process.env.CF_API_TOKEN;
      if (!accountId || !apiToken) return errorResponse(res, 400, 'CF_ACCOUNT_ID and CF_API_TOKEN not configured in env');

      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
        { headers: { 'Authorization': `Bearer ${apiToken}` } }
      );
      const data = await cfRes.json();
      if (!data.success) {
        const msg = data.errors?.[0]?.message || 'Failed to fetch buckets from Cloudflare';
        return errorResponse(res, 400, msg);
      }

      const registered = await listBuckets();
      const registeredNames = new Set(registered.map(b => b.name));
      // Flag whether shared credentials are configured
      const hasSharedCreds = !!(process.env.R2_SHARED_ACCESS_KEY_ID && process.env.R2_SHARED_SECRET_ACCESS_KEY);
      const buckets = (data.result?.buckets || []).map(b => {
        // Auto-detect public URL from CF domains if bucket has public access enabled
        const publicDomain = (b.domains || b.custom_domains || []).find(d => d.enabled || d.status === 'active' || d.status === 'Active')?.domain || b.public_domain || null;
        const publicUrl = publicDomain ? `https://${publicDomain}` : null;
        return {
          name: b.name,
          creationDate: b.creation_date,
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          publicUrl,
          alreadyAdded: registeredNames.has(b.name),
        };
      });

      return successResponse(res, { buckets, hasSharedCreds }, 'Cloudflare buckets retrieved');
    } catch (err) {
      console.error('CF list buckets error:', err);
      return errorResponse(res, 500, 'Failed to fetch from Cloudflare');
    }
  }

  // POST /api/buckets/cf-import — 1-click import using shared credentials from env
  if (method === 'POST' && path === '/buckets/cf-import') {
    try {
      const { name, publicUrl: manualPublicUrl } = req.body;
      if (!name) return errorResponse(res, 400, 'name is required');

      const accountId = process.env.CF_ACCOUNT_ID;
      const apiToken = process.env.CF_API_TOKEN;
      const accessKeyId = process.env.R2_SHARED_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SHARED_SECRET_ACCESS_KEY;

      if (!accountId || !accessKeyId || !secretAccessKey) {
        return errorResponse(res, 400, 'CF_ACCOUNT_ID, R2_SHARED_ACCESS_KEY_ID, and R2_SHARED_SECRET_ACCESS_KEY must be set in env');
      }

      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

      // Validate shared credentials can access this bucket
      await validateCredentials({ name, endpoint, accessKeyId, secretAccessKey });

      const bucket = await addBucket({ name, endpoint, accessKeyId, secretAccessKey, publicUrl: manualPublicUrl || '' });
      return successResponse(res, toPublic(bucket), 'Bucket imported successfully');
    } catch (err) {
      console.error('CF import error:', err);
      return errorResponse(res, 400, err.message);
    }
  }

  // GET /api/buckets — list all buckets (public view, no credentials)
  if (method === 'GET' && (path === '/buckets' || path === '/buckets/')) {
    try {
      const buckets = await listBuckets();
      return successResponse(res, buckets.map(toPublic), 'Buckets retrieved');
    } catch (err) {
      console.error('List buckets error:', err);
      // Surface the real error in non-production for easier debugging
      const msg = process.env.NODE_ENV === 'production'
        ? 'Failed to list buckets'
        : `Failed to list buckets: ${err.message}`;
      return errorResponse(res, 500, msg);
    }
  }

  // POST /api/buckets — create/register new bucket
  if (method === 'POST' && (path === '/buckets' || path === '/buckets/')) {
    try {
      const { name, publicUrl, createOnCloudflare } = req.body;
      let { endpoint, accessKeyId, secretAccessKey } = req.body;

      if (!name) return errorResponse(res, 400, 'name is required');

      // Fall back to shared credentials from env if not provided
      const accountId = process.env.CF_ACCOUNT_ID;
      if (!accessKeyId) accessKeyId = process.env.R2_SHARED_ACCESS_KEY_ID;
      if (!secretAccessKey) secretAccessKey = process.env.R2_SHARED_SECRET_ACCESS_KEY;
      if (!endpoint && accountId) endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

      if (!endpoint || !accessKeyId || !secretAccessKey) {
        return errorResponse(res, 400, 'endpoint, accessKeyId, secretAccessKey are required (or set R2_SHARED_* in env)');
      }

      // Validate bucket name (R2 rules: lowercase, alphanumeric, hyphens)
      if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
        return errorResponse(res, 400, 'Invalid bucket name. Use lowercase letters, numbers, and hyphens (3-63 chars)');
      }

      // Optionally create bucket on Cloudflare first
      if (createOnCloudflare) {
        await createCloudflareBucket(name);
      }

      // Validate credentials can actually access the bucket
      await validateCredentials({ name, endpoint, accessKeyId, secretAccessKey });

      const bucket = await addBucket({ name, endpoint, accessKeyId, secretAccessKey, publicUrl: publicUrl || '' });
      return successResponse(res, toPublic(bucket), 'Bucket created successfully');
    } catch (err) {
      console.error('Create bucket error:', err);
      return errorResponse(res, 400, err.message);
    }
  }

  // POST /api/buckets/:id/sync — update publicUrl manually
  const syncMatch = path.match(/^\/buckets\/([^/]+)\/sync$/);
  if (method === 'POST' && syncMatch) {
    try {
      const id = syncMatch[1];
      const { publicUrl } = req.body;
      if (publicUrl === undefined) return errorResponse(res, 400, 'publicUrl is required');
      const updated = await updateBucket(id, { publicUrl: publicUrl || '' });
      if (!updated) return errorResponse(res, 404, 'Bucket not found');
      return successResponse(res, toPublic(updated), 'Public URL updated');
    } catch (err) {
      return errorResponse(res, 500, 'Failed to update bucket');
    }
  }

  // DELETE /api/buckets/:id — remove bucket from panel (does NOT delete from Cloudflare)
  const deleteMatch = path.match(/^\/buckets\/([^/]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    try {
      const id = deleteMatch[1];
      const deleted = await deleteBucket(id);
      if (!deleted) return errorResponse(res, 404, 'Bucket not found');
      return successResponse(res, null, 'Bucket removed from panel');
    } catch (err) {
      console.error('Delete bucket error:', err);
      return errorResponse(res, 500, 'Failed to remove bucket');
    }
  }

  return errorResponse(res, 404, 'Not found');
};
