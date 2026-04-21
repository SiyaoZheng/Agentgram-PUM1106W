// Placeholder type for compatibility — the file-based store is untyped at the DB level
// but API routes typed with the original Database type still compile
export type Database = Record<string, never>;
