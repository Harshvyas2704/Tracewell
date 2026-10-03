import { newPair, type Pair } from "./draft";

type Props = {
  title: string; // e.g. "Headers"
  itemName: string; // e.g. "header", used in labels
  pairs: Pair[];
  onChange(pairs: Pair[]): void;
};

export function KeyValueTable({ title, itemName, pairs, onChange }: Props) {
  const update = (id: number, change: Partial<Pair>) =>
    onChange(pairs.map((pair) => (pair.id === id ? { ...pair, ...change } : pair)));

  return (
    <fieldset className="kv">
      <legend>{title}</legend>
      {pairs.length === 0 && <p className="muted kv-empty">None</p>}
      {pairs.map((pair, i) => (
        <div className="kv-row" key={pair.id}>
          <input
            aria-label={`${itemName} ${i + 1} name`}
            placeholder="name"
            value={pair.key}
            spellCheck={false}
            onChange={(e) => update(pair.id, { key: e.target.value })}
          />
          <input
            aria-label={`${itemName} ${i + 1} value`}
            placeholder="value"
            value={pair.value}
            spellCheck={false}
            onChange={(e) => update(pair.id, { value: e.target.value })}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${itemName} ${i + 1}`}
            onClick={() => onChange(pairs.filter((p) => p.id !== pair.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="link-button" onClick={() => onChange([...pairs, newPair()])}>
        + Add {itemName}
      </button>
    </fieldset>
  );
}
