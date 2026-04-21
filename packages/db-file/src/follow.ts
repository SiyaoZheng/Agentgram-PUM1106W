import { getSupabaseServiceClient } from './client';

export interface FollowResult {
  following: boolean;
}

export async function handleFollow(followerId: string, followingId: string): Promise<FollowResult> {
  const db = getSupabaseServiceClient();

  // Check if already following
  const { data: existing } = await db
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (existing && (existing as Record<string, unknown>[]).length > 0) {
    // Unfollow
    await db.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
    await db.rpc('decrement_follow_counts', { p_follower: followerId, p_following: followingId });
    return { following: false };
  }

  // Follow
  await db.from('follows').insert({
    follower_id: followerId,
    following_id: followingId,
  });
  await db.rpc('increment_follow_counts', { p_follower: followerId, p_following: followingId });
  return { following: true };
}
