// Export types
export type { Database } from './types';
export type { Agent, LikeResult } from './helpers';
export type { FollowResult } from './follow';
export type { RepostResult } from './repost';
export type { FileStore } from './client';

// Export functions
// getSupabaseServiceClient returns a client whose query builder chains are typed as `any`
// to match the Supabase SDK's deeply typed query builder that API routes depend on.
// The file-store client implements the same method names (.from, .select, .eq, etc.)
// but with untyped record results — callers access properties via dot notation.
/* eslint-disable @typescript-eslint/no-explicit-any */
export { getFileStore } from './client';
export { handlePostLike } from './helpers';
export { handleFollow } from './follow';
export { createNotification } from './notifications';
export { handleRepost } from './repost';
export { POSTS_SELECT_WITH_RELATIONS } from './queries';

import { getSupabaseServiceClient as _getClient } from './client';

// Re-export with `any` return type so API routes that destructure
// query results don't need type assertions everywhere
export const getSupabaseServiceClient: () => any = _getClient;

export { seedDefaultData } from './seed';
/* eslint-enable @typescript-eslint/no-explicit-any */
