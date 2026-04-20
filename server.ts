import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';

// Load local env files for backend secrets in development.
dotenv.config({ path: '.env.local' });
dotenv.config();

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

let cachedFirebaseProjectId: string | null = null;
function getFirebaseProjectIdFromConfig(): string | null {
  if (cachedFirebaseProjectId) return cachedFirebaseProjectId;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const projectId = typeof parsed?.projectId === 'string' ? parsed.projectId : null;
    cachedFirebaseProjectId = projectId;
    return projectId;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post(['/api/sign-upload', '/api/uploads/sign'], async (req: Request, res: Response) => {
    try {
      const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;

      if (!firebaseProjectId) {
        const configPid = getFirebaseProjectIdFromConfig();
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
      const actualProjectId = process.env.FIREBASE_PROJECT_ID || getFirebaseProjectIdFromConfig();
      if (!actualProjectId) {
        return res.status(500).json({ error: 'Server misconfigured: Missing Firebase project ID' });
      }

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

  app.post('/api/ai/profile-analysis', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Bearer token' });
      }

      const idToken = authHeader.slice('Bearer '.length).trim();
      const actualProjectId = process.env.FIREBASE_PROJECT_ID || getFirebaseProjectIdFromConfig();
      if (!actualProjectId) {
        return res.status(500).json({ error: 'Server misconfigured: Missing Firebase project ID' });
      }

      try {
        await jwtVerify(idToken, firebaseJwks, {
          issuer: `https://securetoken.google.com/${actualProjectId}`,
          audience: actualProjectId,
        });
      } catch (jwtError) {
        console.error('JWT verification failed for AI endpoint:', jwtError);
        return res.status(401).json({ error: 'Invalid token' });
      }

      const commentsRaw = req.body?.comments;
      const comments = Array.isArray(commentsRaw)
        ? commentsRaw.filter((c: unknown) => typeof c === 'string').map((c: string) => c.trim()).filter(Boolean)
        : [];

      if (comments.length === 0) {
        return res.status(400).json({ error: 'No comments provided' });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: 'Server misconfigured: Missing GEMINI_API_KEY' });
      }

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const prompt = `You are an expert dating and social profile consultant. Based on the following anonymous feedback comments a user received, write a fun, encouraging, and constructive 3-sentence summary of their "vibe", what people like about them, and one piece of constructive advice. Keep it lighthearted and use emojis. Comments: ${comments.join(' | ')}`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return res.status(200).json({ analysis: response.text || "Couldn't generate analysis." });
    } catch (error) {
      console.error('Profile analysis error:', error);
      return res.status(500).json({
        error: 'Failed to generate profile analysis',
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
    app.get('/*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
