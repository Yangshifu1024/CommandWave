/**
 * Inline images (iTerm2 imgcat): OSC 1337;File=...;size=N;inline=1:BASE64
 * payloads. Pure parser here; TerminalPane renders decoded images into a
 * per-pane tray (images float above the terminal rather than flowing
 * inline — xterm.js has no inline-image renderer).
 */

export interface OscImage {
  mime: string;
  name: string;
  bytes: Uint8Array;
}

export function parseOsc1337File(data: string): OscImage | null {
  const colon = data.indexOf(":");
  if (colon === -1) return null;
  let header = data.slice(0, colon);
  const b64 = data.slice(colon + 1);
  if (header.toLowerCase().startsWith("file=")) header = header.slice(5);
  const parts = header.split(";");
  let name = "image";
  let mime = "";
  let size = -1;
  let inline = false;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).toLowerCase();
    const value = part.slice(eq + 1);
    if (key === "name") name = value;
    else if (key === "size") size = Number.parseInt(value, 10);
    else if (key === "inline") inline = value === "1" || value === "true";
    // file type comes from name extension when absent
  }
  if (!inline) return null;
  const dot = name.lastIndexOf(".");
  if (!mime && dot > -1) {
    const ext = name.slice(dot + 1).toLowerCase();
    mime =
      ext === "png" ? "image/png" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "gif" ? "image/gif" :
      ext === "webp" ? "image/webp" : "";
  }
  const bytes = base64ToBytes(b64);
  if (!bytes || bytes.length === 0) return null;
  if (size > 0 && bytes.length !== size) {
    // Tolerate size mismatches (some emitters report uncompressed size).
  }
  return { mime, name, bytes };
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
