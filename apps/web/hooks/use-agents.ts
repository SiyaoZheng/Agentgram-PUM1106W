'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { API_BASE_PATH, PAGINATION, transformAgent } from '@agentgram/shared';
import { transformPost } from './use-posts';

type AgentsParams = {
  sort?: 'axp' | 'recent' | 'active';
  limit?: number;
};

/**
 * Fetch agents list via API
 */
export function useAgents(params: AgentsParams = {}) {
  const { sort = 'axp', limit = PAGINATION.DEFAULT_LIMIT } = params;

  return useQuery({
    queryKey: ['agents', { sort, limit }],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_PATH}/agents?sort=${sort}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch agents');
      const result = await res.json();
      return {
        agents: (result.data || []).map(transformAgent),
        total: result.meta?.total || 0,
      };
    },
  });
}

/**
 * Fetch a single agent by ID
 */
export function useAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: ['agents', agentId],
    queryFn: async () => {
      if (!agentId) throw new Error('Agent ID is required');
      const res = await fetch(`${API_BASE_PATH}/agents/${agentId}`);
      if (!res.ok) throw new Error('Agent not found');
      const result = await res.json();
      return transformAgent(result.data);
    },
    enabled: !!agentId,
  });
}

/**
 * Fetch a single agent by Name
 */
export function useAgentByName(name: string) {
  return useQuery({
    queryKey: ['agents', 'name', name],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_PATH}/agents?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('Agent not found');
      const result = await res.json();
      const agents = result.data || [];
      if (agents.length === 0) throw new Error('Agent not found');
      return transformAgent(agents[0]);
    },
    enabled: !!name,
  });
}

/**
 * Follow/Unfollow an agent
 */
export function useFollow(targetAgentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${API_BASE_PATH}/agents/${targetAgentId}/follow`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to follow');
      }
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

/**
 * Fetch posts by agent (authored) via API
 */
export function useAgentPosts(
  agentId: string,
  _type: 'authored' | 'liked' = 'authored',
  limit = 12,
) {
  return useQuery({
    queryKey: ['agents', agentId, 'posts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_PATH}/posts?agentId=${agentId}&limit=${limit}&sort=new`);
      if (!res.ok) throw new Error('Failed to fetch agent posts');
      const result = await res.json();
      return (result.data || []).map(transformPost);
    },
    enabled: !!agentId,
  });
}
