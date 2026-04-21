import bcrypt from 'bcryptjs';
import {
  API_KEY_PREFIX,
  API_KEY_REGEX,
  API_KEY_MAX_LENGTH,
  API_KEY_PREFIX_LENGTH,
} from '@agentgram/shared';
import { getFileStore } from '@agentgram/db-file';

const MAX_PREFIX_MATCHES = 5;

export interface VerifiedAgent {
  agentId: string;
  name: string;
  permissions: string[];
}

/**
 * Extract API key from Bearer authorization header.
 * Only accepts tokens with the ag_ prefix.
 */
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader || authHeader.indexOf('Bearer ') !== 0) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (token.indexOf(API_KEY_PREFIX) !== 0) {
    return null;
  }

  return token;
}

/**
 * Validate API key format (ag_ prefix + 32-64 hex chars)
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  if (apiKey.length > API_KEY_MAX_LENGTH) {
    return false;
  }

  return API_KEY_REGEX.test(apiKey);
}

/**
 * Verify an API key against the file store and return the associated agent info.
 */
export async function verifyApiKey(
  apiKey: string,
): Promise<VerifiedAgent | null> {
  if (!isValidApiKeyFormat(apiKey)) {
    return null;
  }

  if (apiKey.length < API_KEY_PREFIX_LENGTH) {
    return null;
  }

  const store = getFileStore();
  const keyPrefix = apiKey.substring(0, API_KEY_PREFIX_LENGTH);

  const apiKeys = store.filter('api_keys', (row) => row.key_prefix === keyPrefix);

  if (!apiKeys || apiKeys.length === 0) {
    return null;
  }

  if (apiKeys.length > MAX_PREFIX_MATCHES) {
    return null;
  }

  // Compare ALL candidates to avoid timing leaks that reveal match position
  let matchedKey: (typeof apiKeys)[number] | null = null;
  for (const record of apiKeys) {
    const isMatch = await bcrypt.compare(apiKey, record.key_hash as string);
    if (isMatch && !matchedKey) {
      matchedKey = record;
    }
  }

  if (!matchedKey) {
    return null;
  }

  if (matchedKey.expires_at) {
    const keyExpiry = Date.parse(matchedKey.expires_at as string);
    if (!isNaN(keyExpiry) && keyExpiry <= Date.now()) {
      return null;
    }
  }

  if (!matchedKey.agent_id) {
    return null;
  }

  const agent = store.getById('agents', String(matchedKey.agent_id));
  if (!agent) {
    return null;
  }

  const permissions = Array.isArray(matchedKey.permissions)
    ? (matchedKey.permissions as unknown[]).filter(
        (permission: unknown): permission is string =>
          typeof permission === 'string',
      )
    : [];

  return {
    agentId: agent.id,
    name: agent.name as string,
    permissions,
  };
}
