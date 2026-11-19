const test = require('node:test');
const assert = require('node:assert/strict');
const {inspect, launch, now, saved, ceiling} = require('../test-support/war-room.cjs');
const script = inspect([
  'COUNTRIES',
  'HOME',
  'PROVINCES',
  'frontRank',
  'reinforce',
  'expedition',
  'advanceFront',
  'FRONT_MS',
  'countryAt',
  'drillCap',
  'trainingPace',
  'validSave',
  'defPower',
  'resolveBattle'
]);
const e = launch({script, random: () => 0.5, timers: {setInterval() {}, setTimeout() {}}}).game;
const cp = structuredClone;
const total = units => Object.values(units).reduce((a, b) => a + b, 0);
const turn = (s, ts = (s.front?.at || now) + e.FRONT_MS, paired = true) =>
  e.advanceFront(s, ts, s.front?.turn || 0, paired);
const solo = s => turn(s, undefined, false);
function quiet() {
  const s = saved(50);
  for (const [id, t] of Object.entries(s.terr)) if (!e.TD[id].fcap) t.o = 'neutral';
  return s;
}
function island() {
  const s = saved(60);
  for (const [id, t] of Object.entries(s.terr)) {
    t.o = id === 'NIG' ? 'dawn' : 'reich';
    t.u = {};
  }
  s.terr.ICE.o = 'neutral';
  s.terr.ICE.u = {inf: 30};
  return s;
}
test('every initially independent province belongs to exactly one country, with distinct home forces and no duplicate Lima or faction HQ', () => {
  const s = saved(71),
    ids = Object.values(e.COUNTRIES).flatMap(c => c.homes);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.every(id => Object.hasOwn(e.TD, id) && !e.TD[id].fcap));
  assert.equal(Object.values(s.terr).filter(t => t.o === 'neutral').length, 112);
  for (const id of e.PROVINCES) assert.equal(!!e.countryAt(s, id), s.terr[id].o === 'neutral', id);
  for (const [id, k] of [
    ['PER', 'PER'],
    ['MOS', 'USSR'],
    ['WDC', 'USA'],
    ['TOK', 'JPN']
  ])
    assert.equal(e.countryAt(s, id), k);
  assert.deepEqual(
    ['USSR', 'USA', 'JPN'].map(k => e.COUNTRIES[k].specialty),
    ['arm', 'air', 'nav']
  );
  assert.equal(s.v, 7);
  assert.equal(s.front, undefined);
  assert.ok(e.validSave(s));
});
test('independents train once per country, not per province; specialties, bounded rebuilding and real defensive strength', () => {
  const s = quiet();
  for (const id of ['MOS', 'WDC', 'TOK', 'PER']) s.terr[id].u = {inf: 1};
  const originals = cp(s.terr),
    officers = cp(s.players),
    teams = cp(s.teams);
  assert.ok(turn(s));
  assert.equal(s.front.turn, 1);
  for (const [id, k] of [
    ['MOS', 'USSR'],
    ['WDC', 'USA'],
    ['TOK', 'JPN'],
    ['PER', 'PER']
  ]) {
    assert.equal(s.front.drill[k], 1);
    assert.equal(total(s.terr[id].u) - total(originals[id].u), k === 'PER' ? 1 : 5);
  }
  for (let i = 0; i < 35; i++) turn(s);
  const caps = cp(s.terr);
  for (const [id, k] of [
    ['MOS', 'USSR'],
    ['WDC', 'USA'],
    ['TOK', 'JPN']
  ]) {
    assert.equal(e.frontRank(s, k), 5);
    assert.equal(s.front.drill[k], e.drillCap(k));
    assert.ok(s.terr[id].u[e.COUNTRIES[k].specialty] >= 8);
    assert.ok(
      e.defPower(s, id, 'frontal', 'dawn', 1, {}) > e.defPower(s, 'PER', 'frontal', 'dawn', 1, {}) * 1.5
    );
  }
  assert.equal(turn(s), false, 'saturated, nowhere to attack: no empty turn');
  assert.deepEqual(cp(s.terr), caps);
  assert.deepEqual(cp(s.players), officers);
  assert.deepEqual(cp(s.teams), teams);
  s.terr.MOS.u.arm -= 5;
  assert.ok(turn(s));
  assert.equal(s.terr.MOS.u.arm, caps.MOS.u.arm);
  s.terr.MOS.u.arm += 40;
  assert.equal(turn(s), false);
  assert.equal(s.terr.MOS.u.arm, caps.MOS.u.arm + 40, 'never delete legacy troops above cap');
});
test('the pace responds to either faction’s progress but never gains a drill from a projection or a missed interval', () => {
  for (const team of ['reich', 'dawn'])
    for (const route of ['doctrine', 'mastery', 'expansion']) {
      const s = saved(50);
      const old = cp(s.terr);
      e.tick(s, now + 31 * 86400000);
      assert.deepEqual(cp(s.terr), old);
      assert.equal(s.front, undefined);
      assert.equal(e.trainingPace(s), 1);
      if (route === 'doctrine') s.teams[team].tech.ind = 3;
      else if (route === 'mastery') s.teams[team].mastery = {[team === 'reich' ? 'inf' : 'bd_init']: {vit: 3}};
      else
        for (const id of e.PROVINCES.filter(id => e.TD[id].owner0 === 'neutral').slice(0, 8))
          s.terr[id].o = team;
      assert.equal(e.trainingPace(s), 2);
      assert.ok(turn(s, s.t));
      assert.ok(s.front.drill.JPN >= 2);
      const first = cp(s.front);
      assert.ok(!turn(s, s.t + e.FRONT_MS - 1));
      assert.equal(e.advanceFront(s, s.t + 5 * 86400000, 0), false);
      assert.deepEqual(cp(s.front), first);
      assert.ok(turn(s, s.t + 5 * 86400000));
      assert.equal(s.front.turn, 2);
      assert.ok(s.front.drill.JPN - first.drill.JPN <= 3); // at most one normal turn plus combat experience
    }
});
test('a minor island cannot sortie without a fleet; survivors occupy a connected player province and can be recaptured or annexed', () => {
  const s = island();
  s.terr.ICE.u = {inf: 40};
  // Early-game doctrine, no accelerated training from the artificial ownership fixture.
  for (const t of Object.values(s.terr)) if (t.o === 'reich' && t !== s.terr.BER) t.o = 'neutral';
  for (const n of e.ADJ.ICE) s.terr[n.id].o = 'reich';
  // Put only ICE in the attack pool: every other independent has no expedition yet.
  for (const [id, t] of Object.entries(s.terr)) if (id !== 'ICE' && t.o === 'neutral') t.u = {};
  assert.ok(turn(s));
  assert.equal(s.terr.ICE.u.nav, undefined);
  assert.ok(!s.log.some(l => l.kind === 'front' && l.from === 'ICE'));
  // One independent country, all adjacent player stacks empty. Use both roles' actual capture paths.
  const x = island();
  x.terr.ICE.u = {inf: 30, nav: 5};
  const stock = cp(x.terr.ICE.u);
  for (const n of e.ADJ.ICE) {
    x.terr[n.id].f = 2;
    x.intel.reich[n.id] = now + 1000;
    x.intel.dawn[n.id] = now + 1000;
  }
  assert.ok(turn(x));
  const report = x.log[0];
  assert.equal(report.from, 'ICE');
  assert.equal(report.country, 'ISL');
  assert.equal(report.win, true);
  assert.ok(e.ADJ.ICE.some(n => n.sea && n.id === report.tid));
  const land = x.terr[report.tid];
  assert.equal(land.o, 'neutral');
  assert.equal(land.country, 'ISL');
  assert.equal(land.f, 1);
  assert.ok(land.u.nav > 0);
  assert.ok(total(x.terr.ICE.u) >= 2);
  assert.ok(x.terr.ICE.u.inf + land.u.inf <= stock.inf);
  assert.equal(x.intel.reich[report.tid], undefined);
  assert.equal(x.intel.dawn[report.tid], undefined);
  for (const how of ['annex', 'attack']) {
    const y = cp(x),
      to = report.tid,
      from = e.ADJ[to].find(n => n.id !== 'ICE').id;
    y.terr[from].o = 'reich';
    y.terr[from].u = {inf: 300, nav: 12};
    y.terr[to].u = {inf: 1};
    y.teams.reich.tech.nav = 4;
    const result = e.A[how](
      y,
      {team: 'reich', name: 'DEB', now},
      {from, to, tid: to, grp: {inf: 100, nav: 5}, tactic: 'frontal', quote: ceiling}
    );
    assert.ok(result.ok, result.err);
    assert.equal(y.terr[to].o, 'reich');
    assert.equal(y.terr[to].country, undefined);
    assert.equal(e.countryAt(y, to), null);
  }
});
test('a repelled army loses real troops, survivors return, and the same country can rebuild after the battle', () => {
  const s = island();
  s.front = {turn: 20, at: now, drill: {ISL: e.drillCap('ISL')}};
  s.terr.ICE.u = {inf: 14, nav: 2, art: 4, arm: 2};
  for (const {id} of e.ADJ.ICE) s.terr[id].u = {inf: 100};
  assert.ok(turn(s));
  const r = s.log[0];
  assert.equal(r.from, 'ICE');
  assert.equal(r.win, false);
  const [sent, lost, defLost] = r.msg
    .match(/(\d+) sent, (\d+) lost; (\d+) defenders lost/)
    .slice(1)
    .map(Number);
  assert.ok(lost > 0 && lost < sent); // Full garrison: no replacements before the sortie.
  assert.equal(total(s.terr.ICE.u), 22 - lost);
  assert.equal(total(s.terr[r.tid].u), 100 - defLost);
  for (const {id} of e.ADJ.ICE) s.terr[id].o = 'neutral'; // No further legal target for Iceland.
  const n = total(s.terr.ICE.u);
  assert.ok(turn(s));
  assert.equal(total(s.terr.ICE.u) - n, Math.min(lost, 3));
  assert.notEqual(s.log[0].from, 'ICE');
});
test('1,000 seeded turns: correct target faction, routes, alternating fronts, HQs intact, one battle per turn and no negative stacks', () => {
  let seed = 3874221;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const g = launch({script, random: rand, timers: {setTimeout() {}, setInterval() {}}}).game;
  let battles = 0,
    wins = 0,
    losses = 0;
  const countries = new Set(),
    attacked = new Set();
  for (let run = 0; run < 25; run++) {
    const s = saved(555);
    const teams = cp(s.teams),
      hqs = [cp(s.terr.BER), cp(s.terr.NIG)];
    for (let i = 0; i < 40; i++) {
      const prev = Object.fromEntries(Object.entries(s.terr).map(([id, t]) => [id, t.o]));
      const last = s.front?.target;
      const before = Object.fromEntries(g.PROVINCES.map(id => [id, g.countryAt(s, id)]));
      assert.ok(g.advanceFront(s, now + i * g.FRONT_MS, s.front?.turn || 0, true));
      const r = s.log[0];
      if (r.tid) {
        battles++;
        if (r.win) wins++;
        else losses++;
        countries.add(r.country);
        if (prev[r.tid] !== 'neutral') attacked.add(prev[r.tid]);
        if (r.from) {
          assert.equal(before[r.from], r.country);
          assert.ok(g.ADJ[r.from].some(n => n.id === r.tid));
        } else assert.ok(r.recovery, 'only local resistance can fight without an adjacent army');
        if (r.recovery) {
          assert.equal(r.tid, g.COUNTRIES[r.country].homes[0]);
          assert.notEqual(before[r.tid], r.country);
        } else {
          assert.notEqual(prev[r.tid], 'neutral');
          assert.equal(s.front.target, prev[r.tid]);
        }
        assert.equal(s.terr[r.tid].o, r.win ? 'neutral' : prev[r.tid]);
        assert.ok(!g.TD[r.tid].fcap);
        if (r.win) assert.equal(g.countryAt(s, r.tid), r.country);
        if (i < 8 && !r.recovery && last)
          assert.notEqual(s.front.target, last, 'alternate regular raids when both fronts are available');
      }
      assert.equal(s.front.turn, i + 1);
      assert.ok(g.validSave(s));
    }
    assert.deepEqual(cp(s.teams), teams);
    assert.deepEqual([cp(s.terr.BER), cp(s.terr.NIG)], hqs);
  }
  assert.equal(battles, 1000);
  assert.ok(wins > 100 && losses > 100);
  assert.equal(attacked.size, 2);
  assert.ok(countries.has('USSR') && countries.has('USA'));
});
test('total occupation allows local resistance, but victory, malformed metadata and overflow fail closed; reset retains officers', () => {
  const s = island();
  s.terr.ICE.o = 'dawn';
  assert.ok(solo(s));
  assert.ok(s.front.resistance.ISL > 0);
  assert.equal(s.terr.ICE.o, 'dawn');
  const st = saved(60);
  assert.ok(turn(st));
  const snap = cp(st);
  st.win = {team: 'dawn', why: 'fixture', t: now};
  assert.equal(turn(st), false);
  assert.deepEqual(cp(st.terr), snap.terr);
  for (const f of [
    {...snap.front, turn: 0.5},
    {...snap.front, at: Infinity},
    {...snap.front, drill: {USSR: -1}},
    {...snap.front, drill: {JPN: 99}},
    {...snap.front, resistance: {ISL: 19}},
    {...snap.front, resistance: {unknown: 2}},
    {...snap.front, resistance: {ISL: -1}},
    {...snap.front, lastRecovery: 'unknown'},
    {...snap.front, raider: ['USA']}
  ])
    assert.ok(!e.validSave({...snap, front: f}));
  const bad = cp(snap);
  bad.terr.MOS.country = 'unknown';
  assert.ok(!e.validSave(bad));
  const max = cp(snap);
  max.front.turn = Number.MAX_SAFE_INTEGER;
  assert.ok(!turn(max));
  assert.ok(e.A.reset(st, {now: now + 100000}, {rev: st.rev, origin: st.origin, created: st.created}).reset);
  assert.equal(st.front, undefined);
  assert.deepEqual(cp(st.players), snap.players);
});
test('Japan launches a real first-turn naval expedition when a player reaches its Pacific frontier', () => {
  const s = island();
  s.terr.ICE.o = 'reich';
  for (const id of ['TOK', 'OSA']) s.terr[id] = cp(saved(60).terr[id]);
  assert.ok(turn(s));
  const log = s.log[0];
  assert.equal(log.country, 'JPN');
  assert.ok(e.ADJ[log.from].some(n => n.id === log.tid && n.sea));
  assert.ok(log.win);
  assert.ok(s.terr[log.tid].u.nav >= 1);
  assert.equal(s.terr[log.tid].country, 'JPN');
});

for (const owner of ['reich', 'dawn', 'neutral'])
  test(`a solo operation can reclaim Moscow from ${owner} with a bordering Soviet army, without touching HQs or other player lands`, () => {
    const s = quiet();
    s.terr.MOS = {o: owner, u: {inf: 1}, f: 2, st: 'bunker', ...(owner === 'neutral' ? {country: 'USA'} : {})};
    for (const {id} of e.ADJ.MOS) if (e.countryAt(s, id) === 'USSR') s.terr[id].u = {arm: 100};
    s.terr.LOR.o = 'reich'; // an unrelated, empty border is NOT a solo objective
    s.terr.LOR.u = {};
    const before = cp(s.terr);
    s.intel.dawn.MOS = s.intel.reich.MOS = now + 999999;
    assert.ok(solo(s));
    const r = s.log[0];
    assert.equal(r.country, 'USSR');
    assert.equal(r.tid, 'MOS');
    assert.equal(r.recovery, true);
    assert.equal(r.win, true);
    assert.ok(e.ADJ.MOS.some(n => n.id === r.from));
    assert.ok(s.terr[r.from].u.arm < before[r.from].u.arm);
    assert.equal(e.countryAt(s, 'MOS'), 'USSR');
    assert.ok(s.terr.MOS.u.arm > 0);
    assert.equal(s.terr.MOS.f, 1);
    assert.equal(s.intel.dawn.MOS, undefined);
    assert.equal(s.intel.reich.MOS, undefined);
    assert.match(r.msg, /reclaimed its capital/);
    for (let i = 0; i < 5; i++) assert.ok(solo(s));
    assert.equal(s.log.filter(l => l.kind === 'front' && l.tid).length, 1);
    for (const id of ['NIG', 'BER', 'LOR']) assert.deepEqual(cp(s.terr[id]), before[id]);
    assert.ok(e.validSave(s));
  });

test('a dispossessed one-province country musters only on turns, takes real losses, and can liberate its own capital', () => {
  const s = quiet();
  s.terr.ICE = {o: 'dawn', u: {bd_init: 1000}, f: 2, st: 'bunker'};
  const untilAttempt = () => {
    for (let i = 0; i < 15; i++) {
      assert.ok(solo(s));
      if (s.log[0].recovery) return s.log[0];
      assert.equal(s.terr.ICE.o, 'dawn');
    }
    assert.fail('no resistance attempt');
  };
  assert.ok(solo(s));
  assert.equal(s.front.resistance.ISL, 1);
  assert.equal(s.terr.ICE.u.bd_init, 1000, 'mustering does not spend the occupying army');
  assert.equal(e.advanceFront(s, s.front.at + 400, s.front.turn), false);
  assert.equal(s.front.resistance.ISL, 1);
  const r = untilAttempt();
  assert.equal(r.tid, 'ICE');
  assert.equal(r.from, undefined);
  assert.equal(r.win, false);
  assert.match(r.msg, /Local resistance/);
  const [sent, lost, defLost] = r.msg
    .match(/(\d+) sent, (\d+) lost; (\d+) defenders lost/)
    .slice(1)
    .map(Number);
  assert.ok(lost > 0 && defLost > 0);
  assert.equal(s.front.resistance.ISL, sent - lost);
  assert.equal(s.terr.ICE.u.bd_init, 1000 - defLost);
  s.terr.ICE.u = {}; // occupier withdrew its garrison
  const liberated = untilAttempt();
  assert.ok(liberated.win);
  assert.equal(liberated.country, 'ISL');
  assert.equal(e.countryAt(s, 'ICE'), 'ISL');
  assert.ok(s.terr.ICE.u.inf > 0);
  assert.equal(s.front.resistance.ISL, undefined);
  assert.ok(e.validSave(s));
});
