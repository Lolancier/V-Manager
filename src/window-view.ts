export const WINDOW_VIEWS = [
  "startup",
  "pet",
  "settings",
  "scale",
  "composer",
  "chat",
  "bubble",
  "expressions",
  "code"
] as const;

export type WindowView = (typeof WINDOW_VIEWS)[number];

export function isWindowView(value: string | null | undefined): value is WindowView {
  return Boolean(value && WINDOW_VIEWS.includes(value as WindowView));
}
