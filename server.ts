import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const firebaseJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function sanitizeFileName(fileName: string) {
  return String(fileName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function extensionFromFileName(fileName: string) {
  const sanitized = sanitizeFileName(fileName);
  const pieces = sanitized.split('.');
  if (pieces.length < 2) return 'bin';
  const ext = pieces.pop()?.toLowerCase();
  return ext || 'bin';
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post(['/api/sign-upload', '/api/uploads/sign'], async (req, res) => {
    try {
      const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;

      if (!firebaseProjectId) {
        let configPid;
        try {
          const config = require('./firebase-applet-config.json');
          configPid = config.projectId;
        } catch (e) {}
        if (!configPid) {
          console.error('Missing FIREBASE_PROJECT_ID');
          return res.status(500).json({ error: 'Server misconfigured: Missing Firebase project ID' });
        }
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Bearer token' });
      }

      const idToken = authHeader.slice('Bearer '.length).trim();
      const actualProjectId = process.env.FIREBASE_PROJECT_ID || require('./firebase-applet-config.json').projectId;

      let payload;
      try {
        const verified = await jwtVerify(idToken, firebaseJwks, {
          issuer: `https://securetoken.google.com/${actualProjectId}`,
          audience: actualProjectId,
        });
        payload = verified.payload;
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError);
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { uid, photoNum, fileName, contentType } = req.body || {};
      const tokenUid = payload.user_id || payload.sub;

      if (!uid || uid !== tokenUid) {
        return res.status(403).json({ error: 'UID mismatch' });
      }

      const s3Configured = process.env.AWS_REGION && process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
      if (!s3Configured) {
        console.error('Missing AWS env vars');
        return res.status(500).json({ error: 'Server misconfigured: Missing AWS credentials. Please set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in your environment variables.' });
      }

      const normalizedPhotoNum = photoNum === 2 ? 2 : 1;
      const ext = extensionFromFileName(fileName);
      const safeContentType = String(contentType || 'application/octet-stream').slice(0, 200);
      const key = `profiles/${uid}/photo_${normalizedPhotoNum}_${Date.now()}.${ext}`;

      const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        ContentType: safeContentType,
      });

      const signedUrlTtlSeconds = Number(process.env.SIGNED_URL_TTL_SECONDS || 300);
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: signedUrlTtlSeconds });
      const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const fileUrl = `${publicBaseUrl.replace(/\/+$/, '')}/${encodeURI(key)}`;

      res.status(200).json({ uploadUrl, fileUrl, method: 'PUT', headers: { 'Content-Type': safeContentType } });
    } catch (error) {
      console.error('Signing error:', error);
      res.status(500).json({
        error: 'Failed to generate signed upload URL',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
