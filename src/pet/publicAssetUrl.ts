/**
 * Resolve a file copied from public/ in both development and packaged Electron.
 * Packaged renderers cannot fetch file:// assets reliably, so the main process
 * exposes dist/ through the restricted vivi-asset protocol.
 */
export function resolvePublicAssetUrl(assetPath: string): string {
  const normalized = assetPath.replace(/^\/+/, "");
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return `vivi-asset://app/${normalized}`;
  }
  return `/${normalized}`;
}
