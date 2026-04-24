const { S3Client } = require('@aws-sdk/client-s3');
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Master client (from env) — used as fallback and for buckets.json storage
const masterClient = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Factory: create S3Client for any bucket config
function createR2Client(bucketConfig) {
  return new S3Client({
    region: 'auto',
    endpoint: bucketConfig.endpoint,
    credentials: {
      accessKeyId: bucketConfig.accessKeyId,
      secretAccessKey: bucketConfig.secretAccessKey,
    },
  });
}

// Resolve client + bucket name from request context
// Priority: X-Bucket-ID header → master bucket
async function resolveClientAndBucket(req) {
  const bucketId = req.headers['x-bucket-id'];
  if (bucketId) {
    const { getBucketById } = require('./bucket-store');
    const bucket = await getBucketById(bucketId);
    if (!bucket) throw new Error(`Bucket not found: ${bucketId}`);
    return {
      client: createR2Client(bucket),
      bucketName: bucket.name,
      publicUrl: bucket.publicUrl || '',
    };
  }
  // Fallback to master bucket
  return {
    client: masterClient,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL || '',
  };
}

// Generic command helpers — accept explicit client
async function putObject(client, params) {
  return await client.send(new PutObjectCommand(params));
}

async function getObject(client, params) {
  return await client.send(new GetObjectCommand(params));
}

async function deleteObject(client, params) {
  return await client.send(new DeleteObjectCommand(params));
}

async function listObjects(client, params) {
  return await client.send(new ListObjectsV2Command(params));
}

async function headObject(client, params) {
  return await client.send(new HeadObjectCommand(params));
}

async function getPresignedUrl(client, params) {
  const command = new GetObjectCommand(params);
  return await getSignedUrl(client, command, { expiresIn: params.expiresIn || 3600 });
}

// Master-only helpers (for bucket-store internal use)
const master = {
  put: (params) => putObject(masterClient, params),
  get: (params) => getObject(masterClient, params),
  delete: (params) => deleteObject(masterClient, params),
  list: (params) => listObjects(masterClient, params),
  head: (params) => headObject(masterClient, params),
};

module.exports = {
  masterClient,
  createR2Client,
  resolveClientAndBucket,
  putObject,
  getObject,
  deleteObject,
  listObjects,
  headObject,
  getPresignedUrl,
  master,
};
