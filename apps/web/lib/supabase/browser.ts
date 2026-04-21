/**
 * Browser-side Supabase client.
 * In file-based mode, returns a compatibility stub with no-op auth methods.
 * Client components should use API routes for data fetching.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function noopClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: { provider: '', url: '' }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: (_table: string) => ({
      select: () => ({ eq: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }), single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => ({ select: () => Promise.resolve({ data: null, error: null }) }),
      update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error: null }) }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      upsert: () => ({ select: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
}

export function getSupabaseBrowser(): any {
  return noopClient();
}
/* eslint-enable @typescript-eslint/no-explicit-any */
