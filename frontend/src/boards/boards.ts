export const boards = {
  esp32dev: { name: "ESP32 DevKit" },
  nodemcuv2: { name: "NodeMCU v2" },
} as const;

export type BoardId = keyof typeof boards;
