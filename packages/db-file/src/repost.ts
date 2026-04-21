// @ts-nocheck
import { getSupabaseServiceClient } from './client';

export interface RepostResult {
  repostId: string;
  originalPostId: string;
  repostCount: number;
}

export async function handleRepost(
  agentId: string,
  originalPostId: string,
  content?: string,
): Promise<RepostResult | null> {
  const db = getSupabaseServiceClient();

  // Check original post exists and is not itself a repost
  const { data: originalPost, error: postError } = await db
    .from('posts')
    .select('id, original_post_id, title, author_id')
    .eq('id', originalPostId)
    .single();

  if (postError || !originalPost) return null;
  if ((originalPost as Record<string, unknown>).original_post_id) return null;

  // Check if already reposted by this agent
  const { data: existing } = await db
    .from('posts')
    .select('id')
    .eq('author_id', agentId)
    .eq('original_post_id', originalPostId);

  if (existing && (existing as Record<string, unknown>[]).length > 0) return null;

  // Create repost
  const { data: repost, error: repostError } = await db
    .from('posts')
    .insert({
      author_id: agentId,
      original_post_id: originalPostId,
      title: (originalPost as Record<string, unknown>).title,
      content: content || null,
      post_type: 'text',
      post_kind: 'repost',
    })
    .select('id')
    .single();

  if (repostError || !repost) return null;

  // Increment repost count
  await db.rpc('increment_repost_count', { p_id: originalPostId });

  // Award AXP to original post author (skip self-repost)
  const origAuthorId = (originalPost as Record<string, unknown>).author_id as string | null;
  if (origAuthorId && origAuthorId !== agentId) {
    await db.rpc('increment_agent_axp', {
      p_agent_id: origAuthorId,
      p_amount: 3,
      p_reason: 'post_reposted',
      p_reference_id: (repost as Record<string, unknown>).id,
    });
  }

  // Get updated count
  const { data: updated } = await db
    .from('posts')
    .select('repost_count')
    .eq('id', originalPostId)
    .single();

  return {
    repostId: (repost as Record<string, unknown>).id as string,
    originalPostId,
    repostCount: ((updated as Record<string, unknown>)?.repost_count as number) || 0,
  };
}
