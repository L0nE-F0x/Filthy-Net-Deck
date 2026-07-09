import type { PlayMode } from "../types/meta";

export function BoModeToggle({
  mode,
  onChange,
}: {
  mode: PlayMode;
  onChange: (m: PlayMode) => void;
}) {
  return (
    <div className="mode-toggle" role="group" aria-label="Best of mode">
      <button
        type="button"
        className={mode === "bo1" ? "active" : ""}
        onClick={() => onChange("bo1")}
      >
        Bo1
      </button>
      <button
        type="button"
        className={mode === "bo3" ? "active" : ""}
        onClick={() => onChange("bo3")}
      >
        Bo3
      </button>
    </div>
  );
}
