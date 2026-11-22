export let graphObserver: ResizeObserver;
export function drawGraph(timeline: HTMLElement) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  timeline.prepend(svg);
  function redraw() {
    svg.replaceChildren();
    const points = [...timeline.querySelectorAll<HTMLElement>('.point')];
    const y = (node: HTMLElement) => node.offsetTop + node.offsetHeight / 2;
    function path(d: string, color: string) {
      const line = document.createElementNS(ns, 'path');
      line.setAttribute('d', d);
      line.setAttribute('stroke', color);
      svg.append(line);
    }
    if (points.length)
      path('M30 ' + y(points[0]) + ' V' + y(points.at(-1)), 'var(--edge)');
    for (const p of points) {
      const target = points.find((q) => q.dataset.id === p.dataset.target);
      if (target) {
        const from = y(p),
          to = y(target),
          bend = Math.min(18, Math.abs(to - from) / 2) * Math.sign(to - from);
        path(
          'M30 ' +
            from +
            ' Q8 ' +
            from +
            ' 8 ' +
            (from + bend) +
            ' V' +
            (to - bend) +
            ' Q8 ' +
            to +
            ' 30 ' +
            to,
          'var(--gold)',
        );
      }
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', '30');
      dot.setAttribute('cy', String(y(p)));
      dot.setAttribute('r', p.classList.contains('current') ? '7' : '5');
      dot.setAttribute(
        'fill',
        p.classList.contains('current') ? 'var(--mint)' : 'var(--gold)',
      );
      svg.append(dot);
    }
  }
  graphObserver = new ResizeObserver(redraw);
  graphObserver.observe(timeline);
  redraw();
}
