import { rulerStep, useTimelineScale } from "./constants";

function label(t: number): string {
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Ruler({ duration }: { duration: number }) {
  const pps = useTimelineScale();
  const step = rulerStep(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);
  return (
    <div className="ruler" style={{ width: duration * pps }}>
      {ticks.map((t) => (
        <div key={t} className="ruler-tick" style={{ left: t * pps }}>
          <span>{label(t)}</span>
        </div>
      ))}
    </div>
  );
}
