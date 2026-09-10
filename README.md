# Fall Into Fitness

A static Vercel app backed by Supabase Auth and Postgres.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `supabase-schema.sql`.
3. In **Authentication > Providers**, enable Email. For a quick start, disable email confirmation; for production, keep it enabled and configure the email templates.
4. Copy the Project URL and the public anon key from **Project Settings > API** into `supabase-config.js`.
5. In **Authentication > URL Configuration**, add the deployed Vercel URL to Site URL and Redirect URLs.

The anon key is intended for browser use. The database policies are the security boundary: users can only create/read their own participant and check-in rows. The public leaderboard view exposes names, percentages, and latest check-in metadata, never raw weights.

## Vercel setup

Import this repository into Vercel with the default settings. This is a static site, so no build command or output directory is required. The app entry point is `index.html`.

For local use, open `index.html` directly. Once `supabase-config.js` has real values, authentication and data writes will work from the Vercel domain.
