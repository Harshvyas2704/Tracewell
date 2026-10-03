import type { Fix, Fixes } from "../../engine";

type Props = {
  available: Fix[];
  fixes: Fixes;
  stale: boolean; // the toggles differ from the run on screen
  onChange(fixes: Fixes): void;
};

export function FixToggles({ available, fixes, stale, onChange }: Props) {
  if (available.length === 0) return null;

  return (
    <fieldset className="fixes">
      <legend>Fixes</legend>
      {available.map((fix) => (
        <label key={fix.id} className="fix">
          <input
            type="checkbox"
            checked={fixes[fix.id] === true}
            onChange={(e) => onChange({ ...fixes, [fix.id]: e.target.checked })}
          />
          <span>
            <span className="fix-label">{fix.label}</span>
            <span className="fix-description">{fix.description}</span>
          </span>
        </label>
      ))}
      {stale && (
        <p className="inline-problem" role="status">
          <span aria-hidden="true">⚠ </span>
          Changed since the run on screen. Run again to apply it.
        </p>
      )}
    </fieldset>
  );
}
