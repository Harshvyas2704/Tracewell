import { SPEEDS, type Granularity, type Speed } from "./logic";
import type { Player } from "./usePlayer";

export function PlayerControls({ player }: { player: Player }) {
  const empty = player.count === 0;
  const atStart = player.cursor === 0;
  const playLabel = player.playing ? "Pause" : player.atEnd && !empty ? "Replay" : "Play";

  return (
    <div className="player" role="group" aria-label="Player">
      <div className="player-buttons">
        <button type="button" onClick={player.first} disabled={empty || atStart}>
          First
        </button>
        <button type="button" onClick={player.prev} disabled={empty || atStart}>
          Prev
        </button>
        <button type="button" className="primary" onClick={player.toggle} disabled={empty}>
          {playLabel}
        </button>
        <button type="button" onClick={player.next} disabled={empty || player.atEnd}>
          Next
        </button>
        <button type="button" onClick={player.last} disabled={empty || player.atEnd}>
          Last
        </button>
      </div>

      <p className="player-position">
        {empty ? (
          "No trace yet"
        ) : (
          <>
            Event <strong>{player.cursor + 1}</strong> of {player.count}
            <span className="player-mode" data-mode={player.mode}>
              {player.playing ? "Playing" : player.mode === "play" ? "Play mode" : "Step mode"}
            </span>
          </>
        )}
      </p>

      <label className="player-setting">
        <span>Speed</span>
        <select
          value={player.speed}
          onChange={(e) => player.setSpeed(Number(e.target.value) as Speed)}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
      </label>
      <label className="player-setting">
        <span>Step by</span>
        <select
          value={player.granularity}
          onChange={(e) => player.setGranularity(e.target.value as Granularity)}
        >
          <option value="event">Every event</option>
          <option value="stage">Stage</option>
        </select>
      </label>

      <p className="player-keys muted">
        Keys: <kbd>←</kbd> <kbd>→</kbd> step, <kbd>Space</kbd> play or pause, <kbd>Home</kbd>{" "}
        <kbd>End</kbd> jump
      </p>
    </div>
  );
}
