import { useEffect, useRef } from "react";
import type { Player } from "./usePlayer";

// Left/Right step, Space plays or pauses, Home/End jump. Keys are left alone
// while the user is typing or has another control focused.
export function usePlayerKeys(player: Player) {
  const latest = useRef(player);
  useEffect(() => {
    latest.current = player;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const p = latest.current;
      if (p.count === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select")) return;

      const actions: Record<string, () => void> = {
        ArrowLeft: p.prev,
        ArrowRight: p.next,
        Home: p.first,
        End: p.last,
        " ": p.toggle,
      };
      const action = actions[e.key];
      if (!action) return;
      // Space on a button outside the trace should press that button.
      if (e.key === " " && target?.closest("button") && !target.closest("[data-player-keys]")) {
        return;
      }
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
