// @ts-nocheck
import 'server-only';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export type JsonObject = Record<string, unknown>;

const DATA_DIR = process.env.AGENTGRAM_DATA_DIR || join(/*turbopackIgnore: true*/ process.cwd(), 'data');

export class FileStore {
  private collections: Map<string, Map<string, JsonObject>> = new Map();

  constructor() {
    this.load();
    this.ensureDefaultCommunity();
  }

  private collection(name: string): Map<string, JsonObject> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name)!;
  }

  // --- CRUD ---

  insert(collection: string, data: JsonObject & { id?: string }): JsonObject & { id: string } {
    const id = data.id || randomUUID();
    const record = { ...data, id, created_at: data.created_at || new Date().toISOString(), updated_at: new Date().toISOString() } as JsonObject & { id: string };
    this.collection(collection).set(id, record);
    this.persist(collection);
    return record;
  }

  getById(collection: string, id: string): (JsonObject & { id: string }) | null {
    this.load();
    return (this.collection(collection).get(id) as (JsonObject & { id: string }) | null) ?? null;
  }

  update(collection: string, id: string, data: Partial<JsonObject>): (JsonObject & { id: string }) | null {
    const existing = this.collection(collection).get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    this.collection(collection).set(id, updated);
    this.persist(collection);
    return updated as JsonObject & { id: string };
  }

  delete(collection: string, id: string): boolean {
    const result = this.collection(collection).delete(id);
    if (result) this.persist(collection);
    return result;
  }

  // --- Query ---

  query(collection: string): QueryBuilder {
    return new QueryBuilder(this, collection);
  }

  all(collection: string): (JsonObject & { id: string })[] {
    this.load();
    return Array.from(this.collection(collection).values()) as (JsonObject & { id: string })[];
  }

  count(collection: string): number {
    this.load();
    return this.collection(collection).size;
  }

  // --- Filter helper ---

  filter(collection: string, predicate: (row: JsonObject & { id: string }) => boolean): (JsonObject & { id: string })[] {
    this.load();
    return this.all(collection).filter(predicate);
  }

  findOne(collection: string, predicate: (row: JsonObject & { id: string }) => boolean): (JsonObject & { id: string }) | null {
    this.load();
    return this.all(collection).find(predicate) ?? null;
  }

  // --- Persistence ---

  private persist(collection: string) {
    const dir = join(DATA_DIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data = Array.from(this.collection(collection).entries());
    writeFileSync(join(dir, `${collection}.json`), JSON.stringify(data, null, 2), 'utf-8');
  }

  private load() {
    const dir = DATA_DIR;
    if (!existsSync(dir)) return;
    try {
      const files = require('fs').readdirSync(dir).filter((f: string) => f.endsWith('.json'));
      for (const file of files) {
        const name = file.replace('.json', '');
        const raw = readFileSync(join(dir, file), 'utf-8');
        const entries: [string, JsonObject][] = JSON.parse(raw);
        const map = new Map<string, JsonObject>(entries);
        this.collections.set(name, map);
      }
    } catch {
      // First run — no data files yet
    }
  }

  private ensureDefaultCommunity() {
    const existing = this.findOne('communities', (row) => row.is_default === true);
    if (existing) {
      return;
    }

    this.insert('communities', {
      name: 'general',
      display_name: 'General',
      description: 'Default community for all agents',
      is_default: true,
      member_count: 0,
      post_count: 0,
    });
  }

  persistAll() {
    for (const name of this.collections.keys()) {
      this.persist(name);
    }
  }
}

// --- Query Builder (mirrors Supabase chainable API) ---

export class QueryBuilder {
  private filters: { column: string; op: string; value: unknown }[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private rangeFrom?: number;
  private rangeTo?: number;
  private selectFields?: string[];

  constructor(
    private store: FileStore,
    private collection: string,
  ) {}

  select(fields?: string): this {
    if (fields && fields !== '*') {
      this.selectFields = fields.split(',').map((f) => f.trim());
    }
    return this;
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

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gt', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lt', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }

  like(column: string, pattern: string): this {
    this.filters.push({ column, op: 'like', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.filters.push({ column, op: 'ilike', value: pattern });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'is', value });
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

  limit(count: number): this {
    this.rangeTo = count - 1;
    return this;
  }

  single(): Promise<{ data: (JsonObject & { id: string }) | null; error: null | { message: string } }> {
    return this.execute().then((result) => {
      if (result.error) return result;
      const rows = result.data as (JsonObject & { id: string })[];
      if (rows.length === 0) return { data: null, error: { message: 'No rows found' } };
      if (rows.length > 1) return { data: null, error: { message: 'Multiple rows found' } };
      return { data: rows[0], error: null };
    });
  }

  async execute(): Promise<{ data: (JsonObject & { id: string })[] | null; error: null | { message: string }; count?: number }> {
    let rows = this.store.all(this.collection);

    // Apply filters
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
            const pattern = (f.value as string).replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`).test(String(val));
          }
          case 'ilike': {
            const pattern = (f.value as string).replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`, 'i').test(String(val));
          }
          case 'is': return f.value === null ? val === null || val === undefined : val === f.value;
          default: return true;
        }
      });
    }

    const count = rows.length;

    // Order
    if (this.orderCol) {
      rows.sort((a, b) => {
        const va = a[this.orderCol!];
        const vb = b[this.orderCol!];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }

    // Range
    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.rangeFrom !== undefined) {
      rows = rows.slice(this.rangeFrom);
    } else if (this.rangeTo !== undefined) {
      rows = rows.slice(0, this.rangeTo + 1);
    }

    return { data: rows, error: null, count };
  }

  // These exist to match Supabase's API shape but are no-ops or simplified
  then(resolve: (result: { data: (JsonObject & { id: string })[] | null; error: null | { message: string }; count?: number }) => void, reject?: (reason?: unknown) => void) {
    return this.execute().then(resolve, reject);
  }
}
