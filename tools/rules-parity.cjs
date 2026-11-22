// Compare unchanged zero-rank Mastery combat and economy to the actual previous engine with
// identical random rolls, not to an approximation of its combat/economy formulas.
const vm = require('node:vm'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const {join} = require('node:path');
if (!process.env.EOT_CLASSIC_HTML) throw Error('Set EOT_CLASSIC_HTML to the pre-mastery index.html.');
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function engine(path) {
  const script = fs.readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const i = script.indexOf('/* ============================ STORE & REAL-TIME MULTIPLAYER');
  assert.ok(i > 0);
  const math = Object.create(Math);
  const game = vm.runInNewContext(
    script.slice(0, i) + 'return {A,newGame,UNITS,TACT,ADJ,TIDS,TKEYS,unitsFor,tick,checkWin};})();',
    {Math: math}
  );
  return {...game, rolls: i => (math.random = rng(i))};
}
const old = engine(process.env.EOT_CLASSIC_HTML),
  next = engine(join(__dirname, '../index.html')),
  now = 1700000000000;
const seed = Number(process.env.EOT_PARITY_SEED ?? 911847),
  cases = Number(process.env.EOT_PARITY_BATTLES ?? 1200);
assert.ok(
  Number.isSafeInteger(seed) && Number.isSafeInteger(cases) && cases > 0,
  'Use an integer seed and a positive battle count.'
);
// Normalize personal CP and the version tag; the engine comparison uses identical garrisons.
function asPersonal(s) {
  s.v = 7;
  s.ruleset = 'mastery-1';
  for (const pl of Object.values(s.players)) pl.cp = s.teams[pl.team].cp;
  for (const side of Object.values(s.teams)) delete side.cp;
  return s;
}
const officer = team => (team === 'reich' ? 'Sattyaki' : 'Anish');
const st = old.newGame(now),
  random = rng(seed);
const initial = asPersonal(structuredClone(st)),
  actual = structuredClone(require('../test-support/historical-board.cjs')(next,now,false)); // compare the retained historical layout, not a new room
// Only the HQ-specific bonuses move; the two provinces retain their own base garrisons.
for (const u of ['bd_mant', 'bd_rave', 'bd_obsv', 'bd_whis', 'bd_fact']) {
  const old = initial.terr.NIG.u[u];
  initial.terr.NIG.u[u] = initial.terr.BUC.u[u];
  if (old) initial.terr.BUC.u[u] = old;
  else delete initial.terr.BUC.u[u];
}
initial.terr.NIG.f = 1;
initial.terr.BUC.f = 0;
assert.equal(actual.players.Dhruv.team, 'reich');
assert.equal(actual.players.Dhruv.role, 'soldier');
delete actual.players.Dhruv;
assert.deepEqual(initial, actual);
for (const t of Object.values(st.teams)) {
  for (const k in t.res) t.res[k] = 100000;
  for (const k in t.tech) t.tech[k] = 4;
}
const copy = s => structuredClone(s),
  pick = list => list[Math.floor(random() * list.length)],
  equal = (a, b, msg) => assert.deepEqual(copy(a), copy(b), msg);
const ceiling = {man: 100000, steel: 100000, oil: 100000, gold: 100000};
let recruits = 0,
  studies = 0,
  battles = 0;
for (const team of ['reich', 'dawn']) {
  const ctx = {team, now, name: officer(team)},
    tid = team === 'reich' ? 'BER' : 'BUC';
  for (const unit of old.unitsFor(team))
    for (let n = 1; n <= 20; n++) {
      const a = copy(st),
        b = asPersonal(copy(a));
      const p = {unit, tid, n};
      const ra = old.A.recruit(a, ctx, p),
        rb = next.A.recruit(b, ctx, {...p, quote: ceiling});
      equal(rb, ra, unit + ' ' + n);
      assert.equal(b.players[ctx.name].cp, a.teams[team].cp);
      equal(b.teams[team], asPersonal(a).teams[team]);
      equal(b.terr[tid], a.terr[tid]);
      recruits++;
    }
  for (const k of old.TKEYS)
    for (let rank = 1; rank <= 4; rank++)
      for (const count of [0, 1, 9]) {
        const a = copy(st);
        a.terr.BUC.u.bd_arch = count;
        a.teams[team].tech[k] = rank - 1;
        const b = asPersonal(copy(a));
        const ra = old.A.research(a, ctx, {k}),
          rb = next.A.research(b, ctx, {k, rank, quote: ceiling});
        // Dawn's receipt now describes Dawn unlocks; the rank, charge and shared log must still match.
        if (team === 'dawn') {
          assert.ok(ra.ok && rb.ok);
          assert.equal(rb.ok.split(':')[0], ra.ok.split(':')[0]);
          equal(b.log, a.log);
        } else equal(rb, ra);
        equal(b.teams, asPersonal(a).teams);
        studies++;
      }
}
// Drop only the legacy map's duplicate/self edges. No legitimate route may disappear or change type.
for (const [id, neighbors] of Object.entries(next.ADJ)) {
  const keys = list => Array.from(list, n => n.id + ':' + n.sea);
  assert.deepEqual(keys(neighbors).sort(), [...new Set(keys(old.ADJ[id].filter(n => n.id !== id)))].sort());
}
const sides = ['reich', 'dawn'],
  stable = t => !['BUC', 'NIG'].includes(t), // their capture/win semantics intentionally changed (tested separately)
  pair = Object.keys(next.ADJ).filter(t => stable(t) && next.ADJ[t].some(n => stable(n.id)));
function group(team) {
  const g = {};
  for (let i = 0, n = 1 + Math.floor(random() * 5); i < n; i++)
    g[pick(team === 'neutral' ? ['inf', 'arm'] : old.unitsFor(team))] = 1 + Math.floor(random() * 75);
  return g;
}
for (let i = 0; i < cases; i++) {
  const a = copy(st),
    team = pick(sides),
    foe = i % 3 ? (team === 'dawn' ? 'reich' : 'dawn') : 'neutral',
    to = pick(pair),
    route = pick(next.ADJ[to].filter(n => stable(n.id))),
    from = route.id;
  const tactic = pick(Object.keys(old.TACT)),
    grp = group(team),
    matching = old.TACT[tactic].units.filter(u => old.UNITS[u].team === team);
  for (const side of sides) for (const k of old.TKEYS) a.teams[side].tech[k] = Math.floor(random() * 5);
  if (old.TACT[tactic].req) {
    const [k, v] = old.TACT[tactic].req;
    a.teams[team].tech[k] = Math.max(v, a.teams[team].tech[k]);
  }
  if (route.sea) {
    grp[team === 'reich' ? 'air' : 'bd_rave'] = 2;
    a.teams[team].tech.air = 4;
  }
  if (i % 7 === 0) a.treach[team] = now + 120000;
  if (matching.length) grp[pick(matching)] = 1 + Math.floor(random() * 30);
  a.terr[from] = {o: team, u: copy(grp), f: 0, st: 'bunker'};
  a.terr[to] = {
    o: foe,
    u: group(foe),
    f: Math.floor(random() * 4),
    st: pick(['elastic', 'counter', 'bunker'])
  };
  const b = asPersonal(copy(a));
  const p = {from, to, grp, tactic},
    ctx = {now, team, name: officer(team)};
  old.rolls(i);
  next.rolls(i);
  const ra = old.A.attack(a, ctx, p),
    rb = next.A.attack(b, ctx, p);
  assert.ok(ra.ok, ra.err);
  equal(rb, ra, 'battle ' + i);
  old.tick(a, now + 60000);
  next.tick(b, now + 60000);
  old.checkWin(a, now + 60000);
  next.checkWin(b, now + 60000);
  asPersonal(a);
  for (const [name, pl] of Object.entries(a.players))
    pl.cp = st.teams[pl.team].cp + 2 - (name === ctx.name ? 2 : 0); // one minute, one attack
  equal(b, a, 'after battle, income and victory check ' + i);
  battles++;
}
console.log(
  `PASS: v7 starting map/roster delta, ${recruits} recruitment orders, ${studies} doctrine orders and ${battles} seeded mixed-formation battles versus the pre-mastery engine (seed ${seed}).`
);
