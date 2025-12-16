import { appBaseUrl } from "../lib/app-base-url";

function normalizeApiPath(path: string): string {
  const p = path.trim();
  return p.startsWith("/") ? p.slice(1) : p;
}

function appBaseUrl(): string {
  const basePath = window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
  return `${window.location.origin}${basePath}`;
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  bodyText: string;

  constructor(status: number, statusText: string, bodyText: string) {
    super(`${status} ${statusText}${bodyText ? `: ${bodyText}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = 12_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    const url = new URL(normalizeApiPath(path), appBaseUrl()).toString();
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, res.statusText, text);
  }
  return (await res.json()) as T;
}
