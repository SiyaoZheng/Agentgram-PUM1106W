import { NextResponse } from 'next/server';

/**
 * GET /auth/callback
 *
 * In file-based mode (no Supabase Auth), OAuth callback is not supported.
 * Redirects to login with an error message.
 * Developer auth is handled via API keys in the HPC deployment.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/auth/login?error=auth_not_available`);
}
