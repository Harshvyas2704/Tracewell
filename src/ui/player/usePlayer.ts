import { useEffect, useState } from "react";
import type { SimEvent } from "../../engine";
import {
  nextIndex,
  prevIndex,
  stepDelay,
  type Granularity,
  type PlayerMode,
  type Speed,
} from "./logic";

export type Player = ReturnType<typeof usePlayer>;

// One cursor over the event list. Play mode moves it on a timer, step mode
// moves it on demand. Everything else in the UI renders "state at cursor".
export function usePlayer(events: SimEvent[], reducedMotion: boolean) {
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<PlayerMode>(reducedMotion ? "step" : "play");
  const [speed, setSpeed] = useState<Speed>(1);
  const [granularity, setGranularity] = useState<Granularity>("event");

  // A new run starts from the first event. The mode is kept, so play mode
  // animates the new run and step mode waits.
  const [seenEvents, setSeenEvents] = useState(events);
  if (seenEvents !== events) {
    setSeenEvents(events);
    setCursor(0);
  }

  const lastIndex = events.length - 1;
  const atEnd = cursor >= lastIndex;
  const playing = mode === "play" && !atEnd;

  useEffect(() => {
    if (!playing) return;
    const target = nextIndex(events, cursor, granularity);
    const from = events[cursor];
    const to = events[target];
    if (!from || !to) return;
    // The timer only covers the gap to the next stop, so a change of speed
    // applies straight away and the cursor stays where it is.
    const timer = window.setTimeout(() => setCursor(target), stepDelay(from, to, speed));
    return () => window.clearTimeout(timer);
  }, [playing, events, cursor, granularity, speed]);

  // Moving the cursor by hand always leaves the user in step mode.
  const stepTo = (index: number) => {
    setMode("step");
    setCursor(Math.max(0, Math.min(index, lastIndex)));
  };

  const play = () => {
    if (atEnd) setCursor(0);
    setMode("play");
  };
  const pause = () => setMode("step");

  return {
    cursor,
    mode,
    speed,
    granularity,
    playing,
    atEnd,
    count: events.length,
    next: () => stepTo(nextIndex(events, cursor, granularity)),
    prev: () => stepTo(prevIndex(events, cursor, granularity)),
    first: () => stepTo(0),
    last: () => stepTo(lastIndex),
    seek: stepTo,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    setSpeed,
    setGranularity,
  };
}
