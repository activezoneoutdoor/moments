# AZO Moments | Active Zone Outdoor

AZO Moments lists Active Zone Outdoor events (date, location, leader, partner groups, group size) and collects each event's photos and videos from participants. Staff create an event and share its upload link, for example in the group chat. Participants upload without an account, and the files go straight into an automatically named folder in a Google Workspace Shared Drive, such as `2026/2026-09-27_SUP_Ayia-Napa`. Staff approve or hide uploads and publish the album on the event's public page.

Everything runs on free tiers: the static site on GitHub Pages, data and sign-in on Supabase, and small Supabase Edge Functions that talk to Google Drive. Media never passes through Supabase. It is stored in the Workspace's pooled Drive storage and uploaded from the browser directly to Google.

| Page | Who | Purpose |
| --- | --- | --- |
| `/` | Public | Upcoming events and past albums. The header's **Staff sign in** button (**Admin** once signed in) opens the admin section |
| `/event/?slug=<slug>` | Public | Event details and the published album |
| `/upload/?t=<token>` | Anyone with the link | Upload photos and videos (up to 2 GB each, resumable) |
| `/admin/` | Staff (`@activezoneoutdoor.cy`) | Create/edit events, copy/close/rotate upload links, review media, publish albums |

## Supabase setup

1. Create a Supabase project and enable Google under **Authentication → Providers**. Create a Google OAuth web client and put its client ID and secret in Supabase's provider settings. Do not put the Google client secret or a Supabase service-role key in this repository.
2. Add Supabase's Google callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client's authorized redirect URIs.
3. In Supabase **Authentication → URL Configuration**, set the site URL and allow these redirect URLs:
   - `http://localhost:3000/**`
   - `https://moments.activezoneoutdoor.cy/**`

   This is Supabase's allowlist of where sign-in may return to. Staff sign in on `/admin/` and are sent back there.
4. Copy `.env.example` to `.env.local` for local development and fill in the Supabase project URL and publishable/anon key. These browser values are public by design; never use a service-role key here.

5. Run `supabase/migrations/20260927000000_restrict_workspace_signups.sql` in the Supabase SQL Editor. Then enable **Authentication → Hooks → Before User Created** and select `public.enforce_azo_workspace_signup`. This hook rejects account creation unless the account is a Google identity with the approved domain.
6. Run `supabase/migrations/20260928000000_events_albums.sql` in the SQL Editor (or `supabase db push`). It creates `events`, `event_upload_links` and `media` with Row Level Security. Staff accounts can manage everything. The public can read only published events and the approved media of published albums. Upload tokens are never readable by the public.
7. Run `supabase/migrations/20260930000000_archive_events.sql`. It adds the `archived` status. Staff archive an event from its panel instead of deleting it: the event and album leave the public site, Drive link sharing (including the event photo) is removed, and the upload link closes. Media records, the Drive folder and the event photo are kept, and **Restore event** brings the event back as a draft.
8. Run `supabase/migrations/20261001000000_event_photo_in_drive.sql`. Event photos are stored as `_event-photo.jpg` in the event's Drive folder and shared by link, so they use no Supabase storage or bandwidth. Staff pick the photo in the event form; it is resized in the browser to at most 1920px, and pages load it at the size they need. An approved album photo can be used instead; whichever was chosen last is shown. If your project has an `event-covers` bucket from an earlier version, delete it under **Storage** in the Supabase dashboard.
9. Run `supabase/migrations/20261002000000_media_source.sql`. It records whether an album file came from the upload page or was added directly in Drive.
10. Run `supabase/migrations/20261003000000_public_upload_link.sql`. Public event pages show whether photo uploads are open and, while they are, the upload link, so anyone at the event can find it. Anyone who sees the page can then upload, but everything goes to **To review** first. Close uploads or create a new link from the admin panel to stop it.
11. Run `supabase/migrations/20261004000000_bookings.sql`. It adds seat booking (see **Bookings** below).
12. Run `supabase/migrations/20261005000000_booking_emails.sql`. It adds booking emails (see **Booking emails** below).
13. Run `supabase/migrations/20261006000000_event_cancellation_and_leader_emails.sql`. It adds event cancellation emails and leader notifications (see **Booking emails** below).

## Google Drive setup (album storage)

1. **Create a Shared Drive** in Google Drive, e.g. "AZO Albums". Open it and copy its ID from the URL (`https://drive.google.com/drive/folders/<shared-drive-id>`).
2. **Create an OAuth client** (no service-account key needed; the organisation policy `iam.disableServiceAccountKeyCreation` can stay on). In [Google Cloud Console](https://console.cloud.google.com/), in the same project as the Supabase sign-in client or a new one:
   - Enable the **Google Drive API**.
   - Under **Google Auth Platform → Audience** (older consoles: **OAuth consent screen**), make sure the user type is **Internal**. Internal apps need no Google verification, and their refresh tokens don't expire after 7 days.
   - Under **Clients → Create client**, choose **Web application**, name it "AZO Drive uploader", and add the authorised redirect URI `https://developers.google.com/oauthplayground`. Copy the client ID and client secret.
3. **Authorise it once with a staff account.** Use a stable account that is a **Content manager** of the Shared Drive.
   - Open [OAuth Playground](https://developers.google.com/oauthplayground). Click ⚙ and tick **Use your own OAuth credentials**, then paste the client ID and secret.
   - In **Step 1**, type the scope `https://www.googleapis.com/auth/drive` into the input box and click **Authorize APIs**. Sign in with that staff account.
   - In **Step 2**, click **Exchange authorization code for tokens**, then copy the **Refresh token**.

   Use the full `drive` scope: the narrower `drive.file` scope can't create folders in a Shared Drive the app didn't create. The files belong to the Shared Drive, not to that account. If the account is later suspended or removes the app's access, uploads fail with an "authorisation expired or was revoked" error. Redo this step with another staff account and update the secret.
4. **Allow public album links.** Published albums share each approved file as "anyone with the link can view", so photos can be shown on the public page. In the Google Admin console, open **Apps → Google Workspace → Drive and Docs → Sharing settings** and allow sharing outside the organisation, at least for the organisational unit that owns the Shared Drive. In the Shared Drive's settings, allow people outside the organisation to access files. Unpublished and hidden uploads stay private.

## Edge Functions

The functions in `supabase/functions/` hold the Google credentials; the browser never sees them.

| Function | Caller | What it does |
| --- | --- | --- |
| `upload-start` | Participant upload page | Checks the upload link, creates the event's Drive folder on first use, and opens a resumable Drive upload session for the browser |
| `upload-finish` | Participant upload page | Confirms the file is in the event folder and records it for review |
| `album-publish` | Staff dashboard | Publishes or unpublishes an album and syncs Drive link sharing, so only approved files are public |
| `media-thumbnail` | Staff dashboard | Returns an upload's preview image through the app's Drive access, so staff browsers don't need Google cookies (which browsers often block for other sites) |
| `event-photo` | Staff dashboard | Saves, replaces or removes the event photo in the event's Drive folder and turns its link sharing on or off when the event is restored or archived |
| `album-sync` | Staff dashboard | Brings an event's album in line with its Drive folder: files added there go to review, files deleted there leave the album, renames are picked up, and the folder is renamed/moved to match the event |
| `send-emails` | Site, and a cron job | Sends queued booking emails through Gmail and queues day-before reminders |

Deploy with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase link --project-ref <project-ref>
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID=<client-id> \
  GOOGLE_OAUTH_CLIENT_SECRET=<client-secret> \
  GOOGLE_OAUTH_REFRESH_TOKEN=<refresh-token> \
  AZO_SHARED_DRIVE_ID=<shared-drive-id> \
  ALLOWED_ORIGINS=https://moments.activezoneoutdoor.cy,http://localhost:3000
supabase functions deploy
```

`supabase/config.toml` deploys all functions with the gateway's JWT check off (`verify_jwt = false`, the same as `--no-verify-jwt`), so anonymous participants can call the upload functions; each function checks its own access (upload token or staff session). Keep the client secret and refresh token only in Supabase secrets; never commit them. Run `deno test --allow-env` inside `supabase/functions` for the unit tests.

### Bookings

- **Opening bookings:** in the event form, tick **Open for booking**, set **Max participants** (empty means no limit) and, optionally, when bookings close (by default when the event starts). The **Open/Close bookings** button in the event panel does the same.
- **Booking:** participants book on the public event page without an account: name, email, optional phone, and up to 4 seats with a name for each. While seats last, bookings are confirmed instantly; after that they join a waitlist.
- **The private link:** after booking, participants get a private link (`/booking/?t=…`) to view or cancel. The page also remembers it on their device. No emails are sent yet, so they're asked to save the link.
- **Waitlist:** when a confirmed booking is cancelled, or staff raise **Max participants**, waiting bookings are confirmed automatically, oldest first. A booking needing more seats than are free is skipped so a smaller one behind it can go ahead. Nothing is promoted once the event has started.
- **Staff:** the event panel's **Bookings** section shows seats booked, the confirmed list, the waitlist and cancellations. Staff can cancel bookings and export the participant list as CSV, one row per attendee.
- **Safe counting:** seats are counted with the event row locked, so two people can't take the last seat at the same time.

### Booking emails

Participants get an email when they book (confirmed or waitlisted), when a seat frees up and they're promoted, when a booking is cancelled (by them, by staff, or because the event was cancelled), and a reminder the day before. Every email includes their private booking link. Replies go to the event's leader email, or to `EMAIL_REPLY_TO`.

Emails are sent through Gmail as a Workspace user, so they're free (about 2,000 a day) and use your domain's existing email authentication. Supabase Edge Functions can't use SMTP ports, so this uses the Gmail API.

1. **Create the sender** as a Workspace user, `moments@activezoneoutdoor.cy`.
2. **Enable the Gmail API** in the Google Cloud project that holds the OAuth client.
3. **Authorise it once.** In [OAuth Playground](https://developers.google.com/oauthplayground), with the same client ID and secret, enter the scope `https://www.googleapis.com/auth/gmail.send`. Click **Authorize APIs**, sign in as `moments@activezoneoutdoor.cy`, and exchange the code for tokens. Copy the **refresh token**.
4. **Set the secrets:**
   ```sh
   supabase secrets set \
     GMAIL_REFRESH_TOKEN=<refresh token for moments@> \
     EMAIL_FROM="AZO Moments <moments@activezoneoutdoor.cy>" \
     EMAIL_REPLY_TO=<where replies go when an event has no leader email> \
     SITE_URL=https://moments.activezoneoutdoor.cy
   supabase functions deploy
   ```
   Without `GMAIL_REFRESH_TOKEN`, the Drive token is used, and it then needs the `gmail.send` scope too.
5. **Schedule sending.** Reminders and retries need a regular run. In Supabase, enable the **pg_cron** and **pg_net** extensions (**Database → Extensions**), then run this in the SQL Editor:
   ```sql
   select cron.schedule('azo-send-emails', '*/15 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-emails',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     );
   $$);
   ```

**Cancelling an event:** setting an event to **Cancelled** cancels all its active bookings, and each participant gets an "event cancelled" email. It includes the optional **Message to participants** from the event form. The form asks for confirmation first, showing how many bookings will be cancelled. Setting the event back to published doesn't restore the bookings.

**Leader notifications:** set per event in the event form, sent to the event's leader email:
- **Every booking change:** an email for each new booking, waitlist entry, promotion and cancellation, with contact details and current seats. Replies go to the participant.
- **Daily summary:** from 19:00 Cyprus time, one email listing the day's changes and current totals. It's only sent on days with changes, and needs the cron job above.

How it works:
- Database triggers queue an email in `email_outbox` for every new booking and status change, including automatic waitlist promotions.
- The site calls `send-emails` straight after booking or cancelling; the cron job catches the rest.
- An email that's no longer true by the time it's sent, such as a confirmation for a booking cancelled meanwhile, is skipped.
- Failures are retried up to 5 times. The event panel shows each booking's latest email and any failure with Google's reason.

### Working in Drive directly

Drive decides which files an album has; the app decides what's approved and published. Staff may add, remove or rename files in an event's folder (subfolders included):
- The app syncs when an event is opened in the admin panel, when **Sync with Drive** is pressed, and right before an album is published.
- Photos and videos added in Drive appear under **To review**, marked "Added in Drive" with the name of who added them.
- Files deleted or moved out of the folder are removed from the album, so they can never break publishing.
- If the event's date, activity or location changes, the folder is renamed and moved to `YYYY/YYYY-MM-DD_Activity_Location`.
- An event without a folder links an existing folder with exactly that generated name, and imports its media for review.
- If the whole event folder is deleted or trashed, the sync changes nothing and warns instead; restore the folder from Drive's trash.

### Troubleshooting uploads

If an upload fails with "Cannot create folders in the Shared Drive" (visible in the `upload-start` logs), check `AZO_SHARED_DRIVE_ID`, that the authorised account is a Content manager of that Shared Drive, and that the refresh token was created with the full `https://www.googleapis.com/auth/drive` scope.


If an upload fails with "Couldn't reach the upload service", the browser got no answer from `upload-start`:
- In Supabase, open **Edge Functions → upload-start**: check that it exists and look at its **Logs**.
- Redeploy with `supabase functions deploy` so `verify_jwt = false` from `supabase/config.toml` applies.
- If the error says the website isn't allowed to upload, add that exact address (e.g. `https://moments.activezoneoutdoor.cy`) to the `ALLOWED_ORIGINS` secret and redeploy.

## Run locally

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project. Leave `NEXT_PUBLIC_BASE_PATH` empty for local development.
2. In Supabase **Authentication → URL Configuration**, add `http://localhost:3000/**` to the allowed redirect URLs.
3. From the repository folder, run `npm install`, then `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000) for the public events page, or [http://localhost:3000/admin/](http://localhost:3000/admin/) to sign in with an `@activezoneoutdoor.cy` Google Workspace account.

The app requests Google with `hd=activezoneoutdoor.cy` to guide account selection, then checks the returned account email before showing AZO Moments. Supabase Auth's Before User Created hook enforces the domain for new accounts. The database's Row Level Security policies apply the same domain check to every staff write. Participants never sign in; the upload link token is their only access.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` builds and deploys this repository to `https://moments.activezoneoutdoor.cy/` whenever a change is pushed to `main`.

1. **Finish Supabase setup first.** In the Supabase project, enable Google sign-in, apply the workspace signup migration and hook above, and set the production Site URL to `https://moments.activezoneoutdoor.cy/`.
2. **Allow the admin redirect in Supabase.** Under **Authentication → URL Configuration → Redirect URLs**, add `https://moments.activezoneoutdoor.cy/**` (keep `http://localhost:3000/**` there too if you run locally).
3. **Add the public Supabase browser settings to GitHub.** Open the repository on GitHub, then go to **Settings → Secrets and variables → Actions → Variables → New repository variable**. Add both:
   - Name: `NEXT_PUBLIC_SUPABASE_URL` · Value: the Supabase project's URL.
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY` · Value: the project's publishable key (or legacy anon key).

   These two values are included in the public website bundle, so they are not secrets. Keep the Google OAuth client secret in Supabase's Google provider settings. Never put a Supabase service-role key in GitHub variables or the app.
4. **Enable Pages deployment.** In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. Under **Custom domain**, enter `moments.activezoneoutdoor.cy`, and at the DNS provider add a `CNAME` record for `moments` pointing to `<github-owner>.github.io`. Once the DNS check passes, tick **Enforce HTTPS**.
5. **Commit and push to `main`.** Make sure the commit includes `package-lock.json` and `.github/workflows/pages.yml`. Pushing to `main` starts the deploy automatically.
6. **Check the result.** In the repository, open **Actions**, select the latest **Deploy to GitHub Pages** run, and wait for both build and deploy jobs to finish successfully. The site will be at [https://moments.activezoneoutdoor.cy/](https://moments.activezoneoutdoor.cy/).

The workflow uses the custom domain's root path; no `/moments` URL prefix or manual build upload is needed.
