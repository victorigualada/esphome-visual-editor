import type { CoreSchemaResponse, EspBoardsCatalog, SchemaResponse } from "../../types";
import { CoreSchemaService } from "../../services/core-schema-service";
import { EspBoardsService } from "../../services/espboards-service";
import { SchemaService } from "../../services/schema-service";

export class EveSchemaController {
  readonly schemaService = new SchemaService();
  readonly coreSchemaService = new CoreSchemaService();
  readonly espBoardsService = new EspBoardsService();

  private espBoardsInFlight = new Map<"esp32" | "esp8266", Promise<EspBoardsCatalog>>();
  private schemaInFlight = new Map<string, Promise<SchemaResponse | null>>();
  private coreSchemaInFlight = new Map<string, Promise<CoreSchemaResponse | null>>();
  private schemaErrors = new Map<string, string>();
  private coreSchemaErrors = new Map<string, string>();

  constructor(
    private readonly hooks: {
      notify: () => void;
      reportError: (message: string) => void;
    },
  ) {}

  async ensureSchema(domain: string, platform: string): Promise<SchemaResponse | null> {
    const cached = this.schemaService.peek(domain, platform);
    const key = `${domain}:${platform}`;
    if (cached) {
      this.schemaErrors.delete(key);
      return cached;
    }

    const inFlight = this.schemaInFlight.get(key);
    if (inFlight) {
      try {
        return await inFlight;
      } catch {
        return null;
      }
    }

    this.schemaErrors.delete(key);
    const promise = (async () => {
      try {
        const s = await this.schemaService.get(domain, platform);
        return s;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.hooks.reportError(`Schema load error: ${msg}`);
        this.schemaErrors.set(key, msg);
        return null;
      } finally {
        this.schemaInFlight.delete(key);
        this.hooks.notify();
      }
    })();

    this.schemaInFlight.set(key, promise);
    return await promise;
  }

  getSchemaCached(domain: string, platform: string): SchemaResponse | null {
    return this.schemaService.peek(domain, platform);
  }

  getSchemaError(domain: string, platform: string): string | null {
    return this.schemaErrors.get(`${domain}:${platform}`) ?? null;
  }

  clearSchemaError(domain: string, platform: string) {
    this.schemaErrors.delete(`${domain}:${platform}`);
  }

  async ensureCoreSchema(name: string): Promise<CoreSchemaResponse | null> {
    const cached = this.coreSchemaService.peek(name);
    if (cached) {
      this.coreSchemaErrors.delete(name);
      return cached;
    }

    const inFlight = this.coreSchemaInFlight.get(name);
    if (inFlight) {
      try {
        return await inFlight;
      } catch {
        return null;
      }
    }

    this.coreSchemaErrors.delete(name);
    const promise = (async () => {
      try {
        const s = await this.coreSchemaService.get(name);
        return s;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.hooks.reportError(`Core schema load error: ${msg}`);
        this.coreSchemaErrors.set(name, msg);
        return null;
      } finally {
        this.coreSchemaInFlight.delete(name);
        this.hooks.notify();
      }
    })();

    this.coreSchemaInFlight.set(name, promise);
    return await promise;
  }

  getCoreSchemaCached(name: string): CoreSchemaResponse | null {
    return this.coreSchemaService.peek(name);
  }

  getCoreSchemaError(name: string): string | null {
    return this.coreSchemaErrors.get(name) ?? null;
  }

  clearCoreSchemaError(name: string) {
    this.coreSchemaErrors.delete(name);
  }

  async ensureEspBoards(target: "esp32" | "esp8266"): Promise<EspBoardsCatalog | null> {
    const cached = this.espBoardsService.peek(target);
    if (cached) return cached;

    const inFlight = this.espBoardsInFlight.get(target);
    if (inFlight) {
      try {
        return await inFlight;
      } catch {
        return null;
      }
    }

    try {
      const promise = this.espBoardsService.get(target);
      this.espBoardsInFlight.set(target, promise);
      const c = await promise;
      this.hooks.notify();
      return c;
    } catch (e) {
      this.hooks.reportError(`Board catalog load error: ${e instanceof Error ? e.message : String(e)}`);
      this.hooks.notify();
      return null;
    } finally {
      this.espBoardsInFlight.delete(target);
    }
  }

  getEspBoardsCached(target: "esp32" | "esp8266"): EspBoardsCatalog | null {
    return this.espBoardsService.peek(target);
  }
}
