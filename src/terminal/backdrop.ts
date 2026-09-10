/**
 * Pane backdrop resolution: window-level transparency + background images.
 * Pure helpers so the terminal pane, the window blur bridge and the
 * settings preview share one decision.
 */

export interface BackdropProfile {
  backgroundOpacity: number | null | undefined;
  backgroundImage: string | null | undefined;
  backgroundImageOpacity: number | null | undefined;
}

/**
 * Whether the OS window was created with transparency enabled. Windows
 * DWM shows a thin white line at the edge of transparent WebView2 windows,
 * so transparency is opt-in via tauri.conf.json; when disabled, pure
 * translucency degrades to opaque (background images don't need it).
 */
let windowTransparency = false;
export function setWindowTransparency(enabled: boolean): void {
  windowTransparency = enabled;
}
export function isWindowTransparent(): boolean {
  return windowTransparency;
}

export interface Backdrop {
  /** the terminal's background must be translucent (allowTransparency) */
  translucent: boolean;
  /** alpha applied to the theme background (1 = opaque) */
  bgAlpha: number;
  /** CSS-ready image URL, or null */
  imageUrl: string | null;
  /** opacity of the image layer behind the terminal */
  imageOpacity: number;
}

/** Convert a user-entered image reference (URL or path) to a CSS url(). */
export function toCssImage(ref: string): string | null {
  const t = ref.trim();
  if (!t) return null;
  if (/^(https?|data|file|asset):/i.test(t)) return t;
  // Absolute filesystem path → file URL (Windows backslashes included).
  if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith("/")) {
    const normalized = t.replaceAll("\\", "/");
    const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return `file://${encodeURI(withSlash)}`;
  }
  return null;
}

/**
 * Resolve a profile's backdrop. Setting a background image implies mild
 * translucency so the image is visible behind the terminal text.
 */
export function resolveBackdrop(profile: BackdropProfile | null | undefined): Backdrop {
  if (!profile) {
    return { translucent: false, bgAlpha: 1, imageUrl: null, imageOpacity: 1 };
  }
  const imageUrl = profile.backgroundImage ? toCssImage(profile.backgroundImage) : null;
  const opacity = profile.backgroundOpacity ?? (imageUrl ? 0.6 : 1);
  // Pure see-through needs an OS-transparent window; degrade to opaque
  // otherwise (an opaque window would show white behind the alpha).
  const translucent = opacity < 1 && (windowTransparency || imageUrl !== null);
  return {
    translucent,
    bgAlpha: Math.min(1, Math.max(0.1, opacity)),
    imageUrl,
    imageOpacity: Math.min(1, Math.max(0.05, profile.backgroundImageOpacity ?? 0.35)),
  };
}
