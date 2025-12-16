export const CORE_KEYS = [
  "esphome",
  "board",
  "wifi",
  "logger",
  "api",
  "ota",
  "mqtt",
  "web_server",
  "captive_portal",
] as const;

export const OPTIONAL_CORE_KEYS = new Set([
  "wifi",
  "logger",
  "api",
  "ota",
  "mqtt",
  "web_server",
  "captive_portal",
] as const);

export const DEFAULT_YAML = `esphome:
  name: demo

esp32:
  board: esp32dev

logger:

api:

ota:
  platform: esphome

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
`;
