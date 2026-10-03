import { useState } from "react";
import {
  runSimulation,
  scenarioCode,
  type Fixes,
  type Preset,
  type Scenario,
  type SimEvent,
} from "./engine";
import { scenarios } from "./scenarios";
import { CodePanel } from "./ui/code-panel";
import { CompareView, type RunRecord } from "./ui/compare";
import { Inspector } from "./ui/inspector";
import { Header } from "./ui/layout";
import {
  PipelineStrip,
  PlayerControls,
  usePlayer,
  usePlayerKeys,
  useReducedMotion,
} from "./ui/player";
import {
  draftFromPreset,
  draftToRequest,
  emptyDraft,
  RequestBuilder,
  type Draft,
} from "./ui/request-builder";
import { ResponseViewer } from "./ui/response";
import { TraceList } from "./ui/trace";

const NO_EVENTS: SimEvent[] = [];

const firstDraft = (scenario: Scenario | undefined): Draft => {
  const preset = scenario?.presets?.[0];
  return preset ? draftFromPreset(preset.request) : emptyDraft();
};

const sameFixes = (available: Scenario["fixes"], a: Fixes, b: Fixes) =>
  (available ?? []).every((fix) => (a[fix.id] === true) === (b[fix.id] === true));

export default function App() {
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const [draft, setDraft] = useState(() => firstDraft(scenario));
  const [presetId, setPresetId] = useState(scenario?.presets?.[0]?.id);
  const [fixes, setFixes] = useState<Fixes>({});
  const [run, setRun] = useState<RunRecord | null>(null); // the run on screen
  const [pinned, setPinned] = useState<RunRecord | null>(null); // run A of the comparison
  const [runCount, setRunCount] = useState(0);
  const [runProblem, setRunProblem] = useState<string | null>(null);

  const result = run?.result ?? null;
  const events = result?.events ?? NO_EVENTS;
  const reducedMotion = useReducedMotion();
  const player = usePlayer(events, reducedMotion);
  usePlayerKeys(player);

  if (!scenario) {
    return <p className="app-problem">No scenarios are registered.</p>;
  }

  const clearRun = () => {
    setRun(null);
    setRunProblem(null);
  };

  const selectScenario = (id: string) => {
    const next = scenarios.find((s) => s.id === id);
    setScenarioId(id);
    setDraft(firstDraft(next));
    setPresetId(next?.presets?.[0]?.id);
    setFixes({});
    setPinned(null);
    clearRun();
  };

  const selectPreset = (preset: Preset) => {
    setDraft(draftFromPreset(preset.request));
    setPresetId(preset.id);
    clearRun();
  };

  const runRequest = () => {
    try {
      const request = draftToRequest(draft);
      const next = runSimulation({ scenario, requests: [request], fixes });
      setRun({ id: runCount + 1, scenarioId: scenario.id, request, fixes, result: next });
      setRunCount(runCount + 1);
      setRunProblem(null);
    } catch (err) {
      clearRun();
      setRunProblem(err instanceof Error ? err.message : String(err));
    }
  };

  // While a run is on screen the code panel shows the code that run used, so
  // the highlighted lines always match the trace.
  const code = scenarioCode(scenario, run?.fixes ?? fixes);

  return (
    <div className="app">
      <Header scenarios={scenarios} scenario={scenario} onSelect={selectScenario} />
      {runProblem && (
        <p className="app-problem" role="alert">
          The simulation could not run: {runProblem}
        </p>
      )}
      <main className="workspace">
        <RequestBuilder
          draft={draft}
          presets={scenario.presets ?? []}
          activePresetId={presetId}
          availableFixes={scenario.fixes ?? []}
          fixes={fixes}
          fixesStale={run !== null && !sameFixes(scenario.fixes, run.fixes, fixes)}
          onFixes={setFixes}
          onChange={(next) => {
            setDraft(next);
            setPresetId(undefined);
          }}
          onPreset={selectPreset}
          onRun={runRequest}
        />
        <div className="trace-column">
          <section className="panel player-panel" aria-label="Playback">
            <PlayerControls player={player} />
            <PipelineStrip
              events={events}
              cursor={player.cursor}
              showDot={player.mode === "play" && !reducedMotion}
            />
          </section>
          <TraceList
            key={runCount}
            events={result?.events}
            cursor={player.cursor}
            onSeek={player.seek}
          />
        </div>
        <div className="detail-column">
          <CodePanel code={code} events={events} cursor={player.cursor} />
          <Inspector events={events} cursor={player.cursor} />
        </div>
      </main>
      <div className="summary-row">
        <ResponseViewer
          response={run ? result?.responses[run.request.id] : undefined}
          error={result?.errors[0]}
          totalTime={result?.metrics.totalTime ?? 0}
          reached={player.atEnd}
          onShowEvent={(seq) => player.seek(events.findIndex((event) => event.seq === seq))}
          onSkipToEnd={player.last}
        />
        <CompareView
          available={scenario.fixes ?? []}
          current={run}
          pinned={pinned}
          onPin={() => setPinned(run)}
          onUnpin={() => setPinned(null)}
        />
      </div>
    </div>
  );
}
