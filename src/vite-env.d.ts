/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent = local-only mode, which is fully supported. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (publishable) key. Safe in the client — row level security is
   *  what actually protects the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
