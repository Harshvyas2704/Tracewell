import type { Scenario } from "../../engine";
import { Why } from "./Why";

type Props = {
  scenarios: Scenario[];
  scenario: Scenario;
  onSelect(id: string): void;
};

export function Header({ scenarios, scenario, onSelect }: Props) {
  return (
    <header className="app-header">
      <h1>Tracewell</h1>
      <label className="scenario-picker">
        <span>Scenario</span>
        <select value={scenario.id} onChange={(e) => onSelect(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {scenario.description && <p className="muted scenario-description">{scenario.description}</p>}
      {/* Keyed by scenario so the section closes again when the scenario changes. */}
      <Why key={scenario.id} paragraphs={scenario.why ?? []} />
    </header>
  );
}
