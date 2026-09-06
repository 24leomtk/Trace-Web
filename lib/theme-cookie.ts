export const THEME_COOKIE_KEY = "cr-theme"

const VALID_THEMES = new Set(["light", "dark", "system"])

export function isThemeValue(value: string | undefined | null): value is string {
  return !!value && VALID_THEMES.has(value)
}
