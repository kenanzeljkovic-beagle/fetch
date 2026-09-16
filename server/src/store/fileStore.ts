import fs from 'node:fs/promises';
import path from 'node:path';
import { CallRecord, CallStore } from './types';

/**
 * JSON-file store for local development / the prototype. One file, rewritten on
 * every change. Swap for PostgresStore by setting DATABASE_URL.
 */
export class FileStore implements CallStore {
  private file: string;
  private settingsFile: string;
  private cache: Map<string, CallRecord> | null = null;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'calls.json');
    this.settingsFile = path.join(dataDir, 'settings.json');
  }

  private async readSettings(): Promise<Record<string, unknown>> {
    try { return JSON.parse(await fs.readFile(this.settingsFile, 'utf8')); } catch { return {}; }
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const all = await this.readSettings();
    return (all[key] as T) ?? null;
  }

  async setSetting<T = unknown>(key: string, value: T): Promise<void> {
    const all = await this.readSettings();
    all[key] = value;
    await fs.mkdir(path.dirname(this.settingsFile), { recursive: true });
    await fs.writeFile(this.settingsFile, JSON.stringify(all, null, 2));
  }

  private async load(): Promise<Map<string, CallRecord>> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const arr: CallRecord[] = JSON.parse(raw);
      this.cache = new Map(arr.map((c) => [c.id, c]));
    } catch {
      this.cache = new Map();
    }
    return this.cache;
  }

  private async persist() {
    const map = await this.load();
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify([...map.values()], null, 2));
  }

  async create(input: Omit<CallRecord, 'createdAt' | 'updatedAt'>): Promise<CallRecord> {
    const map = await this.load();
    const now = new Date().toISOString();
    const rec: CallRecord = { ...input, createdAt: now, updatedAt: now };
    map.set(rec.id, rec);
    await this.persist();
    return rec;
  }

  async get(id: string) {
    return (await this.load()).get(id) ?? null;
  }

  async update(id: string, patch: Partial<CallRecord>) {
    const map = await this.load();
    const cur = map.get(id);
    if (!cur) throw new Error(`Call ${id} not found`);
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    map.set(id, next);
    await this.persist();
    return next;
  }

  async list(opts: { limit?: number; unloggedOnly?: boolean } = {}) {
    const all = [...(await this.load()).values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const filtered = opts.unloggedOnly ? all.filter((c) => !c.twentyNoteId && c.status !== 'initiated' && c.status !== 'blocked') : all;
    return filtered.slice(0, opts.limit ?? 50);
  }
}
