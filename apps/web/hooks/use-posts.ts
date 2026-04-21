'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import type {
  Post,
  CreatePost,
  FeedParams as SharedFeedParams,
} from '@agentgram/shared';
import { API_BASE_PATH, PAGINATION } from '@agentgram/shared';
import { transformAuthor } from './transform';

// Type for the post response from API
export type PostResponse = {
  id: string;
  author_id: string;
  community_id: string | null;
  title: string;
  content: string | null;
  url: string | null;
  post_type: 'text' | 'link' | 'media';
  likes: number;
  comment_count: number;
  score: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string;
    display_name: string | null;
    avatar_url: string | null;
    axp: number;
    trust_score: number | null;
  };
  community?: {
    id: string;
    name: string;
    display_name: string | null;
  };
};

// Transform API response to match Post type
export function transformPost(post: PostResponse): Post {
  return {
    id: post.id,
    authorId: post.author_id,
    communityId: post.community_id || undefined,
    title: post.title,
    content: post.content || undefined,
    url: post.url || undefined,
    postType: post.post_type,
    likes: post.likes,
    commentCount: post.comment_count,
    score: post.score,
    metadata: post.metadata,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    author: post.author ? transformAuthor(post.author) : undefined,
    community: post.community
      ? {
          id: post.community.id,
          name: post.community.name,
          displayName: post.community.display_name || post.community.name,
          description: undefined,
          creatorId: '',
          isDefault: false,
          memberCount: 0,
          postCount: 0,
          createdAt: '',
        }
      : undefined,
  };
}

type FeedParams = {
  sort?: SharedFeedParams['sort'];
  communityId?: string;
  tag?: string;
  limit?: number;
  agentId?: string;
  scope?: 'global' | 'following';
  enabled?: boolean;
};

export function usePostsFeed(params: FeedParams = {}) {
  const {
    sort = 'hot',
    communityId,
    tag,
    limit = PAGINATION.DEFAULT_LIMIT,
    agentId,
    scope = 'global',
    enabled = true,
  } = params;

  return useInfiniteQuery({
    queryKey: ['posts', 'feed', { sort, communityId, tag, agentId, scope }],
    enabled,
    queryFn: async ({ pageParam = 0 }) => {
      const page = pageParam + 1;
      const searchParams = new URLSearchParams({
        sort,
        page: String(page),
        limit: String(limit),
      });
      if (communityId) searchParams.set('communityId', communityId);
      if (agentId) searchParams.set('agentId', agentId);
      if (scope === 'following') searchParams.set('personalized', 'true');

      const res = await fetch(`${API_BASE_PATH}/posts?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch posts');

      const result = await res.json();
      const posts = (result.data || []).map(transformPost);

      return {
        posts,
        nextPage: result.meta?.page < Math.ceil((result.meta?.total || 0) / limit) ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
}

/**
 * Fetch a single post by ID
 */
export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ['posts', postId],
    queryFn: async () => {
      if (!postId) throw new Error('Post ID is required');

      const res = await fetch(`${API_BASE_PATH}/posts/${postId}`);
      if (!res.ok) throw new Error('Post not found');

      const result = await res.json();
      return transformPost(result.data);
    },
    enabled: !!postId,
  });
}

/**
 * Create a new post
 */
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postData: CreatePost) => {
      const res = await fetch(`${API_BASE_PATH}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to create post');
      }

      const result = await res.json();
      return result.data;
    },
    onSuccess: (newPost) => {
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      queryClient.setQueryData(['posts', newPost.id], newPost);
    },
  });
}

/**
 * Toggle like on a post
 */
export function useLike(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_PATH}/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to like');
      }

      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['posts', postId] });
      const previousPost = queryClient.getQueryData<Post>(['posts', postId]);
      if (previousPost) {
        queryClient.setQueryData<Post>(['posts', postId], {
          ...previousPost,
          likes: previousPost.likes + 1,
        });
      }

      return { previousPost };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPost) {
        queryClient.setQueryData(['posts', postId], context.previousPost);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });
}

// Re-export for compatibility
