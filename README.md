<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2f97dad7-97ab-4f08-85bc-0bbb4cc576e5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend Modes

- `npm run dev` or `npm run server:full`
  - Runs unified local server (`server.ts`) on `http://localhost:3000`
  - Serves frontend + `/api/sign-upload`
- `npm run server:dev`
  - Runs signer-only backend (`aws/signer-v2/server.mjs`) on `http://localhost:3100`

If you use `server:dev`, set `VITE_UPLOAD_SIGN_URL=http://localhost:3100/api/sign-upload`.
For Android/iOS release builds, set `VITE_UPLOAD_SIGN_URL` to an HTTPS endpoint on your domain (for example: `https://api.yourdomain.com/api/sign-upload`).
