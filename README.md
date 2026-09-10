# Fall Into Fitness

A static admin portal backed by Supabase Auth and Postgres. Participants do not need accounts: the challenge administrator records the names and weekly weights they provide.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `supabase-schema.sql`.
3. In **Authentication > Providers**, enable Email and create the one administrator account.
4. In the SQL Editor, run the commented `insert into public.admin_users` statement at the bottom of `supabase-schema.sql`, replacing the email with the admin account email.
5. Copy the Project URL and the public anon key from **Project Settings > API** into `supabase-config.js`.
6. In **Authentication > URL Configuration**, add the deployed Vercel URL to Site URL and Redirect URLs.

The anon key is intended for browser use. The database policies are the security boundary: only the account listed in `admin_users` can read or modify participants and check-ins. The leaderboard view exposes names, percentages, and latest check-in metadata, never raw weights.

## Vercel setup

Import this repository into Vercel with the default settings. This is a static site, so no build command or output directory is required. The app entry point is `index.html`.

For local use, open `index.html` directly. Once `supabase-config.js` has real values and the admin account is allowlisted, authentication and data writes will work from the Vercel domain.
