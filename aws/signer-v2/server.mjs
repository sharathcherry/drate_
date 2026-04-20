import express from 'express';
import cors from 'cors';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const firebaseJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function sanitizeFileName(fileName) {
  return String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function extensionFromFileName(fileName) {
  const sanitized = sanitizeFileName(fileName);
  const pieces = sanitized.split('.');
  if (pieces.length < 2) return 'bin';
  const ext = pieces.pop()?.toLowerCase();
  return ext || 'bin';
}

const app = express();
const port = Number(process.env.PORT || 3100);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'drate-upload-signer-v2' });
});

app.post(['/api/sign-upload', '/api/uploads/sign'], async (req, res) => {
  try {
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
    if (!firebaseProjectId) {
      return res.status(500).json({ error: 'Server misconfigured: Missing FIREBASE_PROJECT_ID' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    let payload;
    try {
      const verified = await jwtVerify(idToken, firebaseJwks, {
        issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId,
      });
      payload = verified.payload;
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { uid, photoNum, fileName, contentType } = req.body || {};
    const tokenUid = payload.user_id || payload.sub;

    if (!uid || uid !== tokenUid) {
      return res.status(403).json({ error: 'UID mismatch' });
    }

    const awsRegion = process.env.AWS_REGION;
    const awsBucket = process.env.AWS_S3_BUCKET;
    const awsKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;

    if (!awsRegion || !awsBucket || !awsKey || !awsSecret) {
      return res.status(500).json({
        error:
          'Server misconfigured: Missing AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
      });
    }

    const normalizedPhotoNum = photoNum === 2 ? 2 : 1;
    const ext = extensionFromFileName(fileName);
    const safeContentType = String(contentType || 'application/octet-stream').slice(0, 200);
    const key = `profiles/${uid}/photo_${normalizedPhotoNum}_${Date.now()}.${ext}`;

    const s3 = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsKey,
        secretAccessKey: awsSecret,
      },
    });

    const command = new PutObjectCommand({
      Bucket: awsBucket,
      Key: key,
      ContentType: safeContentType,
    });

    const signedUrlTtlSeconds = Number(process.env.SIGNED_URL_TTL_SECONDS || 300);
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: signedUrlTtlSeconds });
    const publicBaseUrl =
      process.env.AWS_S3_PUBLIC_BASE_URL || `https://${awsBucket}.s3.${awsRegion}.amazonaws.com`;
    const fileUrl = `${publicBaseUrl.replace(/\/+$/, '')}/${encodeURI(key)}`;

    res.status(200).json({ uploadUrl, fileUrl, method: 'PUT', headers: { 'Content-Type': safeContentType } });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate signed upload URL',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`drate-upload-signer-v2 listening on 0.0.0.0:${port}`);
});
