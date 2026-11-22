const historicalBoard = require('../test-support/historical-board.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  now,
  mockTime,
  finishOrder,
  launch,
  inspect,
  saved,
  masterySaved,
  purchaseRoom,
  publications,
  checkReadOnly,
  ceiling,
  enlist
} = require('../test-support/war-room.cjs');
let roll = 0;
const g = launch({
  script: inspect(['validSave']),
  random: () => roll,
  timers: {setInterval() {}, setTimeout() {}}
}).game;
const actor = {name: 'DEB', team: 'reich', now};
const closeTo = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);
const balances = s => Object.fromEntries(Object.entries(s.players).map(([n, p]) => [n, p.cp]));

// Exercise the real income clock, including when other orders split a refill into many small ticks.
test('every post starts at 10 and earns exactly one spendable CP per 30 seconds, without faction modifiers or overflow', () => {
  const s = historicalBoard(g, now);
  Object.assign(s.terr.NIG.u, {bd_silv: 10, bd_csha: 10, bd_hera: 10, bd_hier: 1});
  assert.ok(Object.values(s.players).every(p => p.cp === 10));
  assert.ok(Object.values(s.teams).every(t => !('cp' in t)));
  for (let ms = 1; ms < 30000; ms += 367) g.tick(s, now + ms);
  g.tick(s, now + 29999);
  assert.ok(Object.values(s.players).every(p => Math.floor(p.cp) === 10));
  g.tick(s, now + 30000);
  assert.ok(Object.values(s.players).every(p => p.cp === 11));
  const later = now + 86400000;
  g.tick(s, later);
  assert.ok(Object.values(s.players).every(p => p.cp === 20));
  assert.ok(g.A.stance(s, {...actor, now: later}, {tid: 'BER', st: 'elastic'}).ok);
  g.tick(s, later - 1); // no backwards income (or banked surplus from yesterday)
  assert.equal(s.t, later);
  assert.equal(s.players.DEB.cp, 19);
  g.tick(s, later + 29999);
  assert.equal(Math.floor(s.players.DEB.cp), 19);
  assert.equal(s.players.Sattyaki.cp, 20);
  g.tick(s, later + 30000);
  assert.equal(s.players.DEB.cp, 20);
});

test('each priced order checks and charges its issuer, never borrowing a teammate’s CP or paying for a rejected order', () => {
  roll = 0.99; // unsuccessful covert ops, so there is no secondary enemy loss
  const methods = [
    ['recruit', 1, {tid: 'BER', unit: 'inf', n: 5, quote: ceiling}],
    ['fort', 1, {tid: 'BER', rank: 2, quote: ceiling}],
    ['stance', 1, {tid: 'BER', st: 'elastic'}],
    ['move', 1, {from: 'RIO', to: 'BSB', grp: {inf: 1}}],
    ['attack', 2, {from: 'RIO', to: 'BSB', grp: {inf: 1}, tactic: 'frontal'}],
    ['spy', 2, {tid: 'NIG'}],
    ['honey', 3, {tid: 'NIG'}],
    ['sabotage', 3, {tid: 'NIG'}],
    ['decap', 4, {tid: 'NIG'}],
    ['annex', 2, {tid: 'DEN', quote: ceiling}],
    ['propose', 1, {type: 'ceasefire', mins: 60}]
  ];
  for (const [order, cost, payload] of methods) {
    const s = historicalBoard(g, now);
    s.teams.reich.tech.intel = 4;
    s.teams.reich.res.gold = 1000;
    s.terr.RIO = {o: 'reich', u: {inf: 5}, f: 0, st: 'bunker'};
    s.terr.BSB.o = order === 'move' ? 'reich' : 'neutral';
    s.terr.DEN.u = {};
    if (order === 'recruit') s.players.DEB.role = 'chief';
    s.players.DEB.cp = cost - 0.01;
    const before = structuredClone(s);
    for (const name of ['DEB', 'absent post', 'Anish']) {
      assert.match(
        g.A[order](s, {...actor, name}, payload).err,
        /command point|staff chief|attack seat/i,
        order
      );
      assert.deepEqual(structuredClone(s), before, order);
    }
    s.players.DEB.cp = cost + 0.25;
    const expected = {...balances(s), DEB: 0.25};
    const result = g.A[order](s, actor, payload);
    assert.ok(result.ok, `${order}: ${result.err}`);
    assert.deepEqual(balances(s), expected, order);
  }
});

test('a successful honeytrap or decapitation affects at most one enemy post and never takes a partial point', () => {
  roll = 0;
  for (const [order, cost, cut] of [
    ['honey', 3, 2],
    ['decap', 4, 6]
  ]) {
    for (const available of [10, 1.25, 0.5]) {
      const s = historicalBoard(g, now);
      s.teams.reich.tech.intel = 4;
      s.teams.reich.res.gold = 100;
      for (const p of Object.values(s.players)) if (p.team === 'dawn') p.cp = available;
      const result = g.A[order](s, actor, {tid: 'NIG'});
      assert.ok(result.ok, result.err);
      const foes = Object.values(s.players).filter(p => p.team === 'dawn');
      assert.deepEqual(
        foes.filter(p => p.cp !== available).map(p => p.cp),
        available < 1 ? [] : [available - Math.min(cut, Math.floor(available))]
      );
      assert.match(result.ok, available < 1 ? /No enemy officer/ : /One enemy officer lost/);
      assert.equal(s.players.DEB.cp, 10 - cost);
      assert.equal(s.players.Sattyaki.cp, 10);
      assert.ok(order === 'honey' ? s.intel.reich.NIG > now : s.terr.NIG.f === 0);
    }
  }
});

test('new enlistees get a fresh budget, role changes keep it and a new war resets CP without resetting identities', () => {
  const s = historicalBoard(g, now);
  s.ruleset = 'mastery-1';
  const later = now + 300000;
  g.tick(s, later);
  assert.ok(g.A.enlist(s, {now: later}, enlist).ok);
  const post = s.players[enlist.name];
  assert.equal(post.cp, 10);
  assert.equal(s.players.Anish.cp, 20);
  post.cp = 0;
  const chief = {name: 'Syamantak Kar', team: 'dawn', now: later};
  assert.ok(g.A.setrole(s, chief, {name: enlist.name, role: 'chief', title: 'Quartermaster'}).ok);
  assert.equal(post.cp, 0);
  // These previously free actions still draw no CP.
  assert.ok(g.A.contribute(s, {...chief, name: enlist.name}, {kind: 'drill'}).ok);
  assert.ok(g.A.research(s, {...chief, name: enlist.name}, {k: 'ind', rank: 1, quote: ceiling}).ok);
  assert.ok(
    g.A.mastery(s, {...chief, name: enlist.name}, {unit: 'bd_init', skill: 'atk', rank: 1, quote: ceiling}).ok
  );
  assert.equal(post.cp, 0);
  const before = structuredClone(post);
  assert.ok(g.A.reset(s, chief, {created: s.created, rev: s.rev, origin: s.origin}).reset);
  assert.deepEqual(structuredClone(s.players[enlist.name]), {...before, cp: 10});
  assert.ok(Object.values(s.players).every(p => p.cp === 10));
  assert.equal(s.ruleset, 'mastery-1');
});

test('v6 accepts a legacy source balance only for missing personal CP; malformed budgets never authorize a save', () => {
  const s = saved(30);
  s.v = 6;
  s.teams.reich.cp = 4.5;
  s.teams.dawn.cp = 0.99999;
  delete s.players.Anish.cp;
  delete s.players.DEB.cp;
  s.players.Sattyaki.cp = 0;
  assert.ok(g.validSave(s));
  g.tick(s, s.t); // migrate even if no time elapsed, without replacing a legitimate zero
  assert.equal(s.players.DEB.cp, 4.5);
  assert.equal(s.players.Anish.cp, 0.99999); // no free CP for rounding a legacy balance up
  assert.equal(s.players.Sattyaki.cp, 0);
  assert.equal(s.teams.reich.cp, undefined);
  assert.ok(g.validSave(s));
  delete s.players.DEB.cp;
  assert.ok(!g.validSave(s));
  s.teams.reich.cp = 4.5;
  for (const invalid of [-1, 20.01, '10', null, NaN, Infinity]) {
    s.players.DEB.cp = invalid;
    assert.ok(!g.validSave(s), String(invalid));
  }
});

const identity = name => ({name, ph: 'test-only'});
function connect(st, who) {
  const tab = launch({cached: st, rules: st.ruleset, identity: who, relay: 'emqx'}),
    [relay] = tab.sockets;
  relay.subscribe();
  relay.message('state', st);
  return {tab, relay};
}
const hud = tab => tab.$('#hud').innerHTML.replace(/<[^>]*>/g, '');
test(`Mastery: budget preview is read-only; two teammates can each spend their last CP, but a second device on the same post cannot`, async t => {
  mockTime(t);
  const st = saved(80);
  st.players.Sattyaki.role = st.players.Utkarsh.role = 'soldier';
  st.t = now;
  st.teams.reich.cp = 0;
  st.teams.dawn.cp = 6.5;
  for (const n of ['Alice', 'Bea']) st.players[n] = {team: 'reich', role: 'chief', pw: identity(n).ph};
  for (const pl of Object.values(st.players)) pl.cp = st.teams[pl.team].cp;
  for (const side of Object.values(st.teams)) delete side.cp;
  const a = connect(st, identity('Alice')),
    b = connect(st, identity('Bea')),
    duplicate = connect(st, identity('Alice')),
    spectator = connect(st, {name: '__spectator'});
  assert.doesNotMatch(hud(spectator.tab), /Your CP/);
  t.mock.timers.tick(29999);
  assert.match(hud(a.tab), /Your CP0\/20/);
  t.mock.timers.tick(1);
  for (const {tab} of [a, b, duplicate]) {
    assert.match(hud(tab), /Your CP1\/20\+1\/30s/);
    assert.deepEqual(structuredClone(tab.game.S), structuredClone(st));
    checkReadOnly(tab);
  }
  const payload = {tid: 'BER', unit: 'inf', n: 1, quote: ceiling, name: 'Sattyaki'};
  await finishOrder(t, b.tab.game.act('recruit', payload));
  const one = b.tab.game.S;
  assert.equal(one.rev, 81);
  closeTo(one.players.Bea.cp, (one.t - now) / 30000 - 1);
  closeTo(one.players.Alice.cp, (one.t - now) / 30000);
  // The order was opened on the older snapshot; recheck on the newly locked state.
  const second = a.tab.game.act('recruit', payload);
  a.relay.message('state', one);
  await finishOrder(t, second);
  const two = a.tab.game.S;
  assert.equal(two.rev, 82);
  assert.equal(two.terr.BER.u.inf, st.terr.BER.u.inf + 2);
  for (const [name, pl] of Object.entries(two.players)) {
    const start = st.players[name].cp,
      spent = ['Alice', 'Bea'].includes(name) ? 1 : 0;
    closeTo(pl.cp, start + (two.t - now) / 30000 - spent);
  }
  assert.ok(Object.values(two.teams).every(side => !('cp' in side)));
  assert.ok(g.validSave(two));
  const stale = duplicate.tab.game.act('recruit', payload);
  duplicate.relay.message('state', two);
  await finishOrder(t, stale);
  assert.equal(duplicate.tab.game.S.rev, 82);
  assert.match(duplicate.tab.$('#toasts').children.at(-1).textContent, /command points/);
  checkReadOnly(duplicate.tab);
  for (const {tab} of [a, b]) assert.equal(tab.sockets.flatMap(publications).filter(p => p.retain).length, 1);
  assert.match(hud(connect(two, identity('Alice')).tab), /Your CP0\/20/);
});

test('operation buttons unlock against the signed-in officer’s projected CP, not another officer’s balance', t => {
  mockTime(t);
  const s = saved(8);
  s.t = now;
  s.teams.dawn.tech.intel = 4;
  const {tab, controls} = purchaseRoom(s, 'dawn', 'leader', 0);
  tab.click('sel', {id: 'BER'});
  const actions = {spy: 2, honey: 3, sabotage: 3, decap: 4};
  for (let cp = 0; cp <= 4; cp++) {
    for (const [name, cost] of Object.entries(actions))
      assert.equal(controls().find(b => b.dataset.act === name).disabled, cp < cost, name);
    if (cp < 4) t.mock.timers.tick(30000);
  }
  assert.equal(tab.game.S.players['Test chief'].cp, 0, 'display updates never settle the saved balance');
  checkReadOnly(tab);
});
