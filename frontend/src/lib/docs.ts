export function coreDocsUrl(coreKey: string): string | null {
  if (!coreKey) return null;
  if (coreKey === "ota") return "https://esphome.io/components/ota/esphome.html";
  if (coreKey === "board") return "https://esphome.io/components/esp32.html";
  if (coreKey === "esp32") return "https://esphome.io/components/esp32.html";
  if (coreKey === "esp8266") return "https://esphome.io/components/esp8266.html";
  return `https://esphome.io/components/${encodeURIComponent(coreKey)}.html`;
}

export function componentDocsUrl(domain: string, platform?: string): string | null {
  if (!domain) return null;
  if (!platform) return `https://esphome.io/components/${encodeURIComponent(domain)}.html`;
  return `https://esphome.io/components/${encodeURIComponent(domain)}/${encodeURIComponent(platform)}.html`;
}
