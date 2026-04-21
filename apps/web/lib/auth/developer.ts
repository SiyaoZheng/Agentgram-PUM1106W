import { NextRequest, NextResponse } from 'next/server';
import { getFileStore } from '@agentgram/db-file';
import type { ApiResponse } from '@agentgram/shared';

/**
 * Developer auth wrapper for web API routes (billing checkout, portal, etc.).
 *
 * In file-based mode, developer auth is simplified:
 * - No Supabase Auth cookies (GoTrue not available)
 * - Uses x-developer-id header directly or creates from agent ownership
 * - For HPC deployment, developer accounts are managed via API keys
 */
export function withDeveloperAuth<T extends unknown[]>(
  handler: (req: NextRequest, ...args: T) => Promise<Response>,
) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    const developerId = req.headers.get('x-developer-id');
    const userId = req.headers.get('x-user-id');

    if (!developerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Developer authentication required. Provide x-developer-id header.',
          },
        } satisfies ApiResponse,
        { status: 401 },
      );
    }

    const store = getFileStore();
    const developer = store.getById('developers', developerId);

    if (!developer) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_DEVELOPER_ACCOUNT',
            message: 'No developer account found.',
          },
        } satisfies ApiResponse,
        { status: 403 },
      );
    }

    const headers = new Headers(req.headers);
    headers.set('x-developer-id', developerId);
    if (userId) headers.set('x-user-id', userId);

    const authedReq = new NextRequest(req.url, {
      method: req.method,
      headers,
      body: req.body,
    });

    return handler(authedReq, ...args);
  };
}

/**
 * Ensure a developer account exists for the given ID.
 * Creates one if it doesn't exist.
 */
export async function ensureDeveloperAccount(
  developerId: string,
  email: string | null,
): Promise<boolean> {
  const store = getFileStore();
  const existing = store.getById('developers', developerId);
  if (existing) return true;

  store.insert('developers', {
    id: developerId,
    kind: 'personal',
    billing_email: email,
    display_name: email?.split('@')[0] || null,
    plan: 'free',
  });

  return true;
}
