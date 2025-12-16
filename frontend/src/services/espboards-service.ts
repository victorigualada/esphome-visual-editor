import { getEspBoards } from "../api";
import type { EspBoardsCatalog } from "../types";

export class EspBoardsService {
  private cache = new Map<"esp32" | "esp8266", EspBoardsCatalog>();

  peek(target: "esp32" | "esp8266"): EspBoardsCatalog | null {
    return this.cache.get(target) ?? null;
  }

  async get(target: "esp32" | "esp8266"): Promise<EspBoardsCatalog> {
    const cached = this.cache.get(target);
    if (cached) return cached;
    const catalog = await getEspBoards(target);
    this.cache.set(target, catalog);
    return catalog;
  }

  clear() {
    this.cache.clear();
  }
}
