const { master } = require('./r2-client');
const { v4: uuidv4 } = require('uuid');

const STORE_KEY = 'system/buckets.json';
const MASTER_BUCKET = () => process.env.R2_BUCKET_NAME;

async function readStore() {
  try {
    const result = await master.get({ Bucket: MASTER_BUCKET(), Key: STORE_KEY });
    const chunks = [];
    for await (const chunk of result.Body) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (err) {
    // File doesn't exist yet — return empty list
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return [];
    throw err;
  }
}

async function writeStore(buckets) {
  await master.put({
    Bucket: MASTER_BUCKET(),
    Key: STORE_KEY,
    Body: JSON.stringify(buckets, null, 2),
    ContentType: 'application/json',
  });
}

async function listBuckets() {
  return await readStore();
}

async function getBucketById(id) {
  const buckets = await readStore();
  return buckets.find(b => b.id === id) || null;
}

async function addBucket(data) {
  const buckets = await readStore();
  const bucket = {
    id: uuidv4(),
    name: data.name,
    endpoint: data.endpoint,
    accessKeyId: data.accessKeyId,
    secretAccessKey: data.secretAccessKey,
    publicUrl: data.publicUrl || '',
    createdAt: new Date().toISOString(),
  };
  buckets.push(bucket);
  await writeStore(buckets);
  return bucket;
}

async function deleteBucket(id) {
  const buckets = await readStore();
  const idx = buckets.findIndex(b => b.id === id);
  if (idx === -1) return false;
  buckets.splice(idx, 1);
  await writeStore(buckets);
  return true;
}

// Safe public view — never expose credentials
function toPublic(bucket) {
  return {
    id: bucket.id,
    name: bucket.name,
    endpoint: bucket.endpoint,
    publicUrl: bucket.publicUrl,
    createdAt: bucket.createdAt,
  };
}

module.exports = { listBuckets, getBucketById, addBucket, deleteBucket, toPublic };
