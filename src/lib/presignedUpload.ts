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

function getSigningEndpoint(): string {
  const endpoint = (import.meta as any).env.VITE_UPLOAD_SIGN_URL as string | undefined;
  if (endpoint) {
    return endpoint;
  }

  // Handle Capacitor/Mobile: window.location.origin is often http://localhost
  // which won't work for hitting a remote backend.
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isCapacitor = (window as any).Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:';
    
    if (isCapacitor && isLocalhost && !endpoint) {
       console.warn('Capacitor detected: Accessing /api/sign-upload on localhost will likely fail. Please set VITE_UPLOAD_SIGN_URL to your live server URL.');
    }

    if (window.location?.origin) {
      return `${window.location.origin}/api/sign-upload`;
    }
  }

  throw new Error(
    'Missing VITE_UPLOAD_SIGN_URL for presigned uploads (or no browser origin available for /api/sign-upload fallback).',
  );
}

function estimateUploadedUrl(uploadUrl: string): string {
  const base = uploadUrl.split('?')[0];
  return base;
}

export async function uploadPhotoWithPresignedUrl(
  params: PresignedRequest,
  onProgress?: ProgressHandler,
): Promise<string> {
  const { uid, photoNum, file, idToken } = params;
  const endpoint = getSigningEndpoint();
  const uploadFile = await normalizeUploadFile(file);

  if (onProgress) onProgress(0);

  let signRes: Response;
  try {
    signRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      signal: AbortSignal.timeout(10000), // 10s timeout to avoid indefinite 0% hang
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
    throw new Error(
      `Could not reach signing server. Check if your backend is running and env VITE_UPLOAD_SIGN_URL is correct. Detail: ${detail}`,
    );
  }

  if (!signRes.ok) {
    const data = await signRes.json().catch(() => ({}));
    const errorMessage = data.error || `Server Error (${signRes.status})`;
    throw new Error(`Signing failed: ${errorMessage}`);
  }

  const signed = (await signRes.json()) as PresignedResponse;
  if (!signed.uploadUrl) {
    throw new Error('Signing response missing uploadUrl');
  }

  if (onProgress) onProgress(20);

  const method = signed.method || 'PUT';
  const uploadHeaders: Record<string, string> = {
    ...(signed.headers || {}),
  };

  if (!uploadHeaders['Content-Type'] && uploadFile.type) {
    uploadHeaders['Content-Type'] = uploadFile.type;
  }

  let uploadRes: Response;
  try {
    uploadRes = await fetch(signed.uploadUrl, {
      method,
      headers: uploadHeaders,
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
    throw new Error(
      `Could not upload to storage (${uploadOrigin}). This is usually an S3 CORS/network issue for browser PUT uploads. ${detail}`,
    );
  }

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`File upload failed (${uploadRes.status}): ${text || 'No response body'}`);
  }

  if (onProgress) onProgress(100);

  return signed.fileUrl || estimateUploadedUrl(signed.uploadUrl);
}
