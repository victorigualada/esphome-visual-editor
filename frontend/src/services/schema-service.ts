import { getSchema } from "../api";
import type { SchemaResponse } from "../types";

export class SchemaService {
  private cache = new Map<string, SchemaResponse>();

  peek(domain: string, platform: string): SchemaResponse | null {
    const key = `${domain}:${platform}`;
    return this.cache.get(key) ?? null;
  }

  async get(domain: string, platform: string): Promise<SchemaResponse> {
    const key = `${domain}:${platform}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const schema = await getSchema(domain, platform);
    this.cache.set(key, schema);
    return schema;
  }

  clear() {
    this.cache.clear();
  }
}
