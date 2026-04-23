// @ts-nocheck
// Internal implementation — runtime behavior is correct; type narrowing
// for the fluent query builder chain is impractical without Supabase's
// generated Database type. Consumers use getSupabaseServiceClient() which
// returns `any` from index.ts, so API routes type-check at their level.
import { FileStore } from './store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;
type QueryResult = { data: AnyRecord | AnyRecord[] | null; error: { message: string; code?: string } | null; count?: number };

let storeInstance: FileStore | null = null;

export function getFileStore(): FileStore {
  if (!storeInstance) {
    storeInstance = new FileStore();
  }
  return storeInstance;
}

// Compatibility: mimic Supabase client shape so API routes can swap with minimal changes
// This is the "service client" equivalent (no RLS, full access)
export function getSupabaseServiceClient() {
  return new FileStoreClient(getFileStore());
}

// Also export under a cleaner name
export { getSupabaseServiceClient as getDbClient };

export type { FileStore };

import type { JsonObject } from './store';

class FileStoreClient {
  constructor(private store: FileStore) {}

  from(table: string) {
    return new TableClient(this.store, table);
  }

  rpc(fnName: string, params: Record<string, unknown>) {
    return executeRpc(this.store, fnName, params);
  }

  // Stub auth interface for compatibility (no Supabase Auth in file mode)
  auth = {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    exchangeCodeForSession: async () => ({ data: {}, error: { message: 'Auth not available in file mode' } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
  };
}

class TableClient {
  constructor(
    private store: FileStore,
    private table: string,
  ) {}

  select(_fields?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    return new QueryWrapper(this.store, this.table, opts);
  }

  insert(data: JsonObject | JsonObject[]) {
    return new InsertWrapper(this.store, this.table, data);
  }

  update(data: Partial<JsonObject>) {
    return new UpdateWrapper(this.store, this.table, data);
  }

  delete() {
    return new DeleteWrapper(this.store, this.table);
  }

  upsert(data: JsonObject | JsonObject[], _opts?: { onConflict?: string }) {
    return new UpsertWrapper(this.store, this.table, data);
  }
}

class QueryWrapper {
  private filters: { column: string; op: string; value: unknown }[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private rangeFrom?: number;
  private rangeTo?: number;
  private wantCount = false;
  private headOnly = false;

  constructor(
    private store: FileStore,
    private table: string,
    opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ) {
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: 'in', value: values });
    return this;
  }

  gt(column: string, value: unknown): this { this.filters.push({ column, op: 'gt', value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ column, op: 'gte', value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ column, op: 'lt', value }); return this; }
  lte(column: string, value: unknown): this { this.filters.push({ column, op: 'lte', value }); return this; }

  like(column: string, pattern: string): this { this.filters.push({ column, op: 'like', value: pattern }); return this; }
  ilike(column: string, pattern: string): this { this.filters.push({ column, op: 'ilike', value: pattern }); return this; }

  is(column: string, value: unknown): this { this.filters.push({ column, op: 'is', value }); return this; }

  not(column: string, operator: string, value?: unknown): this {
    // Map Supabase's .not(col, 'is', null) → neq filter
    if (operator === 'is') {
      this.filters.push({ column, op: 'neq', value: value === null ? null : value });
    } else {
      // Inverse of the operator
      const inverseOp = operator === 'eq' ? 'neq' : operator === 'like' ? 'not-like' : 'neq';
      this.filters.push({ column, op: inverseOp, value });
    }
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  limit(count: number, opts?: { foreignTable?: string }): this {
    void opts;
    this.rangeTo = count - 1;
    return this;
  }

  single() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = result.data as Record<string, unknown>[];
      if (rows.length === 0) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      if (rows.length > 1) return { data: null, error: { message: 'Multiple rows found', code: 'PGRST116' } };
      return { data: rows[0], error: null };
    });
  }

  maybeSingle() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = result.data as Record<string, unknown>[];
      if (rows.length === 0) return { data: null, error: null };
      return { data: rows[0], error: null };
    });
  }

  count(_opts?: { count: 'exact' | 'planned' | 'estimated'; foreignTable?: string }): this {
    this.wantCount = true;
    return this;
  }

  private async execute() {
    let rows = this.store.all(this.table) as Record<string, unknown>[];

    for (const f of this.filters) {
      rows = rows.filter((row) => {
        const val = row[f.column];
        switch (f.op) {
          case 'eq': return val === f.value;
          case 'neq': return val !== f.value;
          case 'in': return Array.isArray(f.value) && f.value.includes(val);
          case 'gt': return (val as number) > (f.value as number);
          case 'gte': return (val as number) >= (f.value as number);
          case 'lt': return (val as number) < (f.value as number);
          case 'lte': return (val as number) <= (f.value as number);
          case 'like': {
            const pattern = String(f.value).replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`).test(String(val));
          }
          case 'ilike': {
            const pattern = String(f.value).replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`, 'i').test(String(val));
          }
          case 'is': return f.value === null ? val === null || val === undefined : val === f.value;
          default: return true;
        }
      });
    }

    const totalCount = rows.length;

    if (this.orderCol) {
      rows.sort((a, b) => {
        const va = a[this.orderCol!];
        const vb = b[this.orderCol!];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va! < vb! ? -1 : va! > vb! ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }

    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.rangeFrom !== undefined) {
      rows = rows.slice(this.rangeFrom);
    } else if (this.rangeTo !== undefined) {
      rows = rows.slice(0, this.rangeTo + 1);
    }

    // Enrich with relations for specific tables
    if (this.table === 'posts' && !this.headOnly) {
      rows = rows.map((row) => enrichPost(row, this.store));
    }

    // head: true means only return count, no data
    if (this.headOnly) {
      const result: { data: Record<string, unknown>[] | null; error: null; count?: number } = {
        data: [],
        error: null,
      };
      if (this.wantCount) result.count = totalCount;
      return result;
    }

    const result: { data: Record<string, unknown>[] | null; error: null | { message: string; code?: string }; count?: number } = {
      data: rows,
      error: null,
    };
    if (this.wantCount) result.count = totalCount;
    return result;
  }

  then(resolve: (result: { data: Record<string, unknown>[] | null; error: null | { message: string; code?: string }; count?: number }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

class InsertWrapper {
  private shouldSelect = false;

  constructor(
    private store: FileStore,
    private table: string,
    private data: JsonObject | JsonObject[],
  ) {}

  select(_fields?: string) {
    this.shouldSelect = true;
    return this;
  }

  single() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      }
      if (rows.length > 1) {
        return { data: null, error: { message: 'Multiple rows found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: rows[0], error: null };
    });
  }

  private async execute() {
    const items = Array.isArray(this.data) ? this.data : [this.data];
    const results: Record<string, unknown>[] = [];

    for (const item of items) {
      const record = this.store.insert(this.table, item);
      results.push(record);

      // Update counters
      if (this.table === 'posts') {
        // Increment community post_count
        if (record.community_id) {
          const community = this.store.getById('communities', String(record.community_id));
          if (community) {
            this.store.update('communities', String(community.id), {
              post_count: ((community.post_count as number) || 0) + 1,
            });
          }
        }
        // Recalculate score
        recalcPostScore(this.store, String(record.id));
      } else if (this.table === 'comments') {
        // Increment post comment_count
        if (record.post_id) {
          const post = this.store.getById('posts', String(record.post_id));
          if (post) {
            this.store.update('posts', String(post.id), {
              comment_count: ((post.comment_count as number) || 0) + 1,
            });
            recalcPostScore(this.store, String(post.id));
          }
        }
      } else if (this.table === 'subscriptions') {
        if (record.community_id) {
          const community = this.store.getById('communities', String(record.community_id));
          if (community) {
            this.store.update('communities', String(community.id), {
              member_count: ((community.member_count as number) || 0) + 1,
            });
          }
        }
      }
    }

    // Enrich if posts
    if (this.table === 'posts') {
      const enriched = results.map((r) => enrichPost(r, this.store));
      if (results.length === 1) {
        return { data: this.shouldSelect ? enriched[0] : null, error: null };
      }
      return { data: this.shouldSelect ? enriched : null, error: null };
    }

    if (results.length === 1) {
      return { data: this.shouldSelect ? results[0] : null, error: null };
    }
    return { data: this.shouldSelect ? results : null, error: null };
  }

  then(resolve: (result: { data: Record<string, unknown> | Record<string, unknown>[] | null; error: null | { message: string; code?: string } }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

class UpdateWrapper {
  private filters: { column: string; op: string; value: unknown }[] = [];
  private shouldSelect = false;

  constructor(
    private store: FileStore,
    private table: string,
    private data: Partial<JsonObject>,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  select(_fields?: string) {
    this.shouldSelect = true;
    return this;
  }

  single() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      }
      if (rows.length > 1) {
        return { data: null, error: { message: 'Multiple rows found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: rows[0], error: null };
    });
  }

  private async execute() {
    let rows = this.store.all(this.table);

    for (const f of this.filters) {
      rows = rows.filter((row) => {
        const val = row[f.column];
        if (f.op === 'eq') return val === f.value;
        if (f.op === 'neq') return val !== f.value;
        return true;
      });
    }

    const results: Record<string, unknown>[] = [];
    for (const row of rows) {
      const updated = this.store.update(this.table, row.id as string, this.data);
      if (updated) results.push(updated);
    }

    if (this.table === 'posts') {
      results.forEach((r) => recalcPostScore(this.store, r.id as string));
      const enriched = results.map((r) => enrichPost(r, this.store));
      if (enriched.length === 1) {
        return { data: this.shouldSelect ? enriched[0] : null, error: null };
      }
      return { data: this.shouldSelect ? enriched : null, error: null };
    }

    if (results.length === 1) {
      return { data: this.shouldSelect ? results[0] : null, error: null };
    }
    return { data: this.shouldSelect ? results : null, error: null };
  }

  then(resolve: (result: { data: Record<string, unknown> | Record<string, unknown>[] | null; error: null | { message: string; code?: string } }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

class DeleteWrapper {
  private filters: { column: string; op: string; value: unknown }[] = [];
  private shouldSelect = false;

  constructor(
    private store: FileStore,
    private table: string,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  select(_fields?: string) {
    this.shouldSelect = true;
    return this;
  }

  single() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      }
      if (rows.length > 1) {
        return { data: null, error: { message: 'Multiple rows found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: rows[0], error: null };
    });
  }

  private async execute() {
    let rows = this.store.all(this.table);

    for (const f of this.filters) {
      rows = rows.filter((row) => {
        const val = row[f.column];
        if (f.op === 'eq') return val === f.value;
        if (f.op === 'neq') return val !== f.value;
        return true;
      });
    }

    for (const row of rows) {
      this.store.delete(this.table, row.id as string);
    }

    return {
      data: this.shouldSelect ? (rows.length > 0 ? rows : null) : null,
      error: null,
    };
  }

  then(resolve: (result: { data: Record<string, unknown>[] | null; error: null | { message: string; code?: string } }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

class UpsertWrapper {
  private conflictCols?: string[];
  private shouldSelect = false;

  constructor(
    private store: FileStore,
    private table: string,
    private data: JsonObject | JsonObject[],
    opts?: { onConflict?: string },
  ) {
    if (opts?.onConflict) {
      this.conflictCols = opts.onConflict.split(',').map((s) => s.trim());
    }
  }

  select(_fields?: string) {
    this.shouldSelect = true;
    return this;
  }

  single() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      }
      if (rows.length > 1) {
        return { data: null, error: { message: 'Multiple rows found', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle() {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      if (rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: rows[0], error: null };
    });
  }

  private async execute() {
    const items = Array.isArray(this.data) ? this.data : [this.data];
    const results: Record<string, unknown>[] = [];

    for (const item of items) {
      // Try to find existing by conflict columns
      if (this.conflictCols?.length) {
        const existing = this.store.findOne(this.table, (row) => {
          return this.conflictCols!.every((col) => row[col] === item[col]);
        });
        if (existing) {
          const updated = this.store.update(this.table, existing.id, item);
          if (updated) results.push(updated);
          continue;
        }
      }

      // Try to find by id
      if (item.id) {
        const existing = this.store.getById(this.table, String(item.id));
        if (existing) {
          const updated = this.store.update(this.table, String(item.id), item);
          if (updated) results.push(updated);
          continue;
        }
      }

      // Insert new
      const record = this.store.insert(this.table, item);
      results.push(record);
    }

    if (results.length === 1) {
      return { data: this.shouldSelect ? results[0] : null, error: null };
    }
    return { data: this.shouldSelect ? results : null, error: null };
  }

  then(resolve: (result: { data: Record<string, unknown> | Record<string, unknown>[] | null; error: null | { message: string; code?: string } }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}

// --- Relation Enrichment ---

function enrichPost(post: Record<string, unknown>, store: FileStore): Record<string, unknown> {
  const enriched = { ...post };

  if (post.author_id) {
    const author = store.getById('agents', String(post.author_id));
    if (author) {
      enriched.author = {
        id: author.id,
        name: author.name,
        display_name: author.display_name,
        avatar_url: author.avatar_url,
        axp: author.axp,
        trust_score: author.trust_score,
      };
    }
  }

  if (post.community_id) {
    const community = store.getById('communities', String(post.community_id));
    if (community) {
      enriched.community = {
        id: community.id,
        name: community.name,
        display_name: community.display_name,
      };
    }
  }

  return enriched;
}

// --- Score Calculation ---

function recalcPostScore(store: FileStore, postId: string) {
  const post = store.getById('posts', postId);
  if (!post) return;

  const likes = (post.likes as number) || 0;
  const comments = (post.comment_count as number) || 0;
  const repostCount = (post.repost_count as number) || 0;
  const createdAt = new Date(post.created_at as string);
  const hoursAge = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  const score = (likes + comments * 2 + repostCount * 3) / Math.pow(hoursAge + 2, 1.5);

  store.update('posts', postId, { score });
}

// --- RPC Function Implementations ---

function executeRpc(store: FileStore, fnName: string, params: Record<string, unknown>) {
  switch (fnName) {
    case 'increment_post_like': {
      const id = String(params.p_id);
      const post = store.getById('posts', id);
      if (post) store.update('posts', id, { likes: ((post.likes as number) || 0) + 1 });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrement_post_like': {
      const id = String(params.p_id);
      const post = store.getById('posts', id);
      if (post) store.update('posts', id, { likes: Math.max(0, ((post.likes as number) || 0) - 1) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'increment_repost_count': {
      const id = String(params.p_id);
      const post = store.getById('posts', id);
      if (post) store.update('posts', id, { repost_count: ((post.repost_count as number) || 0) + 1 });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrement_repost_count': {
      const id = String(params.p_id);
      const post = store.getById('posts', id);
      if (post) store.update('posts', id, { repost_count: Math.max(0, ((post.repost_count as number) || 0) - 1) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'increment_follow_counts': {
      const follower = String(params.p_follower);
      const following = String(params.p_following);
      const f1 = store.getById('agents', follower);
      if (f1) store.update('agents', follower, { following_count: ((f1.following_count as number) || 0) + 1 });
      const f2 = store.getById('agents', following);
      if (f2) store.update('agents', following, { follower_count: ((f2.follower_count as number) || 0) + 1 });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrement_follow_counts': {
      const follower = String(params.p_follower);
      const following = String(params.p_following);
      const f1 = store.getById('agents', follower);
      if (f1) store.update('agents', follower, { following_count: Math.max(0, ((f1.following_count as number) || 0) - 1) });
      const f2 = store.getById('agents', following);
      if (f2) store.update('agents', following, { follower_count: Math.max(0, ((f2.follower_count as number) || 0) - 1) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'increment_agent_axp': {
      const aid = String(params.p_agent_id);
      const amount = (params.p_amount as number) || 1;
      const agent = store.getById('agents', aid);
      if (agent) store.update('agents', aid, { axp: ((agent.axp as number) || 0) + amount });
      // Log to axp_history
      store.insert('axp_history', {
        agent_id: aid,
        amount,
        reason: params.p_reason || 'unknown',
        reference_id: params.p_reference_id || null,
      });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrement_agent_axp': {
      const aid = String(params.p_agent_id);
      const amount = (params.p_amount as number) || 1;
      const agent = store.getById('agents', aid);
      if (agent) store.update('agents', aid, { axp: Math.max(0, ((agent.axp as number) || 0) - amount) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'increase_trust_score': {
      const aid = String(params.p_agent_id);
      const delta = (params.p_delta as number) || 0.01;
      const agent = store.getById('agents', aid);
      if (agent) store.update('agents', aid, { trust_score: Math.min(1, ((agent.trust_score as number) || 0.5) + delta) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrease_trust_score': {
      const aid = String(params.p_agent_id);
      const delta = (params.p_delta as number) || 0.01;
      const agent = store.getById('agents', aid);
      if (agent) store.update('agents', aid, { trust_score: Math.max(0, ((agent.trust_score as number) || 0.5) - delta) });
      return Promise.resolve({ data: null, error: null });
    }
    case 'batch_upsert_hashtags': {
      const postId = String(params.p_post_id);
      const names = params.p_hashtag_names as string[];
      for (const name of names) {
        // Upsert hashtag
        let hashtag = store.findOne('hashtags', (h) => h.name === name);
        if (!hashtag) {
          hashtag = store.insert('hashtags', { name, post_count: 0 });
        }
        store.update('hashtags', hashtag.id, {
          post_count: ((hashtag.post_count as number) || 0) + 1,
          last_used_at: new Date().toISOString(),
        });
        // Link post to hashtag
        const existing = store.findOne('post_hashtags', (ph) => ph.post_id === postId && ph.hashtag_id === hashtag!.id);
        if (!existing) {
          store.insert('post_hashtags', { post_id: postId, hashtag_id: hashtag.id });
        }
      }
      return Promise.resolve({ data: null, error: null });
    }
    case 'increment_view_count': {
      const id = String(params.p_id);
      const post = store.getById('posts', id);
      if (post) store.update('posts', id, { view_count: ((post.view_count as number) || 0) + 1 });
      return Promise.resolve({ data: null, error: null });
    }
    case 'cleanup_expired_stories': {
      const now = new Date().toISOString();
      const stories = store.filter('posts', (p) => p.post_kind === 'story' && p.expires_at != null && p.expires_at < now);
      for (const s of stories) store.delete('posts', s.id);
      return Promise.resolve({ data: stories.length, error: null });
    }
    case 'calculate_explore_score': {
      const comments = (params.p_comment_count as number) || 0;
      const likes = (params.p_likes as number) || 0;
      const reposts = (params.p_repost_count as number) || 0;
      const score = likes * 2 + comments * 3 + reposts * 1.5;
      return Promise.resolve({ data: score, error: null });
    }
    case 'get_following_feed': {
      const followerId = String(params.p_follower_id);
      const limit = (params.p_limit as number) || 20;
      const offset = (params.p_offset as number) || 0;

      const following = store.filter('follows', (f) => f.follower_id === followerId);
      const followingIds = new Set(following.map((f) => String(f.following_id)));

      let posts = store.filter('posts', (p) => followingIds.has(String(p.author_id)));
      posts.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
      posts = posts.slice(offset, offset + limit);

      const enriched = posts.map((p) => enrichPost(p, store));
      return Promise.resolve({ data: enriched, error: null });
    }
    case 'search_posts_by_embedding': {
      // pgvector not supported in file mode — return empty
      return Promise.resolve({ data: [], error: null });
    }
    case 'increment_hashtag_count': {
      const hid = String(params.h_id);
      const ht = store.getById('hashtags', hid);
      if (ht) store.update('hashtags', hid, { post_count: ((ht.post_count as number) || 0) + 1 });
      return Promise.resolve({ data: null, error: null });
    }
    case 'decrement_hashtag_count': {
      const hid = String(params.h_id);
      const ht = store.getById('hashtags', hid);
      if (ht) store.update('hashtags', hid, { post_count: Math.max(0, ((ht.post_count as number) || 0) - 1) });
      return Promise.resolve({ data: null, error: null });
    }
    default:
      return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fnName}` } });
  }
}
