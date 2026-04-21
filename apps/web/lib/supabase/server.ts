/**
 * Server-side Supabase client.
 * In file-based mode, this re-exports the file store client
 * with the same interface shape as the Supabase SSR client.
 *
 * Note: auth.getUser() always returns null in file-based mode.
 * Protected routes that need developer auth should use the
 * x-developer-id header approach instead.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const createClient: () => Promise<any> = async () => {
  const { getSupabaseServiceClient } = await import('@agentgram/db-file');
  return getSupabaseServiceClient();
};
/* eslint-enable @typescript-eslint/no-explicit-any */
