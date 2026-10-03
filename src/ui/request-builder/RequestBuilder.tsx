import type { Fix, Fixes, HttpMethod, Preset } from "../../engine";
import { jsonProblem, METHODS, type Draft } from "./draft";
import { FixToggles } from "./FixToggles";
import { KeyValueTable } from "./KeyValueTable";

type Props = {
  draft: Draft;
  presets: Preset[];
  activePresetId: string | undefined;
  availableFixes: Fix[];
  fixes: Fixes;
  fixesStale: boolean;
  onFixes(fixes: Fixes): void;
  onChange(draft: Draft): void;
  onPreset(preset: Preset): void;
  onRun(): void;
};

export function RequestBuilder(props: Props) {
  const { draft, presets, activePresetId, onChange, onPreset, onRun } = props;
  const problem = jsonProblem(draft.body);
  const set = (change: Partial<Draft>) => onChange({ ...draft, ...change });

  return (
    <form
      className="panel request-builder"
      aria-labelledby="request-heading"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      <h2 id="request-heading">Request</h2>

      {presets.length > 0 && (
        <div className="presets" role="group" aria-label="Payload presets">
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="chip"
              aria-pressed={preset.id === activePresetId}
              title={preset.description}
              onClick={() => onPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="request-line">
        <select
          aria-label="Method"
          value={draft.method}
          onChange={(e) => set({ method: e.target.value as HttpMethod })}
        >
          {METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
        <input
          aria-label="Path"
          className="path-input"
          value={draft.path}
          placeholder="/products/42"
          spellCheck={false}
          onChange={(e) => set({ path: e.target.value })}
        />
        <button type="submit" className="primary">
          Run
        </button>
      </div>

      <FixToggles
        available={props.availableFixes}
        fixes={props.fixes}
        stale={props.fixesStale}
        onChange={props.onFixes}
      />

      <KeyValueTable
        title="Query params"
        itemName="query param"
        pairs={draft.query}
        onChange={(query) => set({ query })}
      />
      <KeyValueTable
        title="Headers"
        itemName="header"
        pairs={draft.headers}
        onChange={(headers) => set({ headers })}
      />

      <label className="field">
        <span>JSON body</span>
        <textarea
          className="body-editor"
          rows={8}
          value={draft.body}
          spellCheck={false}
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? "body-problem" : undefined}
          onChange={(e) => set({ body: e.target.value })}
        />
      </label>
      {problem && (
        <p id="body-problem" className="inline-problem" role="status">
          <span aria-hidden="true">⚠ </span>
          Not valid JSON: {problem}. You can still run it to see how the server responds.
        </p>
      )}
    </form>
  );
}
