type ProgressHandler = (percent: number) => void;

type PresignedRequest = {
  uid: string;
  photoNum: 1 | 2;
  file: File;
  idToken: string;
};

type PresignedResponse = {
  uploadUrl: string;
  fileUrl?: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
};

function createTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createTimeoutSignal(timeoutMs: number): { signal?: AbortSignal; cleanup: () => void } {
  if (typeof AbortController === 'undefined') {
    return { signal: undefined, cleanup: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function isHeifLikeFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return mime.includes('heic') || mime.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

async function normalizeUploadFile(file: File): Promise<File> {
  if (!isHeifLikeFile(file)) return file;

  let heic2any: any;
  try {
    const mod = await import('heic2any');
    heic2any = mod.default || mod;
  } catch {
    throw new Error('HEIF/HEIC conversion library is unavailable.');
  }

  let converted: Blob | Blob[];
  try {
    converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
  } catch (error) {
    throw new Error(
      `Failed to convert HEIF/HEIC image for preview/upload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
  const nextName = (file.name || 'upload.heic').replace(/\.(heic|heif)$/i, '.jpg');
  return new File([convertedBlob], nextName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

export function getSigningEndpoint(): string {
  const isDev = Boolean((import.meta as any).env.DEV);
  const endpoint = (import.meta as any).env.VITE_UPLOAD_SIGN_URL as string | undefined;
  const enforceHttpsOnNative =
    String((import.meta as any).env.VITE_ENFORCE_HTTPS_NATIVE_SIGN_URL || '').toLowerCase() === 'true';
  const isCapacitorNative =
    typeof window !== 'undefined' &&
    (((window as any).Capacitor?.isNativePlatform?.() as boolean) || window.location.protocol === 'capacitor:');

  if (endpoint) {
    // Optional hard-enforcement for teams that require HTTPS-only signer URLs on native builds.
    if (isCapacitorNative && !isDev && enforceHttpsOnNative && endpoint.startsWith('http://')) {
      throw new Error(
        `Invalid release signer endpoint "${endpoint}". Native production builds require HTTPS VITE_UPLOAD_SIGN_URL.`,
      );
    }
    if (isCapacitorNative && !isDev && endpoint.startsWith('http://')) {
      console.warn(
        `Using HTTP signer endpoint on native build: ${endpoint}. ` +
          'If uploads fail on some networks/devices, move signer to HTTPS and set VITE_UPLOAD_SIGN_URL accordingly.',
      );
    }
    return endpoint;
  }

  // Handle Capacitor/Mobile: window.location.origin is often http://localhost
  // which won't work for hitting a remote backend.
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitor = isCapacitorNative;
    
    // Localhost fallback is development-only.
    if (isCapacitor && isLocalhost && isDev) {
      const localNativeEndpoint = 'http://localhost:3000/api/sign-upload';
      console.warn(
        'Capacitor detected on localhost. Using local signing endpoint http://localhost:3000/api/sign-upload. ' +
          'If testing on a physical device, run: adb reverse tcp:3000 tcp:3000 and keep npm run dev running.',
      );
      return localNativeEndpoint;
    }

    if (window.location?.origin) {
      if (isCapacitor && !isDev) {
        throw new Error(
          'Missing VITE_UPLOAD_SIGN_URL for native production build. Set it to an HTTPS signer endpoint.',
        );
      }
      return `${window.location.origin}/api/sign-upload`;
    }
  }

  throw new Error(
    'Missing VITE_UPLOAD_SIGN_URL for presigned uploads (or no browser origin available for /api/sign-upload fallback).',
  );
}

function buildSigningEndpointCandidates(endpoint: string): string[] {
  const candidates = [endpoint];
  try {
    const parsed = new URL(endpoint);
    // Common migration path: old HTTP :3100 signer -> HTTPS reverse-proxy on default 443.
    if (parsed.protocol === 'http:' && parsed.port === '3100') {
      const httpsFallback = new URL(endpoint);
      httpsFallback.protocol = 'https:';
      httpsFallback.port = '';
      candidates.push(httpsFallback.toString());
    }
  } catch {
    // Ignore malformed URL here; regular fetch path will throw a clear error.
  }
  return Array.from(new Set(candidates));
}

function estimateUploadedUrl(uploadUrl: string): string {
  const base = uploadUrl.split('?')[0];
  return base;
}

function getPresignedBucket(uploadUrl: string): string | null {
  try {
    const parsed = new URL(uploadUrl);
    const hostParts = parsed.hostname.split('.');
    // virtual-hosted-style: <bucket>.s3.<region>.amazonaws.com
    if (hostParts.length > 1 && hostParts[1] === 's3') {
      return hostParts[0] || null;
    }
    // path-style: s3.<region>.amazonaws.com/<bucket>/...
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return pathParts[0] || null;
  } catch {
    return null;
  }
}

function isNoSuchBucketResponse(status: number, body: string): boolean {
  if (status !== 404) return false;
  return body.includes('NoSuchBucket') || body.includes('Bucket not found');
}

export async function uploadPhotoWithPresignedUrl(
  params: PresignedRequest,
  onProgress?: ProgressHandler,
): Promise<string> {
  const { uid, photoNum, file, idToken } = params;
  const endpoint = getSigningEndpoint();
  const signingEndpoints = buildSigningEndpointCandidates(endpoint);
  if (onProgress) onProgress(0);
  const uploadFile = await withTimeout(normalizeUploadFile(file), 15000, 'File normalization');
  if (onProgress) onProgress(5);

  let lastError = '';
  for (const candidate of signingEndpoints) {
    let signRes: Response;
    const signTimeout = createTimeoutSignal(10000);
    try {
      signRes = await fetch(candidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        ...(signTimeout.signal ? { signal: signTimeout.signal } : {}),
        body: JSON.stringify({
          uid,
          photoNum,
          fileName: uploadFile.name,
          contentType: uploadFile.type || 'application/octet-stream',
          size: uploadFile.size,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      lastError = `Sign request failed at ${candidate}: ${detail}`;
      continue;
    } finally {
      signTimeout.cleanup();
    }

    if (!signRes.ok) {
      const data = await signRes.json().catch(() => ({}));
      const errorMessage = data.error || `Server Error (${signRes.status})`;
      lastError = `Signing failed at ${candidate}: ${errorMessage}`;
      continue;
    }

    const signed = (await signRes.json()) as PresignedResponse;
    if (!signed.uploadUrl) {
      lastError = `Signing response missing uploadUrl at ${candidate}`;
      continue;
    }

    if (onProgress) onProgress(25);

    const method = signed.method || 'PUT';
    const uploadHeaders: Record<string, string> = {
      ...(signed.headers || {}),
    };

    if (!uploadHeaders['Content-Type'] && uploadFile.type) {
      uploadHeaders['Content-Type'] = uploadFile.type;
    }

    let uploadRes: Response;
    const uploadTimeout = createTimeoutSignal(60000);
    try {
      uploadRes = await fetch(signed.uploadUrl, {
        method,
        headers: uploadHeaders,
        ...(uploadTimeout.signal ? { signal: uploadTimeout.signal } : {}),
        body: uploadFile,
      });
    } catch (error) {
      const uploadOrigin = (() => {
        try {
          return new URL(signed.uploadUrl).origin;
        } catch {
          return signed.uploadUrl;
        }
      })();
      const detail = error instanceof Error ? error.message : String(error);
      lastError = `Could not upload to storage (${uploadOrigin}) via signer ${candidate}: ${detail}`;
      continue;
    } finally {
      uploadTimeout.cleanup();
    }

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      const bucket = getPresignedBucket(signed.uploadUrl);
      lastError =
        `File upload failed (${uploadRes.status}) via signer ${candidate}` +
        `${bucket ? ` bucket=${bucket}` : ''}: ${text || 'No response body'}`;
      // Fail over to the next signer candidate if this one signed to a missing bucket.
      if (isNoSuchBucketResponse(uploadRes.status, text)) {
        continue;
      }
      continue;
    }

    if (onProgress) onProgress(100);
    return signed.fileUrl || estimateUploadedUrl(signed.uploadUrl);
  }

  throw new Error(
    lastError ||
      `Could not complete upload. Tried signer endpoints: ${signingEndpoints.join(' , ')}`,
  );
}
