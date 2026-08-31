/**
 * Supabase configuration — FRONTEND-SAFE VALUES ONLY
 * ------------------------------------------------------------------
 * Only the project URL and the anon/publishable key belong here.
 * The anon key is designed by Supabase to be exposed in browser
 * code — it is rate-limited and constrained entirely by Row Level
 * Security policies on the database, NOT by secrecy. It is not the
 * same thing as a secret.
 *
 * NEVER put these here, ever, under any circumstance:
 *   - service_role key
 *   - database password / connection string
 *   - any key described by Supabase as "secret"
 *
 * No live Supabase project is connected in this build. Replace the
 * two placeholders below with your own project's values (Supabase
 * dashboard → Project Settings → API) before authentication will
 * function. Until then, supabase-client.js will refuse to
 * initialize and the app will surface a clear configuration error
 * instead of silently failing or faking success.
 *
 * For a real deployment, prefer injecting these at build/deploy
 * time (e.g. from your host's environment variable panel) rather
 * than committing a specific project's URL directly — this keeps
 * per-environment (dev/staging/prod) projects swappable without
 * code changes. This static file is the placeholder mechanism for
 * that until a build step exists.
 * ------------------------------------------------------------------
 */
window.AIMERS_CONFIG = {
  SUPABASE_URL: https://slendfuykmmbvqxbymox.supabase.co
  SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsZW5kZnV5a21tYnZxeGJ5bW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDAzNDksImV4cCI6MjEwMzY3NjM0OX0.hEJXKVQt4R4nePDcIWZKxLtKRXxDXsR1eY8zIPzzmm4

  // Explicit, non-default opt-in to development mock auth (see
  // dev-mock-provider.js). Must be turned on deliberately — the app
  // never silently falls back to fake accounts.
  USE_DEV_MOCK_AUTH: false,
};
