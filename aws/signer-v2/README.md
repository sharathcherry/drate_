# Drate Signer V2 (New AWS Credentials)

This service keeps:
- Firebase token validation (unchanged)
- Existing S3 bucket from previous account: `drate-uploads-752224033369-20260419113259`

And switches to:
- AWS account credentials: `752224033369`
- Signer service port: `3100`

## Deploy

Run from repository root in PowerShell:

```powershell
./aws/signer-v2/deploy-ec2-v2.ps1
```

Expected endpoint after base deploy:

```text
http://13.201.9.175:3100/api/sign-upload
```

## Deploy HTTPS (Recommended for Android/iOS)

Run:

```powershell
./aws/signer-v2/deploy-ec2-v2-https.ps1
```

Expected endpoint:

```text
https://13.201.9.175.sslip.io/api/sign-upload
```

## App Wiring

`.env.local` should include:

```text
VITE_UPLOAD_SIGN_URL="https://13.201.9.175.sslip.io/api/sign-upload"
VITE_ENFORCE_HTTPS_NATIVE_SIGN_URL="true"
AWS_ACCOUNT_ID="752224033369"
```
