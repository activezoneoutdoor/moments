# AZO Studio | Active Zone Outdoor

AZO Studio manages contributed photo albums from Google Drive and Google Photos, and curates the albums shown in the public Active Zone Outdoor gallery. Photos remain in Google; this app does not host or upload image files. The static app can be hosted on GitHub Pages, with Supabase Auth handling Google sign-in and sessions.

## Supabase setup

1. Create a Supabase project and enable Google under **Authentication → Providers**. Create a Google OAuth web client and put its client ID and secret in Supabase's provider settings. Do not put the Google client secret or a Supabase service-role key in this repository.
2. Add Supabase's Google callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client's authorized redirect URIs.
3. In Supabase **Authentication → URL Configuration**, set the site URL and allow these redirect URLs:
   - `http://localhost:3000/`
   - `https://studio.activezoneoutdoor.cy/`
4. Copy `.env.example` to `.env.local` for local development and fill in the Supabase project URL and publishable/anon key. These browser values are public by design; never use a service-role key here.

5. Run `supabase/migrations/20260927000000_restrict_workspace_signups.sql` in the Supabase SQL Editor. Then enable **Authentication → Hooks → Before User Created** and select `public.enforce_azo_workspace_signup`. This hook rejects account creation unless the account is a Google identity with the approved domain.

## Run locally

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project. Leave `NEXT_PUBLIC_BASE_PATH` empty for local development.
2. In Supabase **Authentication → URL Configuration**, add `http://localhost:3000/` to the allowed redirect URLs.
3. From the repository folder, run `npm install`, then `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000) and sign in with an `@activezoneoutdoor.cy` Google Workspace account.

The app requests Google with `hd=activezoneoutdoor.cy` to guide account selection, then checks the returned account email before showing AZO Studio. Supabase Auth's Before User Created hook enforces the domain for new accounts. Before storing album metadata or publishing controls, apply Row Level Security policies to those records. Photos themselves remain in Google Drive and Google Photos.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` builds and deploys this repository to `https://studio.activezoneoutdoor.cy/` whenever a change is pushed to `main`.

1. **Finish Supabase setup first.** In the Supabase project, enable Google sign-in, apply the workspace signup migration and hook above, and set the production Site URL to `https://studio.activezoneoutdoor.cy/`.
2. **Allow the app redirect in Supabase.** Under **Authentication → URL Configuration → Redirect URLs**, add `https://studio.activezoneoutdoor.cy/` (keep `http://localhost:3000/` there too if you run locally).
3. **Add the public Supabase browser settings to GitHub.** Open the repository on GitHub, then go to **Settings → Secrets and variables → Actions → Variables → New repository variable**. Add both:
   - Name: `NEXT_PUBLIC_SUPABASE_URL` · Value: the Supabase project's URL.
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY` · Value: the project's publishable key (or legacy anon key).

   These two values are included in the public website bundle, so they are not secrets. Keep the Google OAuth client secret in Supabase's Google provider settings. Never put a Supabase service-role key in GitHub variables or the app.
4. **Enable Pages deployment.** In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
5. **Commit and push to `main`.** Make sure the commit includes `package-lock.json` and `.github/workflows/pages.yml`. Pushing to `main` starts the deploy automatically.
6. **Check the result.** In the repository, open **Actions**, select the latest **Deploy to GitHub Pages** run, and wait for both build and deploy jobs to finish successfully. The site will be at [https://studio.activezoneoutdoor.cy/](https://studio.activezoneoutdoor.cy/).

The workflow uses the custom domain's root path; no `/studio` URL prefix or manual build upload is needed.
