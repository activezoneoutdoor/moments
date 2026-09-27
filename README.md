# AZO Studio | Active Zone Outdoor

AZO Studio manages contributed photo albums from Google Drive and Google Photos, and curates the albums shown in the public Active Zone Outdoor gallery. Photos remain in Google; this app does not host or upload image files. The static app can be hosted on GitHub Pages, with Supabase Auth handling Google sign-in and sessions.

## Supabase setup

1. Create a Supabase project and enable Google under **Authentication → Providers**. Create a Google OAuth web client and put its client ID and secret in Supabase's provider settings. Do not put the Google client secret or a Supabase service-role key in this repository.
2. Add Supabase's Google callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client's authorized redirect URIs.
3. In Supabase **Authentication → URL Configuration**, set the site URL and allow these redirect URLs:
   - `http://localhost:3000/`
   - `https://activezoneoutdoor.github.io/studio/`
4. Copy `.env.example` to `.env.local` for local development and fill in the Supabase project URL and publishable/anon key. These browser values are public by design; never use a service-role key here.

5. Run `supabase/migrations/20260927000000_restrict_workspace_signups.sql` in the Supabase SQL Editor. Then enable **Authentication → Hooks → Before User Created** and select `public.enforce_azo_workspace_signup`. This hook rejects account creation unless the account is a Google identity with the approved domain.

## Run locally

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project. Leave `NEXT_PUBLIC_BASE_PATH` empty for local development.
2. In Supabase **Authentication → URL Configuration**, add `http://localhost:3000/` to the allowed redirect URLs.
3. From the repository folder, run `npm install`, then `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000) and sign in with an `@activezoneoutdoor.cy` Google Workspace account.

The app requests Google with `hd=activezoneoutdoor.cy` to guide account selection, then checks the returned account email before showing AZO Studio. Supabase Auth's Before User Created hook enforces the domain for new accounts. Before storing album metadata or publishing controls, apply Row Level Security policies to those records. Photos themselves remain in Google Drive and Google Photos.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` builds the static export and deploys it to Pages on pushes to `main`. In the repository's **Settings → Secrets and variables → Actions → Variables**, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The workflow sets the `/studio` base path for this repository. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Add the same Pages URL to Supabase's allowed redirect URLs.
