const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

app.post('/api/get-upload-url', async (req, res) => {
  const { filename, fileType, fileSize } = req.body;

  // Server-side validation first
  if (!ALLOWED_TYPES.includes(fileType)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }
  if (fileSize > MAX_SIZE_BYTES) {
    return res.status(400).json({ error: 'File too large. Max 50MB' });
  }

  const blobName = `uploads/${Date.now()}-${filename}`;

  // Presigned POST with conditions R2 will enforce
  const { url, fields } = await createPresignedPost(r2Client, {
    Bucket: bucketName,
    Key: blobName,
    Conditions: [
      ['content-length-range', 0, MAX_SIZE_BYTES],       // R2 rejects if file > 50MB
      ['eq', '$Content-Type', fileType],                  // R2 rejects if type mismatch
      ['starts-with', '$key', 'uploads/'],                // key must start with uploads/
    ],
    Fields: {
      'Content-Type': fileType,
    },
    Expires: 300, // 5 mins
  });

  const fileUrl = `${process.env.x}/${blobName}`;

  res.json({ url, fields, fileUrl, blobName });
});