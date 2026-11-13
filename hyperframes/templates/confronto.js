// Confronto runtime. Everything on screen during the race is a pure function of one
// number, p (matches elapsed), driven by a single linear tween, so any frame can be
// rendered on its own in any order: HyperFrames seeks the paused timeline per frame.
(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('confronto-data').textContent);
  const T = D.timing;
  const S = D.steps;
  const n = S.length;
  const PITCH = 148;
  const CHIP_W = 136;
  const WINDOW_W = 820;
  const SETTLE = 0.28; // seconds for a new match to settle in bars, chart and strip
  const $ = (id) => document.getElementById(id);
  const zero = { winsA: 0, winsB: 0, draws: 0, goalsA: 0, goalsB: 0 };

  // Long-tail arrival, as cubic-bezier(0.16, 1, 0.3, 1) reads at 30 fps.
  const easeOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(1 - x, 4));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // Strip chips, built once with textContent (data never becomes markup).
  const strip = $('strip');
  const chips = S.map((s, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.left = i * PITCH + 'px';
    chip.style.borderTopColor = s.o === 'a' ? D.colors.a : s.o === 'b' ? D.colors.b : D.colors.draw;
    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = s.label;
    const sc = document.createElement('span');
    sc.className = 's';
    sc.textContent = s.a + '–' + s.b;
    chip.append(d, sc);
    strip.appendChild(chip);
    return chip;
  });

  // Year ticks under the chart.
  const ticks = $('ticks');
  D.ticks.forEach((t) => {
    const span = document.createElement('span');
    span.style.left = t.x + 'px';
    span.textContent = String(t.year);
    ticks.appendChild(span);
  });

  function lastIndexOf(outcome, k) {
    for (let i = k - 1; i >= 0; i -= 1) if (S[i].o === outcome) return i;
    return -1;
  }

  function pop(el, outcome, k, p) {
    const i = lastIndexOf(outcome, k);
    const since = i < 0 ? Infinity : (p - i) * T.perMatch;
    const s = since < 1.2 ? 1 + 0.14 * Math.exp(-since * 7) : 1;
    el.style.transform = 'scale(' + s.toFixed(4) + ')';
  }

  function pct(x, total) {
    return total === 0 ? '' : Math.round((x / total) * 100) + '%';
  }

  function chartPath(k, e) {
    if (k === 0) return { line: '', area: '', dot: null };
    const P = D.chart.points;
    const pts = [];
    for (let i = 0; i < k; i += 1) pts.push([P[i][0], P[i][1]]);
    if (k >= 2) {
      const prev = P[k - 2];
      const cur = P[k - 1];
      pts[k - 1] = [prev[0] + (cur[0] - prev[0]) * e, prev[1] + (cur[1] - prev[1]) * e];
    }
    const z = D.chart.zero;
    const line = pts.map((pt, i) => (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    const area = line + ' L' + last[0].toFixed(1) + ' ' + z + ' L' + pts[0][0].toFixed(1) + ' ' + z + ' Z';
    return { line, area, dot: last };
  }

  const el = {
    winsA: $('wins-a'),
    winsB: $('wins-b'),
    draws: $('draws'),
    goalsA: $('goals-a'),
    goalsB: $('goals-b'),
    segA: $('seg-a'),
    segD: $('seg-d'),
    segB: $('seg-b'),
    pctA: $('pct-a'),
    pctD: $('pct-d'),
    pctB: $('pct-b'),
    lead: $('lead-pill'),
    line: $('chart-line'),
    areaUp: $('chart-area-up'),
    areaDown: $('chart-area-down'),
    dot: $('chart-dot'),
    detail: $('detail'),
    year: $('year'),
    progress: $('progress'),
  };

  function render(p) {
    const k = p < 0 ? 0 : Math.min(n, Math.floor(p) + 1);
    const age = k === 0 ? 0 : (p - (k - 1)) * T.perMatch;
    const e = easeOut(clamp01(age / SETTLE));
    const cur = k === 0 ? zero : S[k - 1].t;
    const prev = k < 2 ? zero : S[k - 2].t;

    el.winsA.textContent = cur.winsA;
    el.winsB.textContent = cur.winsB;
    el.draws.textContent = cur.draws;
    el.goalsA.textContent = D.labels.goals(cur.goalsA);
    el.goalsB.textContent = D.labels.goals(cur.goalsB);
    pop(el.winsA, 'a', k, p);
    pop(el.winsB, 'b', k, p);
    pop(el.draws, 'draw', k, p);

    const mix = (key) => prev[key] + (cur[key] - prev[key]) * e;
    const total = mix('winsA') + mix('winsB') + mix('draws');
    const wa = total ? (mix('winsA') / total) * 100 : 0;
    const wd = total ? (mix('draws') / total) * 100 : 0;
    const wb = total ? (mix('winsB') / total) * 100 : 0;
    el.segA.style.left = '0%';
    el.segA.style.width = wa + '%';
    el.segD.style.left = wa + '%';
    el.segD.style.width = wd + '%';
    el.segB.style.left = wa + wd + '%';
    el.segB.style.width = wb + '%';
    const games = cur.winsA + cur.winsB + cur.draws;
    el.pctA.textContent = pct(cur.winsA, games);
    el.pctD.textContent = pct(cur.draws, games);
    el.pctB.textContent = pct(cur.winsB, games);

    const diff = cur.winsA - cur.winsB;
    const lead = diff > 0 ? D.lead.a : diff < 0 ? D.lead.b : D.lead.tie;
    el.lead.textContent = k === 0 ? D.lead.start : lead.text.replace('{n}', String(Math.abs(diff)));
    el.lead.style.background = k === 0 ? '' : lead.bg;
    el.lead.style.color = k === 0 ? '' : lead.ink;

    const c = chartPath(k, e);
    el.line.setAttribute('d', c.line);
    el.areaUp.setAttribute('d', c.area);
    el.areaDown.setAttribute('d', c.area);
    if (c.dot) {
      el.dot.setAttribute('cx', c.dot[0].toFixed(1));
      el.dot.setAttribute('cy', c.dot[1].toFixed(1));
      el.dot.setAttribute('r', '7');
    } else {
      el.dot.setAttribute('r', '0');
    }

    const at = k - 1; // chip of the current match
    const offset = WINDOW_W - CHIP_W - (at - 1 + e) * PITCH;
    strip.style.transform = 'translateX(' + offset.toFixed(1) + 'px)';
    for (let i = 0; i < n; i += 1) {
      const chip = chips[i];
      if (i > at || i < at - 7) {
        chip.style.display = 'none';
        continue;
      }
      chip.style.display = '';
      const behind = at - i;
      chip.style.opacity = behind === 0 ? String(e) : String(Math.max(0.25, 0.85 - behind * 0.1));
      chip.style.outline = behind === 0 ? '2px solid rgba(255,255,255,0.85)' : 'none';
    }

    if (k === 0) {
      el.detail.textContent = '';
      el.year.textContent = String(S[0].y);
      el.progress.textContent = D.labels.progress(0, n);
    } else {
      const s = S[k - 1];
      el.detail.textContent = D.short.a + ' ' + s.a + '–' + s.b + ' ' + D.short.b + ' · ' + s.c + (s.pl ? ' · ' + s.pl : '');
      el.year.textContent = String(s.y);
      el.progress.textContent = D.labels.progress(k, n);
    }
  }

  // Label functions cannot travel in JSON; rebuild them from templates.
  D.labels = {
    goals: (g) => D.text.goals.replace('{n}', String(g)),
    progress: (k, total) => D.text.progress.replace('{k}', String(k)).replace('{n}', String(total)),
  };

  const tl = gsap.timeline({ paused: true });
  tl.from(
    '.intro',
    { opacity: 0, y: 40, duration: 0.9, ease: 'expo.out', stagger: 0.08, immediateRender: true },
    0.1,
  );

  const race = { p: -1 };
  render(-1);
  tl.fromTo(
    race,
    { p: -1 },
    {
      p: n,
      duration: T.race + T.perMatch,
      ease: 'none',
      immediateRender: false,
      onUpdate: () => render(race.p),
    },
    T.intro - T.perMatch,
  );

  const outro = T.intro + T.race + T.hold;
  tl.to('.race-only', { opacity: 0, y: -12, duration: 0.4, ease: 'power2.in' }, outro);
  tl.fromTo(
    '.verdict .row',
    { opacity: 0, y: 24 },
    // One row per 1.2 s: reading pace, and no stretch over 2 s without a change on screen.
    { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 1.2 },
    outro + 0.3,
  );
  tl.fromTo('#outro-line', { scaleX: 0 }, { scaleX: 1, duration: T.outro - 0.6, ease: 'none' }, outro + 0.4);
  // Pin the timeline's end to the composition's duration.
  tl.set({}, {}, T.total);

  window.__timelines = window.__timelines || {};
  window.__timelines.root = tl;
})();
