import { getCoreSchema } from "../api";
import type { CoreSchemaResponse } from "../types";

export class CoreSchemaService {
  private cache = new Map<string, CoreSchemaResponse>();

  peek(name: string): CoreSchemaResponse | null {
    return this.cache.get(name) ?? null;
  }

  async get(name: string): Promise<CoreSchemaResponse> {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const schema = await getCoreSchema(name);
    this.cache.set(name, schema);
    return schema;
  }

  clear() {
    this.cache.clear();
  }
}
