const test = require('node:test');
const assert = require('node:assert/strict');
const {
  factory,
  launch,
  inspect,
  now,
  mockTime,
  saved,
  purchaseRoom,
  checkReadOnly,
  finishOrder
} = require('../test-support/war-room.cjs');
const g = launch({
  script: inspect([
    'forceCounts',
    'income',
    'vpOf',
    'countOf',
    'attackRoutes',
    'doctrineText',
    'UNITS',
    'TACT',
    'DAWN_UNITS',
    'TKEYS'
  ]),
  timers: {setTimeout() {}, setInterval() {}}
}).game;
const panel = tab => tab.$('#panel').innerHTML;
const modal = tab => tab.$('#modal').innerHTML;
const blocked = /data-act="confirm" disabled/;
const ready = /data-act="confirm" data-price/;

test('each saved province has one navigable directory entry; North Africa is not Europe', t => {
  mockTime(t);
  const {tab} = purchaseRoom(saved(81), 'reich');
  const ids = () =>
    [...panel(tab).matchAll(/<button class="chip" data-act="goto" data-id="([A-Z]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids().sort(), Object.keys(factory.TD).sort());
  assert.equal(ids().length, 147);
  for (const region of ['Europe', 'Africa']) {
    tab.click('setreg', {r: region});
    assert.deepEqual(
      ids().sort(),
      Object.keys(factory.TD)
        .filter(id => factory.TD[id].reg === region)
        .sort()
    );
    for (const id of ['ALG', 'TUN']) assert.equal(ids().includes(id), region === 'Africa');
  }
  checkReadOnly(tab);
});

test('Lima is one garrison in both recruiters and the locked cap, but retains the historical yield and VP weights', async t => {
  mockTime(t);
  const st = saved(42),
    tid = 'PER',
    unit = 'rk_h18';
  st.t = now;
  const before = {income: g.income(st, 'reich'), vp: g.vpOf(st, 'reich'), lands: g.countOf(st, 'reich')};
  st.terr.PER = {o: 'reich', u: {inf: 1}, f: 0, st: 'bunker'};
  const T = st.teams.reich;
  T.tech.air = 4;
  for (const r in T.res) T.res[r] = 500;
  assert.equal(g.income(st, 'reich').steel - before.income.steel, 2 * factory.TD.PER.amt);
  assert.equal(g.vpOf(st, 'reich') - before.vp, 2 * factory.TD.PER.vp);
  assert.equal(g.countOf(st, 'reich') - before.lands, 1);
  const {tab, controls} = purchaseRoom(st, 'reich');
  const one = () => controls().find(el => el.dataset.u === unit && el.dataset.n === '1');
  tab.click('sel', {id: tid});
  assert.match(panel(tab), /Move units[\s\S]*Recruit here/);
  assert.equal(one(), undefined);
  tab.click('recruitlist');
  await finishOrder(t, tab.click('recruit', one().dataset));
  assert.equal(tab.game.S.terr.PER.u[unit], 1);
  assert.equal(one().disabled, false);
  tab.click('tab', {k: 'troops'});
  assert.match(panel(tab), /Horten H\.XVIII<\/b>[^\n]*?Deployed: <b>1<\/b>\/2/);
  assert.equal(one().disabled, false);
  await finishOrder(t, tab.click('recruit', one().dataset));
  assert.equal(tab.game.S.rev, 44);
  assert.equal(g.forceCounts(tab.game.S, 'reich')[unit], 2);
  assert.equal(one().disabled, true);
  tab.click('sel', {id: 'BER'});
  assert.equal(one(), undefined, 'new province starts collapsed');
  tab.click('recruitlist');
  assert.equal(one().disabled, true, 'cap is faction-wide, not per garrison');
  await finishOrder(
    t,
    tab.game.act('recruit', {tid: 'BER', unit, n: 1, quote: factory.recruitCost(st, 'reich', unit)})
  );
  assert.equal(tab.game.S.rev, 44, 'no third charge or recruitment');
});

test('move previews recheck the chosen group for sea travel; land moves remain available', t => {
  mockTime(t);
  const st = saved(82);
  st.terr.DEN.o = 'reich';
  st.terr.OSL.u = {inf: 3, air: 1};
  st.teams.reich.tech.air = 1;
  const {tab, relay} = purchaseRoom(st, 'reich');
  tab.click('sel', {id: 'OSL'});
  tab.click('open', {m: 'move'});
  tab.click('mto', {id: 'DEN'});
  tab.click('step', {u: 'inf', d: '1'});
  assert.match(modal(tab), blocked);
  assert.match(modal(tab), /Crossing water/);
  t.mock.timers.tick(2000);
  assert.match(modal(tab), blocked);
  tab.click('step', {u: 'air', d: '1'});
  assert.match(modal(tab), blocked, 'mixed group needs more than Air 1');
  st.rev++;
  st.teams.reich.tech.air = 4;
  relay.message('state', st);
  assert.match(modal(tab), ready);
  tab.click('closem');
  tab.click('open', {m: 'move'});
  tab.click('mto', {id: 'NAR'});
  tab.click('step', {u: 'inf', d: '1'});
  assert.match(modal(tab), ready);
  checkReadOnly(tab);
});

test('a remote ceasefire blocks an open opposing-faction attack, not neutral neighbors, and expiry restores the picker', t => {
  mockTime(t);
  const st = saved(83);
  st.t = now;
  st.terr.SWE.o = 'dawn';
  st.teams.reich.tech.arm = 2;
  const {tab, relay} = purchaseRoom(st, 'reich');
  tab.click('sel', {id: 'OSL'});
  tab.click('open', {m: 'attack'});
  tab.change('attackplace', 'SWE');
  tab.click('step', {u: 'inf', d: '1'});
  tab.click('tactic', {k: 'blitz'});
  assert.match(modal(tab), /needs matching units/);
  assert.match(modal(tab), blocked);
  tab.click('tactic', {k: 'frontal'});
  assert.match(modal(tab), ready);
  st.pact = {until: now + 20000, mins: 60};
  st.rev++;
  relay.message('state', st);
  assert.match(modal(tab), /ceasefire is in force/);
  assert.match(modal(tab), blocked);
  assert.deepEqual(
    Array.from(g.attackRoutes(st, 'reich', 'OSL', now), n => n.id),
    ['DEN']
  );
  assert.equal(g.attackRoutes(st, 'reich', 'SWE', now).length, 0);
  const copy = structuredClone(st),
    ctx = {name: 'Test chief', team: 'reich', now};
  assert.ok(g.A.attack(st, ctx, {from: 'OSL', to: 'SWE', grp: {inf: 1}, tactic: 'frontal'}).err);
  assert.deepEqual(structuredClone(st), copy);
  assert.ok(
    g.A.attack(copy, ctx, {from: 'BER', to: 'DEN', grp: {inf: 1}, tactic: 'frontal'}).ok,
    'connected neutral attack is legal'
  );
  t.mock.timers.tick(21000);
  assert.match(modal(tab), ready);
  checkReadOnly(tab);
});

test('Dawn research advertises its actual formation and tactic unlocks, including its purchase receipt', () => {
  const st = saved(32),
    ctx = {name: 'Anish', team: 'dawn', now};
  for (const k of g.TKEYS)
    for (let level = 1; level <= 4; level++) {
      const text = g.doctrineText('dawn', k, level);
      assert.ok(text.length > 0);
      assert.doesNotMatch(text, /Panzer|Pz III|Pz 38|leFH|Type VII|Bf 109|Stuka/);
      for (const data of [...g.DAWN_UNITS.map(u => g.UNITS[u]), ...Object.values(g.TACT)]) {
        if (data.req?.[0] === k && data.req[1] === level)
          assert.ok(text.includes(data.n), `${k} ${level}: ${data.n}`);
      }
    }
  const {ok} = g.A.research(st, ctx, {k: 'arm', rank: 1, quote: factory.researchCost(st, 'dawn', 1)});
  assert.ok(ok.includes(g.doctrineText('dawn', 'arm', 1)));
  assert.match(g.doctrineText('reich', 'arm', 1), /Pz 38/);
});

test('treaty quotes match the resulting penalty and cannot silently become more expensive under the lock', async t => {
  mockTime(t);
  const st = saved(38);
  st.t = now;
  st.pact = {until: now + 3600000, mins: 60};
  st.terr.NIG.u.bd_ocov = 1;
  const {tab, relay, controls} = purchaseRoom(st, 'dawn', 'diplomat');
  tab.click('tab', {k: 'dip'});
  const tear = () => controls().find(b => b.dataset.act === 'breakpact');
  assert.match(panel(tab), /13G, -10% attack for 15 min/);
  assert.equal(tear().dataset.gold, '13');
  const order = tab.click('breakpact', tear().dataset);
  delete st.terr.NIG.u.bd_ocov;
  st.rev++;
  relay.message('state', st);
  await finishOrder(t, order);
  checkReadOnly(tab);
  assert.equal(tab.game.S.pact.until, st.pact.until);
  assert.match(panel(tab), /25G, -10% attack for 30 min/);
  st.terr.NIG.u.bd_ocov = 1;
  st.rev++;
  relay.message('state', st);
  await finishOrder(t, tab.click('breakpact', tear().dataset));
  const end = tab.game.S,
    base = structuredClone(st);
  factory.tick(base, end.t);
  assert.equal(base.teams.dawn.res.gold - end.teams.dawn.res.gold, 13);
  assert.equal(end.treach.dawn - end.t, 15 * 60000);
  assert.equal(end.pact, null);
});

test('a cancelled sign-in cannot finish in a reopened password prompt, a replacement post or another room', async t => {
  mockTime(t);
  const name = 'Test cadet',
    password = 'Fixture Login';
  const hash = require('node:crypto')
    .pbkdf2Sync('FIXTURELOGIN', 'eot-v1:' + name, 100000, 32, 'sha256')
    .toString('hex');
  for (const change of ['back', 'post', 'room']) {
    const st = saved(56);
    st.players[name] = {team: 'dawn', role: 'soldier', title: 'Test', cd: 0, cp: 10, pw: hash};
    const tab = launch({cached: st, relay: 'emqx'}),
      [relay] = tab.sockets;
    relay.subscribe();
    relay.message('state', st);
    tab.click('join', {n: name});
    tab.$('#pwin').value = password;
    const pending = tab.click('pwgo');
    if (change === 'back') {
      tab.click('pwback');
      tab.click('join', {n: name});
    }
    if (change === 'post') {
      st.rev++;
      st.players[name].pw = 'replacement-account';
      relay.message('state', st);
    }
    if (change === 'room') {
      tab.click('room');
      tab.$('#roomin').value = 'another-fixture';
      await tab.click('joinroom');
    }
    await pending;
    assert.ok(!tab.storage.get('eot-ph') && !tab.storage.get('eot-me'), change);
    checkReadOnly(tab);
  }
});
