/**
 * Supabase client — single initialization point
 * ------------------------------------------------------------------
 * Every other module talks to Supabase only through
 * `window.AimersSupabase`. Nothing else in the app calls
 * `createClient` directly, so there is exactly one client instance
 * and one place to change initialization behavior.
 *
 * Requires the Supabase JS library to be loaded first (CDN script
 * tag in index.html) and js/config.js to be loaded before this file.
 * ------------------------------------------------------------------
 */
(function initSupabaseClient() {
  const cfg = window.AIMERS_CONFIG || {};
  const isPlaceholder =
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL' ||
    cfg.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY';

  if (isPlaceholder) {
    // Do NOT throw here — throwing would break the whole page before
    // app.js gets a chance to decide (dev mock vs. real error state).
    // Flag it instead; auth-service.js checks this flag explicitly.
    window.AimersSupabase = null;
    window.AIMERS_SUPABASE_CONFIG_MISSING = true;
    console.warn(
      '[Aimers] Supabase is not configured yet — fill in js/config.js ' +
      '(SUPABASE_URL and SUPABASE_ANON_KEY) with your project\'s values.'
    );
    return;
  }

  window.AimersSupabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,   // real, official session persistence — fixes the Phase 2 in-memory-only limitation
      autoRefreshToken: true,
      detectSessionInUrl: true, // required to pick up the password-recovery link's token from the URL
    },
  });
  window.AIMERS_SUPABASE_CONFIG_MISSING = false;
})();
