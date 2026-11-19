// Exercise the update against disposable live records. No real room, post password or remote service.
const test = require('node:test');
const assert = require('node:assert/strict');
const {pbkdf2Sync} = require('node:crypto');
const {
  factory,
  launch,
  inspect,
  saved,
  legacySaved,
  masterKey,
  masterWire,
  now,
  mockTime,
  finishOrder,
  publications,
  checkReadOnly,
  ceiling
} = require('../test-support/war-room.cjs');
const g = launch({
  script: inspect([
    'validSave',
    'upgradeV6',
    'seats',
    'postCan',
    'frontInterval',
    'recordFrontTraffic',
    'frontDue',
    'trainingPace'
  ]),
  timers: {setTimeout() {}, setInterval() {}}
}).game;
const copy = structuredClone;
const same = (a, b) => assert.deepEqual(copy(a), copy(b));
function connect(st, identity, options = {}) {
  const tab = launch({identity, relay: 'emqx', ...options}),
    [relay] = tab.sockets;
  relay.subscribe();
  relay.message('state', st);
  return {tab, relay};
}
const writes = tab => tab.sockets.flatMap(publications).filter(m => m.retain);
const leader = team => (team === 'reich' ? 'DEB' : 'Syamantak Kar');
const chief = team => (team === 'reich' ? 'Sattyaki' : 'Anish');
const ctx = (team, name = leader(team)) => ({team, name, now});
const officer = st => {
  st.players.Reader = {
    team: 'dawn',
    role: 'soldier',
    pw: 'fixture',
    cp: 1.25,
    title: 'Observer',
    cd: now + 60000
  };
  return {name: 'Reader', ph: 'fixture'};
};

test('Nigeria is the Dawn HQ on a fresh map and in victory checks; Bucharest remains a national capital', () => {
  const s = g.newGame(now);
  assert.equal(s.v, 7);
  assert.equal(s.ruleset, 'mastery-1');
  assert.ok(g.validSave(s));
  assert.deepEqual(
    Object.keys(g.TD)
      .filter(k => g.TD[k].fcap)
      .sort(),
    ['BER', 'NIG']
  );
  assert.ok(g.TD.BUC.cap);
  assert.equal(s.terr.NIG.o, 'dawn');
  assert.equal(s.terr.NIG.f, 1);
  assert.equal(s.terr.NIG.u.bd_fact, 1);
  assert.ok(!s.terr.BUC.u.bd_fact);
  s.terr.BUC.o = 'reich';
  g.checkWin(s, now);
  assert.ok(!s.win);
  s.terr.NIG.o = 'reich';
  g.checkWin(s, now);
  assert.equal(s.win.why, 'Nigeria has fallen.');
  assert.equal(s.win.team, 'reich');
  const other = g.newGame(now);
  other.terr.BER.o = 'dawn';
  g.checkWin(other, now);
  assert.equal(other.win.team, 'dawn');
});

test('new rooms start with exactly the two HQ garrisons; other provinces have local neutral defenders', () => {
  const s = g.newGame(now),
    oldOpening = g.newGame(now, false);
  assert.deepEqual(Object.keys(s.terr).sort(), Object.keys(g.TD).sort());
  assert.equal(Object.keys(s.terr).length, 147);
  for (const [id, t] of Object.entries(s.terr)) {
    if (id === 'BER' || id === 'NIG') {
      assert.equal(t.o, id === 'BER' ? 'reich' : 'dawn');
      same(t, oldOpening.terr[id]); // original HQ fort and troops, not all previous garrisons combined
    } else {
      assert.equal(t.o, 'neutral', id);
      assert.equal(t.f, 0);
      assert.equal(t.u.inf, g.TD[id].g);
      assert.ok(
        Object.keys(t.u).every(u => u === 'inf' || u === 'arm'),
        id
      );
    }
  }
  same(s.teams, oldOpening.teams);
  same(s.players, oldOpening.players);
  g.checkWin(s, now);
  assert.equal(s.win, null);
  assert.equal(s.dom, null);
  // Former faction holdings must be earned from the HQ, just like other neutral land.
  const order = {unit: 'inf', n: 1, quote: ceiling},
    c = ctx('reich', 'Sattyaki');
  assert.ok(g.A.recruit(s, c, {...order, tid: 'RUH'}).err);
  assert.ok(g.A.recruit(s, c, {...order, tid: 'BER'}).ok);
  assert.ok(
    factory.A.attack(s, c, {from: 'BER', to: 'RUH', grp: {...s.terr.BER.u}, tactic: 'frontal'}).battle
  );
  assert.equal(s.terr.RUH.o, 'reich');
  assert.ok(g.A.recruit(s, c, {...order, tid: 'RUH'}).ok);
  assert.ok(g.validSave(s));
});

test('the original room opening, not its current borders, determines expansion pace and an explicit reset', () => {
  const fresh = g.newGame(now),
    old = saved(32);
  const expectedFresh = copy(fresh.terr),
    expectedOld = copy(old.terr);
  assert.equal(old.capitalStart, undefined);
  for (const s of [fresh, old]) {
    assert.equal(g.trainingPace(s), 1);
    for (const id of ['RUH', 'POW', 'BAV', 'PRU', 'BOH', 'NAR', 'OSL']) s.terr[id].o = 'dawn';
    assert.equal(g.trainingPace(s), 1);
    s.terr.AUS.o = 'dawn';
    assert.equal(g.trainingPace(s), s === fresh ? 2 : 1);
    // Reset is explicit and starts this room's scenario over; it is not a save migration.
    const p = {created: s.created, rev: s.rev, origin: s.origin};
    assert.ok(g.A.reset(s, ctx('dawn'), p).reset);
    same(s.terr, s === fresh ? expectedFresh : expectedOld);
    assert.ok(g.validSave(s));
  }
});

test('v6 preview and failed orders are read-only; a confirmed first order settles the old economy once and saves the handover with it', async t => {
  mockTime(t);
  const original = legacySaved(93),
    who = officer(original);
  original.teams.dawn.mastery = {bd_rave: {def: 2}};
  original.terr.NIG = {o: 'reich', u: {inf: 17, arm: 4}, f: 3, st: 'elastic'};
  original.front = {at: now - 100000, turn: 4, drill: {JPN: 3}};
  original.unrelated = {note: 'keep'};
  const old = copy(original),
    earned = copy(old);
  factory.tick(earned, now);
  const {tab, relay} = connect(original, who);
  assert.equal(tab.game.S.terr.NIG.o, 'dawn');
  assert.equal(tab.game.S.rev, 93);
  assert.ok(!tab.game.S.win);
  same(tab.game.S.teams, earned.teams);
  same(tab.game.S.terr.BUC, old.terr.BUC);
  assert.equal(tab.game.S.players.Reader.cp, 4.25, 'settled the minute already owed at the v6 rate');
  same(JSON.parse(tab.storage.get(masterKey)), old);
  checkReadOnly(tab);
  await finishOrder(t, tab.game.act('recruit', {tid: 'NIG', unit: 'bd_init', n: 1, quote: ceiling}));
  checkReadOnly(tab);
  await finishOrder(t, tab.game.act('contribute', {kind: 'prospect'})); // cooldown rejects; no v7 conversion was published
  checkReadOnly(tab);
  const updated = tab.click('applyupdate');
  await finishOrder(t, updated);
  const st = copy(tab.game.S);
  assert.equal(st.rev, 94);
  assert.equal(st.v, 7);
  assert.ok(!st.win);
  assert.ok(g.validSave(st));
  assert.equal(writes(tab).length, 1);
  assert.equal(writes(tab)[0].topic, 'lands-eot/v1/' + masterWire + '/state');
  same(st.terr.NIG, {o: 'dawn', u: {}, f: 3, st: 'elastic'});
  assert.equal(st.terr.BER.u.inf, old.terr.BER.u.inf + 17);
  assert.equal(st.terr.BER.u.arm, old.terr.BER.u.arm + 4);
  for (const id of Object.keys(st.terr)) if (!['NIG', 'BER'].includes(id)) same(st.terr[id], old.terr[id]);
  const view = g.upgradeV6(old, now);
  factory.tick(view, st.t);
  same(st.teams, view.teams);
  same(st.players, view.players);
  same(st.front, old.front);
  same(st.unrelated, old.unrelated);
  assert.equal(st.created, old.created);
  assert.equal(st.log[1].msg, old.log[0].msg);
  const pre = 'eot-v6-backup:' + masterKey.slice('eot-live-state:'.length);
  same(JSON.parse(tab.storage.get(pre)), old);
  same(original, old);
  // A later real capture/roster removal is never treated as another rollout.
  const later = copy(st);
  later.rev++;
  later.terr.NIG.o = 'reich';
  delete later.players.Dhruv;
  relay.message('state', later);
  await tab.click('applyupdate');
  assert.equal(tab.game.S.terr.NIG.o, 'reich');
  assert.equal(tab.game.S.players.Dhruv, undefined);
  assert.equal(writes(tab).length, 1);
  same(JSON.parse(tab.storage.get(pre)), old);
  const downgrade = copy(old);
  downgrade.rev = 150;
  relay.message('state', downgrade);
  assert.match(tab.$('#banner').innerHTML, /older save format/);
  await tab.game.act('applyupdate');
  assert.equal(writes(tab).length, 1);
  same(JSON.parse(tab.storage.get(masterKey)), later);
});

test('two devices cannot upgrade over a newer garrison or reintroduce an already-removed Dhruv', async t => {
  mockTime(t);
  const raw = legacySaved(70);
  raw.t = now;
  const who = officer(raw),
    {tab, relay} = connect(raw, who);
  const order = tab.click('applyupdate');
  const newer = copy(raw);
  newer.rev++;
  newer.terr.NIG = {o: 'reich', u: {inf: 92}, f: 2, st: 'counter'};
  newer.teams.dawn.res.oil = 4;
  relay.message('state', newer);
  await finishOrder(t, order);
  assert.equal(tab.game.S.rev, 72);
  assert.equal(tab.game.S.terr.BER.u.inf, newer.terr.BER.u.inf + 92);
  assert.ok(tab.game.S.teams.dawn.res.oil < 5);
  const next = connect(raw, who),
    busy = next.tab.click('applyupdate');
  const winner = copy(tab.game.S);
  delete winner.players.Dhruv;
  next.relay.message('state', winner);
  await finishOrder(t, busy);
  checkReadOnly(next.tab);
  same(next.tab.game.S, winner);
});

test('an already-Dawn garrison, a displaced independent army and an ended campaign lose no units or outcome during conversion', () => {
  const old = legacySaved(54);
  old.t = now;
  old.terr.NIG.u = {bd_rave: 37};
  same(g.upgradeV6(old, now).terr, old.terr);
  old.terr.NIG = {o: 'neutral', country: 'JPN', u: {nav: 4}, f: 1, st: 'bunker'};
  const next = g.upgradeV6(old, now);
  const ips = ['TOK', 'OSA'];
  assert.equal(
    ips.reduce((n, id) => n + (next.terr[id].u.nav || 0) - (old.terr[id].u.nav || 0), 0),
    4
  );
  for (const id of ips) old.terr[id].o = 'reich';
  old.win = {team: 'dawn', t: now - 60000, why: 'Berlin has fallen.'};
  const ended = g.upgradeV6(old, now + 500000);
  same(ended.win, old.win);
  same(ended.teams, old.teams);
  assert.equal(ended.t, now);
  assert.equal(ended.terr.NIG.o, 'dawn');
  same(ended.hqReserve, {owner: 'neutral', country: 'JPN', units: {nav: 4}});
});

test('over-cap v6 appointments are normalized deterministically without removing accounts, titles, balances or passwords', () => {
  const s = legacySaved(12);
  s.t = now;
  s.players.Extra = {team: 'reich', role: 'chief', pw: 'original', cp: 4.75, title: 'Censor', cd: 44};
  s.players.Another = {...s.players.Extra, role: 'leader'};
  const reversed = copy(s);
  reversed.players = Object.fromEntries(Object.entries(reversed.players).reverse());
  const next = g.upgradeV6(s, now);
  same(next.players, g.upgradeV6(reversed, now).players);
  assert.ok(g.validSave(s) && g.validSave(next));
  same(g.seats(next.players, 'reich'), {chiefs: 4, attackers: 4, leaders: 1});
  for (const k of ['Extra', 'Another']) same(next.players[k], {...s.players[k], role: 'soldier'});
  assert.equal(next.players.DEB.role, 'leader');
  assert.equal(next.players.Dhruv.role, 'soldier');
});

test('Dhruv uses a distinct Reich post when his name is already taken, without changing either existing login', async t => {
  mockTime(t);
  const raw = legacySaved(32),
    pw = 'Synthetic existing login',
    ph = pbkdf2Sync(pw.toUpperCase().replaceAll(' ', ''), 'eot-v1:Dhruv', 100000, 32, 'sha256').toString(
      'hex'
    );
  raw.t = now;
  raw.players.Dhruv = {team: 'dawn', role: 'soldier', pw: ph, title: 'Original', cp: 7, cd: 888};
  raw.players['Dhruv (Reich)'] = {...raw.players.Dhruv, team: 'reich', pw: 'separate'};
  const {tab} = connect(raw);
  const st = tab.game.S;
  same(st.players.Dhruv, raw.players.Dhruv);
  same(st.players['Dhruv (Reich)'], raw.players['Dhruv (Reich)']);
  same(st.players['Dhruv (Reich 2)'], g.newGame(now).players.Dhruv);
  assert.match(tab.$('#modal').innerHTML, /data-n="Dhruv \(Reich 2\)"/);
  tab.click('join', {n: 'Dhruv'});
  tab.$('#pwin').value = pw;
  await tab.click('pwgo');
  assert.equal(tab.storage.get('eot-ph'), ph);
  assert.match(tab.$('#hud').innerHTML, /Black Dawn/);
  checkReadOnly(tab);
});

for (const team of ['dawn', 'reich'])
  test(`${team}: chiefs use attack seats, promotions/revocations are atomic and attack rights do not grant recruitment`, () => {
    const st = saved(11),
      lead = ctx(team);
    const officers = Object.entries(st.players)
      .filter(([, p]) => p.team === team && p.role === 'soldier')
      .map(([k]) => k);
    const appoint = (name, change) => g.A.setrole(st, lead, {name, ...change});
    for (const name of officers) {
      if (g.seats(st.players, team).chiefs === 4) break;
      assert.ok(appoint(name, {role: 'chief'}).ok);
    }
    const [one, two, extra] = Object.entries(st.players)
      .filter(([, p]) => p.team === team && !['chief', 'leader'].includes(p.role))
      .map(([k]) => k);
    assert.ok(appoint(one, {attackSeat: true}).ok);
    assert.ok(appoint(two, {attackSeat: true}).ok);
    const full = copy(st);
    same(g.seats(st.players, team), {chiefs: 4, attackers: 6, leaders: 1});
    assert.match(appoint(extra, {attackSeat: true, title: 'should not apply'}).err, /six/);
    assert.match(appoint(extra, {role: 'chief'}).err, /Four/);
    assert.ok(g.A.setrole(st, ctx(team, chief(team)), {name: one, attackSeat: false}).err);
    assert.ok(appoint(leader(team === 'reich' ? 'dawn' : 'reich'), {title: 'wrong faction'}).err);
    same(full, st);
    const tid = team === 'reich' ? 'BER' : 'NIG',
      unit = team === 'reich' ? 'inf' : 'bd_init';
    for (const name of [one, two, extra, lead.name])
      assert.match(g.A.recruit(st, ctx(team, name), {tid, unit, n: 1, quote: ceiling}).err, /staff chief/);
    const ch = chief(team);
    st.terr.SUV.o = team;
    assert.ok(g.A.recruit(st, ctx(team, ch), {tid: 'SUV', unit, n: 1, quote: ceiling}).ok);
    assert.ok(
      g.A.recruit(st, ctx(team, ch), {tid: team === 'dawn' ? 'BER' : 'NIG', unit, n: 1, quote: ceiling}).err
    );
    assert.ok(appoint(ch, {role: 'soldier'}).ok);
    assert.ok(!g.postCan(st.players[ch], 'attack'));
    assert.ok(appoint(one, {role: 'chief'}).ok);
    assert.ok(!('attackSeat' in st.players[one]));
    assert.ok(appoint(extra, {attackSeat: true}).ok);
    assert.ok(appoint(two, {attackSeat: false}).ok);
    assert.ok(!g.postCan(st.players[two], 'attack'));
    assert.ok(g.validSave(st));
    const bad = copy(full);
    bad.players[extra].attackSeat = true;
    assert.ok(!g.validSave(bad));
  });

test('a concurrent appointment gets the last slot, not a stale Council order; revoking an attack seat cancels a pending border attack', async t => {
  mockTime(t);
  const st = saved(45);
  st.t = now;
  st.players.Ritam.attackSeat = true;
  // An isolated credential for this test, not a real player's verifier.
  st.players.Commander = {...st.players.DEB, pw: 'fixture'};
  st.players.DEB.role = 'soldier';
  const {tab, relay} = connect(st, {name: 'Commander', ph: 'fixture'});
  tab.click('tab', {k: 'council'});
  assert.match(tab.$('#panel').innerHTML, /Attack seats: <b>5\/6/);
  const attempt = tab.click('attackseat', {n: 'Dhruv', grant: '1'}),
    newer = copy(st);
  newer.rev++;
  newer.players.Sounak.attackSeat = true;
  relay.message('state', newer);
  await finishOrder(t, attempt);
  checkReadOnly(tab);
  assert.match(tab.$('#panel').innerHTML, /Assign attack seat: Dhruv" disabled/);
  assert.equal(tab.game.S.players.Dhruv.attackSeat, undefined);
  assert.match(tab.$('#toasts').children.at(-1).textContent, /six/);
  const fighter = connect(newer, {name: 'Dhruv', ph: newer.players.Dhruv.pw});
  const granted = copy(newer);
  delete granted.players.Sounak.attackSeat;
  granted.players.Dhruv.attackSeat = true;
  granted.rev++;
  fighter.relay.message('state', granted);
  fighter.tab.click('sel', {id: 'BER'});
  assert.match(fighter.tab.$('#panel').innerHTML, /Attack from here/);
  assert.doesNotMatch(fighter.tab.$('#panel').innerHTML, /Recruit here|Move units/);
  fighter.tab.click('open', {m: 'attack'});
  assert.deepEqual(pickerIds(fighter.tab), ['DEN']); // Berlin has just one foreign neighbor.
  fighter.tab.change('attackplace', 'TOK');
  assert.deepEqual(pickerIds(fighter.tab), ['DEN']);
  fighter.tab.change('attackplace', 'DEN');
  fighter.tab.click('step', {u: 'inf', d: '1'});
  assert.match(fighter.tab.$('#modal').innerHTML, /data-act="confirm" data-price/);
  const battle = fighter.tab.click('confirm');
  const revoked = copy(granted);
  revoked.rev++;
  delete revoked.players.Dhruv.attackSeat;
  fighter.relay.message('state', revoked);
  await finishOrder(t, battle);
  checkReadOnly(fighter.tab);
  assert.equal(fighter.tab.$('#modal').innerHTML, '');
  same(fighter.tab.game.S, revoked);
  assert.match(fighter.tab.$('#toasts').children.at(-1).textContent, /permissions changed/);
});

function pickerIds(tab) {
  return [...tab.$('#modal').innerHTML.matchAll(/<option value="([^"]+)">/g)].map(m => m[1]).sort();
}

test('leaders, chiefs and appointed attackers cannot skip a map line, even with Air 4; rejected orders publish nothing', async t => {
  mockTime(t);
  const st = saved(36);
  st.t = now;
  st.players.Dhruv.attackSeat = true;
  st.teams.reich.tech.air = 4;
  st.terr.BER.u = {air: 4};
  const order = {from: 'BER', to: 'TOK', grp: {air: 4}, tactic: 'frontal'},
    before = copy(st);
  for (const name of ['DEB', 'Sattyaki', 'Dhruv']) {
    // Stockholm is two hops away via friendly Prussia; Tokyo is an ocean away.
    for (const to of ['SWE', 'TOK']) {
      assert.match(g.A.attack(st, ctx('reich', name), {...order, to}).err, /not connected/);
      same(st, before);
    }
  }
  const {tab} = connect(st, {name: 'Dhruv', ph: st.players.Dhruv.pw});
  tab.click('sel', {id: 'TOK'});
  assert.match(tab.$('#panel').innerHTML, /data-to="TOK" disabled>Attack/);
  assert.match(tab.$('#panel').innerHTML, /No friendly troops border/);
  tab.click('sel', {id: 'POW'}); // A nonempty garrison surrounded by friendly provinces.
  assert.match(tab.$('#panel').innerHTML, /data-m="attack" disabled>Attack from here/);
  await finishOrder(t, tab.game.act('attack', order)); // submit directly, without the picker
  assert.match(tab.$('#toasts').children.at(-1).textContent, /not connected/);
  checkReadOnly(tab);
  same(tab.game.S, before);
});

test('a land attack launches from the chosen bordering garrison; permissions, ceasefires, costs and unit checks still apply', async t => {
  mockTime(t);
  const st = saved(37);
  st.t = now;
  st.players.Dhruv.attackSeat = true;
  st.terr.BER.u = {inf: 42, arm: 4};
  st.terr.DEN.u = {};
  st.terr.RUH.u = {}; // Linked to Copenhagen, but not a launching garrison.
  const who = {name: 'Dhruv', ph: st.players.Dhruv.pw},
    order = {from: 'BER', to: 'DEN', grp: {inf: 40, arm: 4}, tactic: 'frontal'};
  for (const [mutation, fields, reason] of [
    [s => (s.terr.BER.o = 'dawn'), {}, /one of your territories/],
    [s => (s.terr.DEN.o = 'reich'), {}, /already yours/],
    [s => (s.teams.reich.res.oil = 0), {}, /oil/],
    [s => (s.players.Dhruv.cp = 1), {}, /command points/],
    [
      s => {
        s.terr.DEN.o = 'dawn';
        s.pact = {until: now + 50000};
      },
      {},
      /ceasefire/
    ],
    [s => delete s.players.Dhruv.attackSeat, {}, /attack seat/],
    [() => {}, {grp: {inf: 43}}, /Pick units/],
    [() => {}, {tactic: 'blitz'}, /not researched/]
  ]) {
    const s = copy(st);
    mutation(s);
    const before = copy(s);
    assert.match(g.A.attack(s, ctx('reich', 'Dhruv'), {...order, ...fields}).err, reason);
    same(s, before);
  }
  const moved = copy(st);
  moved.terr.TOK.o = 'reich';
  assert.match(g.A.move(moved, ctx('reich', 'Sattyaki'), {...order, to: 'TOK'}).err, /not connected/);
  const {tab} = connect(st, who);
  tab.click('sel', {id: 'RUH'});
  assert.match(tab.$('#panel').innerHTML, /data-m="attack" disabled>Attack from here/);
  tab.click('sel', {id: 'DEN'});
  tab.click('open', {m: 'attack', to: 'DEN'});
  assert.deepEqual(pickerIds(tab), ['BER', 'OSL']);
  assert.match(tab.$('#modal').innerHTML, /<option value="OSL">[^<]* · sea<\/option>/);
  tab.change('attackplace', 'PRU'); // friendly and occupied, but not linked to Copenhagen
  assert.deepEqual(pickerIds(tab), ['BER', 'OSL']);
  tab.change('attackplace', 'BER');
  tab.click('step', {u: 'arm', d: 'max'});
  await finishOrder(t, tab.click('confirm'));
  assert.equal(tab.game.S.terr.DEN.o, 'reich');
  assert.ok(!tab.game.S.terr.BER.u.arm);
  assert.equal(tab.game.S.log[0].tid, 'DEN');
  const before = copy(st);
  factory.tick(before, tab.game.S.t);
  assert.equal(tab.game.S.players.Dhruv.cp, before.players.Dhruv.cp - 2);
  assert.equal(tab.game.S.teams.reich.res.oil, before.teams.reich.res.oil - 2);
  same(tab.game.S.players.Sattyaki, before.players.Sattyaki);
  assert.equal(writes(tab).length, 1);
});

test('sea links are marked in both directions; only the selected force can cross, including with an auto-picked source', async t => {
  mockTime(t);
  const st = saved(38);
  st.t = now;
  st.players.Dhruv.attackSeat = true;
  st.terr.PRU.u = {inf: 10, nav: 1};
  st.teams.reich.tech.nav = 2;
  st.terr.SWE.o = 'dawn';
  // Only Prussia has troops bordering Stockholm, despite other Reich garrisons farther away.
  for (const id of ['SWE', 'OSL', 'NAR']) st.terr[id].u = {};
  const {tab} = connect(st, {name: 'Dhruv', ph: st.players.Dhruv.pw});
  tab.click('sel', {id: 'PRU'});
  tab.click('open', {m: 'attack'});
  assert.deepEqual(pickerIds(tab), ['BAL', 'SWE']);
  assert.match(tab.$('#modal').innerHTML, /<option value="SWE">[^<]* · sea<\/option>/);
  tab.click('closem');
  tab.click('sel', {id: 'SWE'});
  tab.click('open', {m: 'attack', to: 'SWE'});
  const modal = () => tab.$('#modal').innerHTML;
  assert.doesNotMatch(modal(), /attackplace/);
  assert.match(modal(), /across water/);
  tab.click('step', {u: 'inf', d: 'max'});
  assert.match(modal(), /Crossing water/);
  assert.match(modal(), /data-act="confirm" disabled/);
  await finishOrder(t, tab.game.act('attack', {from: 'PRU', to: 'SWE', grp: {inf: 10}, tactic: 'frontal'}));
  assert.match(tab.$('#toasts').children.at(-1).textContent, /Crossing water/);
  checkReadOnly(tab);
  same(tab.game.S, st);
  tab.click('step', {u: 'nav', d: '1'});
  assert.match(modal(), /data-act="confirm" data-price/);
  await finishOrder(t, tab.click('confirm'));
  assert.equal(tab.game.S.terr.SWE.o, 'reich');
  same(tab.game.S.terr.PRU.u, {});
  assert.equal(writes(tab).length, 1);
});

test('a linked sea attack keeps the existing aircraft, doctrine and specialist crossing rules', () => {
  for (const [group, air, nav, allowed] of [
    [{bd_init: 5, bd_sail: 1}, 0, 1, false],
    [{bd_rave: 4}, 0, 0, true],
    [{bd_init: 5, bd_rave: 1}, 3, 0, false],
    [{bd_init: 5, bd_rave: 1}, 4, 0, true],
    [{bd_init: 5, bd_vair: 1}, 1, 0, true]
  ]) {
    const st = saved(39);
    st.terr.PRU.o = 'dawn';
    st.terr.PRU.u = {...group};
    st.terr.SWE.u = {};
    Object.assign(st.teams.dawn.tech, {air, nav});
    const before = copy(st);
    const result = g.A.attack(st, ctx('dawn'), {from: 'PRU', to: 'SWE', grp: group, tactic: 'frontal'});
    if (allowed) assert.equal(result.battle, true, result.err);
    else {
      assert.match(result.err, /Crossing water/);
      same(st, before);
    }
  }
});

test('World front backoff is bounded and shared: four orders in 15 s or a 1.2 s lock doubles the interval, then quiet restores it', () => {
  const s = saved(55);
  s.front = {at: now, turn: 1, drill: {}};
  for (let i = 1; i <= 4; i++) {
    g.recordFrontTraffic(s, now + i * 2000, false);
    assert.equal(g.frontInterval(s, now + i * 2000), i === 4 ? 180000 : 90000);
  }
  const other = copy(s);
  assert.ok(g.validSave(other));
  assert.equal(g.frontDue(other, now + 90000), false);
  assert.equal(g.frontDue(other, now + 179999), false);
  assert.equal(g.frontDue(other, now + 180000), true);
  const quiet = now + 188000;
  g.recordFrontTraffic(other, quiet, false);
  assert.equal(g.frontInterval(other, quiet), 90000);
  g.recordFrontTraffic(other, quiet + 1, true);
  assert.equal(g.frontInterval(other, quiet + 2), 180000);
  assert.equal(g.frontInterval(other, quiet + 180001), 90000);
  const split = saved(20);
  for (const dt of [0, 4000, 8000, 15000]) g.recordFrontTraffic(split, now + dt, false);
  assert.equal(g.frontInterval(split, now + 15000), 90000, 'a new count window is not a burst');
  other.frontTraffic.until += 9000000;
  assert.ok(!g.validSave(other));
});

test('an archive-only backup is a floor, not a board or a new invitation to upgrade the same old revision', async t => {
  mockTime(t);
  const raw = legacySaved(67);
  const who = officer(raw);
  const storage = new Map([
    ['eot-v6-backup:' + masterKey.slice('eot-live-state:'.length), JSON.stringify(raw)]
  ]);
  const tab = launch({storage, identity: who, relay: 'emqx'}),
    [r] = tab.sockets;
  r.subscribe();
  r.message('sync', publications(r).find(p => p.data.type === 'req').data);
  t.mock.timers.tick(650);
  assert.equal(tab.game.S, null);
  await tab.game.act('enlist', {name: 'should not seed'});
  const later = copy(raw);
  later.rev = 70;
  r.message('state', later);
  assert.equal(tab.game.S, null);
  assert.match(tab.$('#panel').innerHTML, /older save format/);
  checkReadOnly(tab);
  const canonical = g.upgradeV6(raw, now);
  canonical.rev = 71;
  r.message('state', canonical);
  assert.equal(tab.game.S.rev, 71);
  checkReadOnly(tab);
});

test('a stale appointment cannot grant command to a different account that enlisted under the same name', async t => {
  mockTime(t);
  const st = saved(104);
  st.players.Commander = {...st.players.DEB, pw: 'fixture'};
  st.players.DEB.role = 'soldier';
  const {tab, relay} = connect(st, {name: 'Commander', ph: 'fixture'});
  const appointment = tab.game.act('setrole', {name: 'Dhruv', attackSeat: true});
  const replacement = copy(st);
  replacement.rev++;
  replacement.players.Dhruv.pw = 'replacement-account';
  relay.message('state', replacement);
  await finishOrder(t, appointment);
  checkReadOnly(tab);
  same(tab.game.S, replacement);
  assert.match(tab.$('#toasts').children.at(-1).textContent, /appointment changed/);
});

test('enlistment cannot follow an in-flight password check into a different room', async t => {
  mockTime(t);
  const original = saved(60);
  const {tab} = connect(original, {name: '__spectator'});
  tab.$('#enl').value = 'New officer';
  tab.$('#enlt').value = 'reich';
  tab.$('#enlpw').value = 'fixture-only';
  const enlist = tab.click('enlist');
  tab.click('newroom');
  const r = tab.sockets.at(-1);
  r.subscribe();
  r.message('state', saved(4));
  await enlist;
  assert.equal(tab.game.S.rev, 4);
  checkReadOnly(tab);
});
