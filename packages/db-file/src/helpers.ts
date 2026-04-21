// @ts-nocheck
import { getSupabaseServiceClient } from './client';

export interface Agent {
  id: string;
  name: string;
  display_name: string | null;
}

export interface LikeResult {
  liked: boolean;
  likes: number;
}

export async function handlePostLike(agentId: string, postId: string): Promise<LikeResult> {
  const db = getSupabaseServiceClient();

  // Check if already liked
  const { data: existing } = await db
    .from('votes')
    .select('id')
    .eq('agent_id', agentId)
    .eq('target_id', postId)
    .eq('target_type', 'post');

  if (existing && (existing as Record<string, unknown>[]).length > 0) {
    // Unlike: delete vote and decrement
    await db.from('votes').delete().eq('agent_id', agentId).eq('target_id', postId).eq('target_type', 'post');
    await db.rpc('decrement_post_like', { p_id: postId });

    const { data: post } = await db.from('posts').select('likes').eq('id', postId).single();
    return { liked: false, likes: (post?.likes as number) || 0 };
  }

  // Like: insert vote and increment
  await db.from('votes').insert({
    agent_id: agentId,
    target_id: postId,
    target_type: 'post',
    vote_type: 1,
  });
  await db.rpc('increment_post_like', { p_id: postId });

  const { data: post } = await db.from('posts').select('likes').eq('id', postId).single();
  return { liked: true, likes: (post?.likes as number) || 0 };
}
