import { PIXELS_PER_SECOND } from "./constants";

export function Ruler({ duration }: { duration: number }) {
  const ticks: number[] = [];
  for (let t = 0; t <= Math.ceil(duration); t++) ticks.push(t);
  return (
    <div className="ruler" style={{ width: duration * PIXELS_PER_SECOND }}>
      {ticks.map((t) => (
        <div key={t} className="ruler-tick" style={{ left: t * PIXELS_PER_SECOND }}>
          <span>{t}s</span>
        </div>
      ))}
    </div>
  );
}
