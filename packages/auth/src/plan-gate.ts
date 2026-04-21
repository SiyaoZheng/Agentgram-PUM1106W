import { redis } from './ratelimit';
import { getFileStore } from '@agentgram/db-file';

/**
 * Plan hierarchy — higher index = more privileged.
 */
const PLAN_HIERARCHY = ['free', 'starter', 'pro', 'enterprise'] as const;
export type PlanName = (typeof PLAN_HIERARCHY)[number];

/**
 * In-memory plan cache (serverless-friendly).
 * TTL: 60 seconds. Falls back to DB lookup on miss.
 */
const planCache = new Map<string, { plan: PlanName; expires: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Look up the plan for a developer via agent_id.
 * Path: agent_id → agents.developer_id → developers.plan
 *
 * Uses the file store directly instead of Supabase REST API.
 */
export async function resolvePlan(
  agentId: string,
  _supabaseUrl?: string,
  _supabaseServiceKey?: string,
): Promise<PlanName> {
  const cacheKey = `plan:${agentId}`;

  // 1. Check in-memory cache
  const cached = planCache.get(cacheKey);
  if (cached) {
    if (Date.now() < cached.expires) return cached.plan;
    planCache.delete(cacheKey);
  }

  // 2. Check Redis cache (if available)
  if (redis) {
    try {
      const redisPlan = await redis.get<string>(cacheKey);
      if (redisPlan && PLAN_HIERARCHY.includes(redisPlan as PlanName)) {
        const plan = redisPlan as PlanName;
        planCache.set(cacheKey, { plan, expires: Date.now() + CACHE_TTL_MS });
        return plan;
      }
    } catch {
      // Redis error — fall through to DB
    }
  }

  // 3. File store lookup
  const store = getFileStore();
  const agent = store.getById('agents', agentId);
  const developerId = agent?.developer_id as string | null;

  if (!developerId) {
    return 'free';
  }

  const developer = store.getById('developers', developerId);
  const rawPlan = developer?.plan as string | null;
  const plan: PlanName =
    rawPlan && PLAN_HIERARCHY.includes(rawPlan as PlanName)
      ? (rawPlan as PlanName)
      : 'free';

  // Cache the result
  planCache.set(cacheKey, { plan, expires: Date.now() + CACHE_TTL_MS });
  if (redis) {
    try {
      await redis.set(cacheKey, plan, { ex: 60 });
    } catch {
      // Redis write error — non-critical
    }
  }

  return plan;
}

/**
 * Invalidate the plan cache for an agent.
 * Call this when a developer's plan changes (e.g., after billing webhook).
 */
export function invalidatePlanCache(agentId: string): void {
  planCache.delete(`plan:${agentId}`);
}

/**
 * Invalidate all plan cache entries for a developer.
 */
export function invalidateAllPlanCaches(): void {
  planCache.clear();
}
