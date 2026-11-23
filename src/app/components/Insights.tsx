'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { localDay, type DailyCheckin } from '../daily-checkin';
import { QUESTIONS, normalizeAnswers, type AnswerValue } from '../questions';
import { CARES } from '../cares';
import { readMissionLog } from '../missions';
import { summarizeWords } from '../voice';

// Self-reported answers shown as they were given: a flow over time, never a score or a grade.
const LEVEL: Record<AnswerValue, number> = { very_low: 1, low: 2, normal: 3, good: 4, very_good: 5 };
// Validated with the dataviz palette script on #FFFDF5 (CVD and contrast pass).
const SERIES = [
  { index: 3, name: '마음', color: '#C8692C' },
  { index: 1, name: '에너지', color: '#3A72C0' },
] as const;
const W = 320, H = 168, PAD = { l: 34, r: 46, t: 12, b: 24 };
const label = (question: number, value?: AnswerValue) => QUESTIONS[question].options.find(o => o.value === value)?.label ?? '기록 없음';
const shortDate = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

function lastDays(count: number, today = localDay()) {
  const end = new Date(today + 'T00:00:00');
  return Array.from({ length: count }, (_, i) => { const d = new Date(end); d.setDate(end.getDate() - (count - 1 - i)); return localDay(d); });
}
function mostCommon(values: (AnswerValue | undefined)[]) {
  const counts = new Map<AnswerValue, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export default function MoodInsights({ records }: { records: DailyCheckin[] }) {
  const [range, setRange] = useState<14 | 30>(14);
  const [hover, setHover] = useState<number | null>(null);
  const byDate = new Map(records.map(record => [record.date, record]));
  const rows = lastDays(range).map(date => {
    const record = byDate.get(date);
    const answers = record ? normalizeAnswers(record.answers) : [];
    return { date, record, answers: answers.every(Boolean) ? answers : [] };
  });
  const answered = rows.filter(row => row.answers.length);
  const step = (W - PAD.l - PAD.r) / (range - 1);
  const x = (i: number) => PAD.l + i * step;
  const y = (level: number) => PAD.t + ((5 - level) * (H - PAD.t - PAD.b)) / 4;
  const lines = SERIES.map(series => {
    let d = '', pen = false;
    const points: { i: number; level: number }[] = [];
    rows.forEach((row, i) => {
      const value = row.answers[series.index];
      if (!value) { pen = false; return; } // a missing day stays a gap, not a zero
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(LEVEL[value]).toFixed(1);
      pen = true; points.push({ i, level: LEVEL[value] });
    });
    return { ...series, d, points, last: points.at(-1) };
  });
  // Keep the two end labels from overlapping.
  const labelY = lines.map(line => line.last ? y(line.last.level) : 0);
  if (lines[0].last && lines[1].last && Math.abs(labelY[0] - labelY[1]) < 12) { const mid = (labelY[0] + labelY[1]) / 2; labelY[0] = mid - 7; labelY[1] = mid + 7; }

  const careCounts = new Map<string, number>();
  for (const row of rows) for (const id of row.record?.completedCareIds ?? []) careCounts.set(id, (careCounts.get(id) ?? 0) + 1);
  const topCares = [...careCounts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const stats = [
    { name: '기록한 날', value: answered.length },
    { name: '작은 돌봄을 한 날', value: rows.filter(row => row.record?.completedCareIds.length).length },
    { name: '마음이 가벼웠던 날', value: answered.filter(row => LEVEL[row.answers[3]!] >= 4).length },
  ];

  const talk = summarizeWords(rows.map(row => row.date));
  const values = readMissionLog().values;
  const checks = rows.map(row => ({ date: row.date, ...values[row.date] })).filter(v => v.heart || v.breath || v.thought).reverse().slice(0, 7);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(range - 1, Math.round((px - PAD.l) / step))));
  };
  const keys = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setHover(current => Math.max(0, Math.min(range - 1, (current ?? range - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
  };
  const focus = hover === null ? null : rows[hover];

  return <section className="insights" aria-labelledby="insights-title">
    <div className="insights-head">
      <div><span className="eyebrow">나의 마음 흐름</span><h2 id="insights-title">요즘의 마음과 에너지</h2></div>
      <div className="insights-range" role="group" aria-label="기간">{([14, 30] as const).map(days => <button key={days} type="button" aria-pressed={range === days} onClick={() => { setRange(days); setHover(null); }}>{days}일</button>)}</div>
    </div>
    <p className="insights-note">스스로 남긴 답을 그대로 이은 흐름이에요. 점수가 아니라서 높고 낮음에 좋고 나쁨이 없어요.</p>
    {answered.length < 2 ? <p className="insights-empty">기록이 이틀 이상 쌓이면 흐름이 보여요. 천천히 남겨 주세요.</p> : <>
      <ul className="insights-legend" aria-label="범례">{SERIES.map(s => <li key={s.name}><i style={{ background: s.color }}/>{s.name}</li>)}</ul>
      <div className="insights-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${range}일의 마음과 에너지 흐름. 방향키로 날짜를 옮겨 볼 수 있어요.`} tabIndex={0}
          onPointerMove={pick} onPointerLeave={() => setHover(null)} onKeyDown={keys} onBlur={() => setHover(null)}>
          {[1, 3, 5].map(level => <g key={level}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(level)} y2={y(level)} className="insights-grid"/>
            <text x={PAD.l - 6} y={y(level) + 3} textAnchor="end" className="insights-axis">{level === 5 ? '높음' : level === 3 ? '보통' : '낮음'}</text>
          </g>)}
          {[0, Math.floor((range - 1) / 2), range - 1].map(i => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="insights-axis">{i === range - 1 ? '오늘' : shortDate(rows[i].date)}</text>)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="insights-crosshair"/>}
          {lines.map((line, li) => <g key={line.name}>
            <path d={line.d} fill="none" stroke={line.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {line.points.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.level)} r={hover === p.i ? 5 : 4} fill={line.color} stroke="#FFFDF5" strokeWidth="2"/>)}
            {line.last && <text x={x(line.last.i) + 8} y={labelY[li] + 3} className="insights-label">{line.name}</text>}
          </g>)}
        </svg>
        {focus && hover !== null && <div className="insights-tooltip" role="status" style={{ left: `${Math.min(80, Math.max(20, (x(hover) / W) * 100))}%` }}>
          <strong>{shortDate(focus.date)}</strong>
          {focus.answers.length ? SERIES.map(s => <span key={s.name}><i style={{ background: s.color }}/>{s.name} · {label(s.index, focus.answers[s.index])}</span>) : <span>기록하지 않은 날</span>}
        </div>}
      </div>
      <details className="insights-table"><summary>표로 보기</summary>
        <table><thead><tr><th>날짜</th>{['잠', '에너지', '식사', '마음'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{answered.map(row => <tr key={row.date}><td>{shortDate(row.date)}</td>{row.answers.map((v, q) => <td key={q}>{label(q, v)}</td>)}</tr>)}</tbody></table>
      </details>
    </>}
    <dl className="insights-stats">{stats.map(s => <div key={s.name}><dt>{s.name}</dt><dd>{s.value}일</dd></div>)}</dl>
    {answered.length > 0 && <p className="insights-note">요즘 잠은 ‘{label(0, mostCommon(answered.map(r => r.answers[0])))}’, 식사는 ‘{label(2, mostCommon(answered.map(r => r.answers[2])))}’라고 가장 많이 남겼어요.</p>}
    {talk.total > 0 && <div className="insights-talk"><h3>친구에게 자주 한 말</h3>
      <ul className="insights-words">{talk.top.map(([word, n]) => <li key={word}>{word}<span>{n}</span></li>)}</ul>
      <dl className="insights-stats insights-stats--two"><div><dt>긍정 단어</dt><dd>{talk.positiveCount}번</dd></div><div><dt>부정 단어</dt><dd>{talk.negativeCount}번</dd></div></dl>
      {(talk.positive.length > 0 || talk.negative.length > 0) && <p className="insights-note">
        {talk.positive.length > 0 && <>자주 쓴 긍정 단어: {talk.positive.map(([w]) => w).join(', ')}. </>}
        {talk.negative.length > 0 && <>자주 쓴 부정 단어: {talk.negative.map(([w]) => w).join(', ')}.</>}</p>}
      <p className="insights-note">단어 개수를 셌을 뿐 마음을 판단하지 않아요. ‘안 좋아’처럼 부정하는 말은 구분하지 못해요.</p>
    </div>}
    {checks.length > 0 && <div className="insights-cares"><h3>1분 동안 나를 살핀 기록</h3>
      <table className="insights-checks"><thead><tr><th>날짜</th><th>심박</th><th>호흡</th><th>떠오른 것</th></tr></thead>
        <tbody>{checks.map(c => <tr key={c.date}><td>{shortDate(c.date)}</td><td>{c.heart ? `${c.heart}회` : '—'}</td><td>{c.breath ? `${c.breath}회` : '—'}</td><td>{c.thought ?? '—'}</td></tr>)}</tbody></table>
      <p className="insights-note">스스로 센 1분 기록이라 의료 측정이 아니에요.</p>
    </div>}
    {topCares.length > 0 && <div className="insights-cares"><h3>자주 한 작은 돌봄</h3><ol>{topCares.map(([id, count]) => <li key={id}><span>{CARES.find(c => c.id === id)?.title ?? id}</span><strong>{count}번</strong></li>)}</ol></div>}
  </section>;
}
