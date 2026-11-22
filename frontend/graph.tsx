import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Save } from './model';

interface Point {
  id: string;
  target: string;
  current: boolean;
  y: number;
}
function curve(from: number, to: number) {
  const bend = Math.min(18, Math.abs(to - from) / 2) * Math.sign(to - from);
  return `M30 ${from} Q8 ${from} 8 ${from + bend} V${to - bend} Q8 ${to} 30 ${to}`;
}

export function HistoryGraph(props: { rows: Save[] }) {
  let svg: SVGSVGElement;
  const [points, setPoints] = createSignal<Point[]>([]);
  createEffect(
    () => props.rows,
    () => {
      const timeline = svg.parentElement;
      const rows = [...timeline.querySelectorAll<HTMLElement>('.point')];
      function measure() {
        setPoints(
          rows.map((row) => ({
            id: row.dataset.id,
            target: row.dataset.target,
            current: row.classList.contains('current'),
            y: row.offsetTop + row.offsetHeight / 2,
          })),
        );
      }
      const observer = new ResizeObserver(measure);
      for (const row of rows) observer.observe(row);
      measure();
      return () => observer.disconnect();
    },
  );
  return (
    <svg ref={svg} aria-hidden="true">
      <Show when={points().length > 0}>
        <path
          d={`M30 ${points()[0].y} V${points().at(-1).y}`}
          stroke="var(--edge)"
        />
      </Show>
      <For each={points()}>
        {(point) => (
          <>
            <Show
              when={point.target && points().find((p) => p.id === point.target)}
            >
              {(target) => (
                <path d={curve(point.y, target().y)} stroke="var(--gold)" />
              )}
            </Show>
            <circle
              cx="30"
              cy={point.y}
              r={point.current ? 7 : 5}
              fill={point.current ? 'var(--mint)' : 'var(--gold)'}
            />
          </>
        )}
      </For>
    </svg>
  );
}
