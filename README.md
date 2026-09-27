# Active Zone Studio

A private workspace starting with a photo albums landing page. Google sign-in is restricted on the server to verified Google Workspace accounts whose hosted domain and email domain are `activezoneoutdoor.cy`.

## Local setup

1. Create a Google OAuth 2.0 web client in the Active Zone Google Cloud project.
2. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
3. Copy `.env.example` to `.env.local` and fill in the OAuth client ID, client secret, and a long random `NEXTAUTH_SECRET`. Keep `.env.local` private; only `.env.example` belongs in this public repository.
4. Install dependencies with `npm install` and start the app with `npm run dev`.

The Google OAuth consent configuration should be internal to the Active Zone Workspace. Production deployment must set its own `NEXTAUTH_URL`, OAuth client credentials, and `NEXTAUTH_SECRET` through the hosting provider's secret manager. Never commit real credentials.
