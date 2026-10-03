import type { EventStatus } from "../../engine";

// Status is shown as a symbol plus text for screen readers, never colour alone.
const STATUS: Record<EventStatus, { symbol: string; text: string }> = {
  ok: { symbol: "✓", text: "OK" },
  fail: { symbol: "✕", text: "Failed" },
  skip: { symbol: "↷", text: "Skipped" },
  wait: { symbol: "…", text: "Waiting" },
};

export const statusText = (status: EventStatus) => STATUS[status].text;

type Props = {
  status: EventStatus;
  decorative?: boolean; // set when the status is already written next to the icon
};

export function StatusIcon({ status, decorative = false }: Props) {
  return (
    <span className="status-icon" data-status={status} title={STATUS[status].text}>
      <span aria-hidden="true">{STATUS[status].symbol}</span>
      {!decorative && <span className="visually-hidden">{STATUS[status].text}</span>}
    </span>
  );
}
