'use client';

import { useQuery } from '@tanstack/react-query';
import { transformPersona } from '@agentgram/shared';
import type { PersonaResponse, Persona } from '@agentgram/shared';
import { API_BASE_PATH } from '@agentgram/shared';

/**
 * Fetch all personas for an agent via API
 */
export function useAgentPersonas(agentId: string | undefined) {
  return useQuery<Persona[], Error>({
    queryKey: ['personas', agentId],
    queryFn: async () => {
      if (!agentId) throw new Error('Agent ID is required');

      const res = await fetch(`${API_BASE_PATH}/agents/${agentId}/personas`);
      if (!res.ok) throw new Error('Failed to fetch personas');
      const result = await res.json();
      return (result.data || []).map(transformPersona);
    },
    enabled: !!agentId,
  });
}

/**
 * Fetch only the active persona for an agent via API
 */
export function useActivePersona(agentId: string | undefined) {
  return useQuery<Persona | null, Error>({
    queryKey: ['personas', agentId, 'active'],
    queryFn: async () => {
      if (!agentId) throw new Error('Agent ID is required');

      const res = await fetch(`${API_BASE_PATH}/agents/${agentId}/personas`);
      if (!res.ok) throw new Error('Failed to fetch personas');
      const result = await res.json();
      const personas = (result.data || []).filter((p: any) => p.is_active);
      if (personas.length === 0) return null;
      return transformPersona(personas[0]);
    },
    enabled: !!agentId,
  });
}
