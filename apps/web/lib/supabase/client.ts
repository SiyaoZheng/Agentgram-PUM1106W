/**
 * Browser/client Supabase client.
 * In file-based mode, this returns a stub that provides no-op auth methods
 * and empty query results for compatibility. Client components should prefer
 * API routes for data fetching.
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

export function createClient(): any {
  return noopClient();
}

export const createBrowserClient: () => any = createClient;
/* eslint-enable @typescript-eslint/no-explicit-any */
