/**
 * Single source of truth for resolving the app's base path/url.
 *
 * NOTE: This intentionally mirrors existing behavior that derives the base
 * from `window.location.pathname` (with a trailing slash).
 */
export function appBasePath(): string {
  return window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
}

export function appBaseUrl(): string {
  return `${window.location.origin}${appBasePath()}`;
}
