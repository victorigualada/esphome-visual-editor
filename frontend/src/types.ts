export type ComponentRef = { domain: string; platform: string };

export type EsphomeUiSchemaNode =
  | {
      type: "object";
      properties?: Record<string, EsphomeUiSchemaNode>;
      required?: string[];
      ui?: Record<string, unknown>;
    }
  | { type: "array"; items: EsphomeUiSchemaNode; ui?: Record<string, unknown> }
  | { type: "map"; key?: EsphomeUiSchemaNode; value?: EsphomeUiSchemaNode; ui?: Record<string, unknown> }
  | { type: "string"; default?: string; ui?: Record<string, unknown> }
  | { type: "int"; default?: number; minimum?: number; maximum?: number; ui?: Record<string, unknown> }
  | { type: "float"; default?: number; minimum?: number; maximum?: number; ui?: Record<string, unknown> }
  | { type: "number"; default?: number; minimum?: number; maximum?: number; ui?: Record<string, unknown> }
  | { type: "boolean"; default?: boolean; ui?: Record<string, unknown> }
  | { type: "enum"; options?: Array<{ value: unknown; label?: string }>; ui?: Record<string, unknown> }
  | { type: "const"; value: unknown; ui?: Record<string, unknown> }
  | { type: "id"; ui?: Record<string, unknown> }
  | { type: "pin"; capabilities?: string[]; ui?: Record<string, unknown> }
  | { type: "any_of"; options: EsphomeUiSchemaNode[]; ui?: Record<string, unknown> }
  | { type: "raw_yaml"; reason?: string; ui?: Record<string, unknown> };

export type SchemaResponse = {
  domain: string;
  platform: string;
  displayName: string;
  docs?: { description?: string | null; url?: string | null } | null;
  schema: EsphomeUiSchemaNode;
};

export type CoreSchemaResponse = {
  name: string;
  displayName: string;
  docs?: { description?: string | null; url?: string | null } | null;
  schema: EsphomeUiSchemaNode;
};

export type EspBoardsCatalog = {
  target: "esp32" | "esp8266";
  boards: Array<{
    target: "esp32" | "esp8266";
    slug: string;
    name: string;
    url: string;
    imageUrl: string;
    microcontroller?: string | null;
  }>;
};

export type EspBoardDetails = {
  target: "esp32" | "esp8266";
  slug: string;
  name: string;
  url: string;
  pinoutImageUrl?: string | null;
  boardImageUrl?: string | null;
  pins: Array<{
    value: string;
    label: string;
    description?: string | null;
    meta?: Record<string, string> | null;
  }>;
};
