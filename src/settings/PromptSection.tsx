import { useState } from "react";

import {
  defaultPromptSettings,
  useSettingsStore,
  type PromptSettings,
} from "../store/settingsStore";
import { LANGUAGE_SEGMENT_IDS } from "../terminal/promptEditor/promptModel";

const BUILT_IN_SEGMENTS = ["cwd", "git", "duration", "exit"];

const SEGMENT_LABELS: Record<string, string> = {
  cwd: "Working directory",
  git: "Git branch + dirty",
  duration: "Command duration",
  exit: "Exit code (failures)",
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  ruby: "Ruby",
  php: "PHP",
  dotnet: ".NET",
};

const COLOR_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  { value: "var(--accent)", label: "Blue" },
  { value: "#3fb950", label: "Green" },
  { value: "#f0883e", label: "Orange" },
  { value: "var(--danger)", label: "Red" },
  { value: "#a371f7", label: "Purple" },
  { value: "#56d4dd", label: "Cyan" },
  { value: "var(--fg-dim)", label: "Dim" },
];

function segmentLabel(id: string): string {
  if (id.startsWith("text:")) return `Text: ${id.slice("text:".length)}`;
  return SEGMENT_LABELS[id] ?? id;
}

function move(ids: string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids];
  const target = index + delta;
  if (target < 0 || target >= next.length) return ids;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Editable, ordered list of the segments in one prompt header area. */
function SegmentList({
  ids,
  zone,
  onChange,
}: {
  ids: string[];
  zone: "left" | "right";
  onChange: (next: string[]) => void;
}) {
  const [customText, setCustomText] = useState("");
  const available = [
    ...BUILT_IN_SEGMENTS,
    ...LANGUAGE_SEGMENT_IDS,
  ].filter((id) => !ids.includes(id));

  return (
    <div className="prompt-zone">
      <div className="prompt-zone-title">{zone === "left" ? "Left area" : "Right area"}</div>
      {ids.length === 0 && <p className="section-hint">empty</p>}
      {ids.map((id, i) => (
        <div className="prompt-seg-row" key={id}>
          <span className="prompt-seg-label">{segmentLabel(id)}</span>
          <button
            type="button"
            className="settings-add-btn"
            aria-label="Move up"
            disabled={i === 0}
            onClick={() => onChange(move(ids, i, -1))}
          >
            ↑
          </button>
          <button
            type="button"
            className="settings-add-btn"
            aria-label="Move down"
            disabled={i === ids.length - 1}
            onClick={() => onChange(move(ids, i, 1))}
          >
            ↓
          </button>
          <button
            type="button"
            className="settings-add-btn"
            aria-label="Remove"
            onClick={() => onChange(ids.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="prompt-seg-row">
        <select
          aria-label={`Add segment to ${zone} area`}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...ids, e.target.value]);
          }}
        >
          <option value="">Add segment…</option>
          {available.map((id) => (
            <option key={id} value={id}>
              {segmentLabel(id)}
            </option>
          ))}
        </select>
      </div>
      <div className="prompt-seg-row">
        <input
          type="text"
          placeholder="Custom text / emoji…"
          value={customText}
          spellCheck={false}
          onChange={(e) => setCustomText(e.target.value)}
        />
        <button
          type="button"
          className="settings-add-btn"
          disabled={!customText.trim()}
          onClick={() => {
            onChange([...ids, `text:${customText.trim()}`]);
            setCustomText("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Settings tab for the built-in prompt (block model): mode, the segment
 * layout of the prompt header, the input symbol and per-segment colors.
 */
export function PromptSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const prompt: PromptSettings = settings.prompt ?? defaultPromptSettings;

  const patch = (p: Partial<PromptSettings>) => {
    update((draft) => {
      draft.prompt = { ...prompt, ...p };
    });
  };

  const colorFor = (id: string): string => {
    const value = prompt.colors[id] ?? "";
    return COLOR_CHOICES.some((c) => c.value === value && c.value !== "") ? value : "";
  };

  const allSegments = [...new Set([...prompt.left, ...prompt.right])];

  return (
    <>
      <section className="settings-section">
        <h3>Prompt</h3>
        <label className="check-row">
          <input
            type="radio"
            name="prompt-mode"
            checked={prompt.mode === "blocks"}
            onChange={() => patch({ mode: "blocks" })}
          />
          <span>CommandWave block model — native input card, shell prompt hidden</span>
        </label>
        <label className="check-row">
          <input
            type="radio"
            name="prompt-mode"
            checked={prompt.mode === "off"}
            onChange={() => patch({ mode: "off" })}
          />
          <span>Off — keep the shell's own prompt configuration (starship, oh-my-zsh, …)</span>
        </label>
        <p className="section-hint">
          Applies to newly opened tabs; existing shells keep the prompt they
          were spawned with.
        </p>
      </section>

      {prompt.mode === "blocks" && (
        <section className="settings-section">
          <h3>Segments</h3>
          <div className="prompt-zones">
            <SegmentList
              ids={prompt.left}
              zone="left"
              onChange={(left) => patch({ left })}
            />
            <SegmentList
              ids={prompt.right}
              zone="right"
              onChange={(right) => patch({ right })}
            />
          </div>

          <div className="field-row">
            <label className="field field-narrow">
              <span>Input symbol</span>
              <input
                type="text"
                value={prompt.inputSymbol}
                spellCheck={false}
                onChange={(e) => patch({ inputSymbol: e.target.value || "❯" })}
              />
            </label>
          </div>

          <h3>Colors</h3>
          {allSegments.map((id) => (
            <div className="prompt-seg-row" key={id}>
              <span className="prompt-seg-label">{segmentLabel(id)}</span>
              <select
                aria-label={`Color for ${segmentLabel(id)}`}
                value={colorFor(id)}
                onChange={(e) => {
                  const colors = { ...prompt.colors };
                  if (e.target.value) colors[id] = e.target.value;
                  else delete colors[id];
                  patch({ colors });
                }}
              >
                {COLOR_CHOICES.map((c) => (
                  <option key={c.label} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
