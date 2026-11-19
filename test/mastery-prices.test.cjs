const test = require('node:test');
const assert = require('node:assert/strict');
const {
  now,
  mockTime,
  finishOrder,
  masterySaved,
  factory,
  purchaseRoom,
  publications,
  checkReadOnly
} = require('../test-support/war-room.cjs');
const R = ['man', 'steel', 'oil', 'gold'];
const writes = tab => tab.sockets.flatMap(publications).filter(p => p.retain);
const priceOf = btn => Object.fromEntries(R.filter(r => btn.dataset[r]).map(r => [r, +btn.dataset[r]]));
function primed(withArchivists) {
  const st = masterySaved(90);
  st.t = now;
  if (withArchivists) st.terr.TRA.u.bd_arch = 9;
  return st;
}
for (const improves of [false, true])
  test(`Dawn's quote ${improves ? 'can fall without overcharging' : 'cannot increase while waiting for the lock'}`, async t => {
    mockTime(t);
    const st = primed(!improves),
      {tab, controls, relay} = purchaseRoom(st, 'dawn');
    tab.click('showmastery', {u: 'bd_init'});
    const button = () => controls().find(x => x.dataset.act === 'mastery' && x.dataset.skill === 'atk');
    const cheap = {gold: 4, steel: 5},
      normal = {gold: 5, steel: 8};
    assert.deepEqual(priceOf(button()), improves ? normal : cheap);
    const order = tab.click('mastery', button().dataset),
      updated = structuredClone(st);
    updated.rev++;
    if (improves) updated.terr.TRA.u.bd_arch = 9;
    else updated.terr.TRA = {o: 'reich', u: {inf: 3}, f: 0, st: 'bunker'};
    relay.message('state', updated);
    await finishOrder(t, order);
    if (!improves) {
      checkReadOnly(tab);
      assert.equal(tab.game.S.rev, 91);
      assert.deepEqual(priceOf(button()), normal);
      assert.match(tab.$('#toasts').children.at(-1).textContent, /price changed/i);
      const retry = tab.click('mastery', button().dataset);
      await finishOrder(t, retry);
    }
    const before = structuredClone(updated);
    factory.tick(before, tab.game.S.t);
    const charged = improves ? cheap : normal;
    for (const r of R)
      assert.equal(tab.game.S.teams.dawn.res[r], before.teams.dawn.res[r] - (charged[r] || 0));
    assert.equal(tab.game.S.teams.dawn.mastery.bd_init.atk, 1);
    assert.equal(writes(tab).length, 1);
  });

test('an increased doctrine price, a changed doctrine rank or duplicate tap is not a second authorization', async t => {
  mockTime(t);
  for (const change of ['price', 'level', 'double tap']) {
    const st = primed(true),
      {tab, controls, relay} = purchaseRoom(st, 'dawn');
    tab.click('tab', {k: 'tech'});
    const b = controls().find(e => e.dataset.act === 'research' && e.dataset.k === 'ind');
    const order = tab.click('research', b.dataset);
    if (change === 'double tap') await tab.click('research', b.dataset);
    else {
      const update = structuredClone(st);
      update.rev++;
      if (change === 'price') delete update.terr.TRA.u.bd_arch;
      else update.teams.dawn.tech.ind++;
      relay.message('state', update);
    }
    await finishOrder(t, order);
    assert.equal(writes(tab).length, change === 'double tap' ? 1 : 0);
    assert.equal(tab.game.S.teams.dawn.tech.ind, change === 'price' ? 0 : 1);
  }
});

test('discount is rounded once per order and charged identically on both recruitment panels', async t => {
  mockTime(t);
  // Exact expected totals independently calculated for 5 × (4 manpower, 5 gold).
  const fees = [
    [20, 25],
    [19, 24],
    [18, 23],
    [17, 21],
    [16, 20],
    [15, 19]
  ];
  for (const section of ['orders', 'troops'])
    for (let rank = 0; rank <= 5; rank++) {
      const st = primed(false),
        T = st.teams.dawn;
      T.mastery = {bd_whis: {atk: 5, def: 5, talent: rank}};
      const [man, gold] = fees[rank];
      Object.assign(T.res, {man, gold});
      const {tab, controls} = purchaseRoom(st, 'dawn', 'chief', 1);
      tab.click('sel', {id: 'BUC'});
      if (section === 'troops') tab.click('tab', {k: 'troops'});
      else tab.click('recruitlist');
      const b = controls().find(x => x.dataset.u === 'bd_whis' && x.dataset.n === '5');
      assert.deepEqual(priceOf(b), {man, gold});
      assert.ok(!b.disabled);
      const old = T.res.gold,
        previous = st.terr.BUC.u.bd_whis || 0;
      const op = tab.click('recruit', b.dataset);
      await finishOrder(t, op);
      const expected = structuredClone(st);
      factory.tick(expected, tab.game.S.t);
      const got = tab.game.S;
      assert.equal(got.terr.BUC.u.bd_whis, previous + 5);
      assert.equal(got.teams.dawn.res.gold, expected.teams.dawn.res.gold - old);
      assert.equal(got.teams.dawn.res.man, expected.teams.dawn.res.man - man);
      assert.equal(writes(tab).length, 1);
    }
});

test('a stock or command point just below the batch minimum, or a live loss of recruitment discounts, prevents payment', async t => {
  mockTime(t);
  const st = primed(false);
  st.teams.dawn.mastery = {bd_whis: {talent: 1}};
  const {tab, controls, relay} = purchaseRoom(st, 'dawn');
  tab.click('sel', {id: 'BUC'});
  tab.click('recruitlist');
  const button = (u, n) => controls().find(e => e.dataset.u === u && +e.dataset.n === n);
  for (const [man, gold, cp] of [
    [18.99, 24, 1],
    [19, 23.99, 1],
    [19, 24, 0.99],
    [19, 24, 1]
  ]) {
    Object.assign(st.teams.dawn.res, {man, gold});
    st.players['Test chief'].cp = cp;
    st.rev++;
    relay.message('state', st);
    assert.equal(button('bd_whis', 5).disabled, man < 19 || gold < 24 || cp < 1);
  }
  Object.assign(st.teams.dawn.res, {man: 100, steel: 100});
  st.rev++;
  relay.message('state', st);
  const order = tab.click('recruit', button('bd_init', 5).dataset);
  for (const p of Object.values(st.terr)) if (p.o === 'dawn') delete p.u.bd_init;
  st.rev++;
  relay.message('state', st);
  await finishOrder(t, order);
  checkReadOnly(tab);
  assert.equal(tab.game.S.rev, st.rev);
});

test('exhaustive roster prices: all 73 formations × 6 ranks × quantities 1..20; integer floor, bounds, monotonicity and no rank-zero change', t => {
  mockTime(t);
  let combinations = 0;
  for (const [team, count] of [
    ['reich', 39],
    ['dawn', 34]
  ]) {
    const st = primed(false),
      {tab, controls} = purchaseRoom(st, team);
    tab.click('tab', {k: 'troops'});
    const ids = controls()
      .filter(e => e.dataset.act === 'showmastery')
      .map(e => e.dataset.u);
    assert.equal(ids.length, count);
    for (const u of ids) {
      const each = factory.recruitCost(st, team, u);
      for (let n = 1; n <= 20; n++) {
        let last;
        for (let rank = 0; rank <= 5; rank++) {
          const cost = factory.recruitCost(st, team, u, n, rank);
          assert.deepEqual(Object.keys(cost), Object.keys(each));
          for (const [r, v] of Object.entries(cost)) {
            assert.ok(Number.isSafeInteger(v) && v >= n);
            if (!rank) assert.equal(v, each[r] * n);
            else assert.ok(v <= last[r]);
          }
          last = cost;
          combinations++;
        }
      }
    }
  }
  assert.equal(combinations, 8760);
});

test('invalid quantity, missing/malformed ceilings and missing rank-two oil reject without any debit', () => {
  const st = primed(false),
    actor = {team: 'dawn', name: 'Tester', now};
  st.players.Tester = {team: 'dawn', role: 'chief', cp: 10};
  for (const n of [0, -1, 1.5, NaN, Infinity, 21, undefined, '5']) {
    const before = JSON.stringify(st);
    assert.ok(
      factory.A.recruit(st, actor, {tid: 'BUC', unit: 'bd_whis', n, quote: {man: 100, gold: 100}}).err
    );
    assert.equal(JSON.stringify(st), before);
  }
  st.teams.dawn.mastery = {bd_init: {atk: 1}};
  for (const quote of [
    null,
    {},
    {gold: 20, steel: 30},
    {gold: NaN, steel: 20, oil: 20},
    {gold: Infinity, steel: 20, oil: 20},
    {gold: '20', steel: 20, oil: 20},
    {gold: 20, steel: -1, oil: 20}
  ]) {
    const before = JSON.stringify(st);
    assert.ok(factory.A.mastery(st, actor, {unit: 'bd_init', skill: 'atk', rank: 2, quote}).err);
    assert.equal(JSON.stringify(st), before);
  }
});

test('the same price ceiling protects a fort upgrade and an annexation when the map changes under the order', async t => {
  mockTime(t);
  for (const a of ['fort', 'annex']) {
    const st = primed(false),
      tid = a === 'fort' ? 'BER' : 'LOW';
    st.terr[tid].u = {inf: 3};
    const {tab, relay, controls} = purchaseRoom(st, 'reich', 'leader');
    tab.click('sel', {id: tid});
    const button = controls().find(x => x.dataset.act === a);
    assert.ok(button && !button.disabled);
    const order = tab.click(a, button.dataset);
    if (a === 'fort') st.terr[tid].f++;
    else st.terr[tid].u.inf++;
    st.rev++;
    relay.message('state', st);
    await finishOrder(t, order);
    assert.match(tab.$('#toasts').children.at(-1).textContent, /price changed/i);
    checkReadOnly(tab);
  }
});

test('real map routes are distinct and symmetric; no CP for a self-move and no absent units subtracted', () => {
  for (const [id, list] of Object.entries(factory.ADJ)) {
    assert.equal(new Set(list.map(n => n.id)).size, list.length);
    assert.ok(list.every(n => n.id !== id && factory.ADJ[n.id].some(r => r.id === id && r.sea === n.sea)));
  }
  const s = primed(false),
    ctx = {team: 'reich', now, name: 'DEB'};
  s.terr.PER = {o: 'reich', u: {inf: 12}, f: 0, st: 'bunker'};
  const old = JSON.stringify(s);
  assert.ok(factory.A.move(s, ctx, {from: 'PER', to: 'PER', grp: {inf: 2}}).err);
  assert.equal(JSON.stringify(s), old);
  const from = 'BER',
    to = factory.ADJ.BER.find(n => !n.sea).id;
  s.terr[from].u = {inf: 12};
  s.terr[to].o = 'neutral';
  for (const grp of [null, [], {inf: 0.5}, {inf: -1}, {notAUnit: 1}, {inf: 13}]) {
    const before = JSON.stringify(s);
    assert.ok(factory.A.attack(s, ctx, {from, to, grp, tactic: 'frontal'}).err);
    assert.equal(JSON.stringify(s), before);
  }
  assert.ok(factory.A.attack(s, ctx, {from, to, grp: {inf: 12, art: 0}, tactic: 'frontal'}).ok);
  assert.equal(s.terr[from].u.art, undefined);
});
