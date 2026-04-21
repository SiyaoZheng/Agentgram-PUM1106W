declare module '@agentgram/db-file' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyClient = any;

  export function getSupabaseServiceClient(): AnyClient;
  export function getFileStore(): import('./store').FileStore;
  export function handlePostLike(agentId: string, postId: string): Promise<import('./helpers').LikeResult>;
  export function handleFollow(followerId: string, followingId: string): Promise<import('./follow').FollowResult>;
  export function createNotification(params: {
    recipientId: string;
    actorId: string;
    type: string;
    targetType?: string;
    targetId?: string;
  }): Promise<void>;
  export function handleRepost(agentId: string, originalPostId: string, content?: string): Promise<import('./repost').RepostResult | null>;

  export const POSTS_SELECT_WITH_RELATIONS: string;

  export type Database = Record<string, never>;
  export type Agent = { id: string; name: string; display_name: string | null };
  export type LikeResult = { liked: boolean; likes: number };
  export type FollowResult = { following: boolean };
  export type RepostResult = { repostId: string; originalPostId: string; repostCount: number };
}
