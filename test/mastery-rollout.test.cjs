// Live protocol tests with simulated peers/storage. No production transport or account.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  room,
  key,
  prefix,
  RULES,
  masterWire,
  masterKey,
  now,
  mockTime,
  flush,
  finishOrder: afterLock,
  publication,
  publications,
  launch,
  saved,
  masterySaved,
  factory,
  checkReadOnly,
  purchaseRoom
} = require('../test-support/war-room.cjs');
const MP = 'lands-eot/v1/' + masterWire + '/';
const identity = {name: 'Fixture officer', ph: 'room-fixture'};
const officer = st => {
  st.players[identity.name] = {team: 'dawn', role: 'chief', pw: identity.ph, cd: 0};
  return st;
};
const retained = tab => tab.sockets.flatMap(publications).filter(p => p.retain);
function targetRelay(tab, i = 0) {
  const sockets = tab.sockets.slice(-3),
    live = sockets[i];
  live.subscribe();
  sockets.filter(s => s !== live).forEach(s => s.onerror());
  const echo = publications(live).find(p => p.topic === MP + 'sync' && p.data.type === 'req');
  assert.ok(echo);
  live.receive(publication(echo.topic, echo.data));
  return live;
}

test('explicit Classic → Mastery: copy the confirmed snapshot once; invites, locks, writes and caches stay isolated', async t => {
  mockTime(t);
  const st = saved(83);
  st.props.push({id: 3, open: true, from: 'reich', type: 'ceasefire', mins: 60});
  const {tab, controls} = purchaseRoom(st, 'dawn');
  tab.click('showmastery', {u: 'bd_init'});
  assert.ok(
    controls()
      .filter(b => b.dataset.act === 'mastery')
      .every(b => b.disabled)
  );
  await afterLock(
    t,
    tab.game.act('mastery', {unit: 'bd_init', skill: 'atk', rank: 1, quote: {gold: 5, steel: 8}})
  );
  checkReadOnly(tab);
  await tab.click('preparemastery');
  assert.equal(tab.sockets.length, 6);
  assert.equal(tab.location.searchParams.get('rules'), RULES);
  const relay = targetRelay(tab);
  t.mock.timers.tick(650);
  assert.match(tab.$('#panel').innerHTML, /Start from revision 83/);
  assert.equal(tab.game.S, null);
  checkReadOnly(tab);
  const a = tab.click('startmastery'),
    b = tab.click('startmastery');
  await afterLock(t, Promise.all([a, b]));
  const writes = retained(tab);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].topic, MP + 'state');
  assert.deepEqual(writes[0].data, {
    ...structuredClone(st),
    ruleset: RULES,
    rev: 84,
    origin: writes[0].data.origin
  });
  assert.equal(JSON.parse(tab.storage.get(key)).rev, 83);
  assert.equal(JSON.parse(tab.storage.get(masterKey)).rev, 84);
  assert.notEqual(tab.channels[0].name, tab.channels[1].name);
  // Even if a Classic packet reaches the socket it cannot affect the mastery room.
  relay.receive(publication(prefix + 'state', saved(900)));
  assert.equal(tab.game.S.rev, 84);
  const quote = controls().find(e => e.dataset.act === 'mastery' && e.dataset.skill === 'atk').dataset;
  await afterLock(t, tab.click('mastery', quote));
  assert.equal(tab.game.S.teams.dawn.mastery.bd_init.atk, 1);
  assert.ok(retained(tab).every(p => p.topic === MP + 'state'));
  tab.click('room');
  assert.match(tab.$('#modal').innerHTML, /rules=mastery-1/);
  await tab.click('classicroom');
  assert.equal(tab.location.searchParams.has('rules'), false);
  assert.equal(tab.game.S.rev, 83);
  assert.equal(tab.game.S.teams.dawn.mastery, undefined);
});

test('existing target always wins, even a lower revision than the source or a race during initialization', async t => {
  mockTime(t);
  for (const timing of ['before', 'during']) {
    const {tab} = purchaseRoom(saved(150), 'dawn');
    await tab.click('preparemastery');
    const relay = targetRelay(tab);
    t.mock.timers.tick(650);
    const target = masterySaved(14);
    target.teams.reich.mastery = {inf: {def: 3}};
    const start = timing === 'during' ? tab.click('startmastery') : null;
    relay.receive(publication(MP + 'state', target));
    await afterLock(t, start || tab.click('startmastery'));
    assert.deepEqual(structuredClone(tab.game.S), structuredClone(target));
    checkReadOnly(tab);
  }
});

test('cold invites, unsupported rules, unfinished discovery, fallback-only and unreadable target records cannot seed a room', async t => {
  mockTime(t);
  const future = launch({identity, rules: 'mastery-99'});
  assert.equal(future.sockets.length, 0);
  assert.match(future.$('#panel').innerHTML, /not supported/);
  const direct = launch({identity, rules: RULES});
  targetRelay(direct);
  t.mock.timers.tick(650);
  assert.match(direct.$('#panel').innerHTML, /No saved mastery/);
  await direct.click('startmastery');
  checkReadOnly(direct);
  for (const scenario of ['no echo', 'fallback', 'bad record']) {
    const {tab} = purchaseRoom(saved(83), 'dawn');
    await tab.click('preparemastery');
    const sockets = tab.sockets.slice(-3);
    if (scenario === 'no echo') {
      sockets[0].subscribe();
      sockets[1].onerror();
      sockets[2].onerror();
    } else {
      const r = targetRelay(tab, scenario === 'fallback' ? 1 : 0);
      if (scenario === 'bad record') r.receive(publication(MP + 'state', {invalid: true}));
    }
    t.mock.timers.tick(650);
    await afterLock(t, tab.click('startmastery'));
    checkReadOnly(tab);
    assert.equal(tab.game.S, null);
  }
});

test('stale source, demotion, offline orders and cancelled room switches never publish cached progress', async t => {
  mockTime(t);
  const newer = officer(saved(60)),
    tab = launch({identity, cached: newer});
  const [r, x, y] = tab.sockets;
  r.subscribe();
  x.onerror();
  y.onerror();
  r.message('state', officer(saved(4)));
  await tab.click('preparemastery');
  assert.equal(tab.location.searchParams.has('rules'), false);
  assert.equal(tab.game.S.rev, 60);
  checkReadOnly(tab);
  const demoted = officer(saved(61));
  demoted.players[identity.name].role = 'soldier';
  r.message('state', demoted);
  await tab.click('preparemastery');
  assert.equal(tab.sockets.length, 3);
  checkReadOnly(tab);
  const m = launch({rules: RULES, cached: officer(masterySaved(70)), identity});
  m.sockets.forEach(s => s.onerror());
  await m.game.act('mastery', {unit: 'bd_init', skill: 'atk', rank: 1, quote: {gold: 10, steel: 10}});
  assert.equal(m.game.S.teams.dawn.mastery, undefined);
  checkReadOnly(m);
  const {tab: cancel} = purchaseRoom(saved(83), 'dawn');
  await cancel.click('preparemastery');
  targetRelay(cancel);
  t.mock.timers.tick(650);
  const init = cancel.click('startmastery');
  cancel.$('#roomin').value = 'different';
  cancel.click('joinroom');
  await afterLock(t, init);
  checkReadOnly(cancel);
});

// A minimal RTDB emulator: null/empty children are pruned and compare-and-set uses an ETag.
function prune(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.length ? Array.from(v, prune) : null;
  const out = Object.fromEntries(
    Object.entries(v)
      .map(([k, x]) => [k, prune(x)])
      .filter(([, x]) => x != null)
  );
  return Object.keys(out).length ? out : null;
}
function firebase(st, conflict) {
  const classic = '/eot-rooms/' + room + '/state.json',
    target = '/eot-rooms/' + encodeURIComponent(masterWire) + '/state.json';
  const records = new Map([[classic, prune(st)]]),
    calls = [];
  let contended = conflict;
  const fetch = async (url, o = {}) => {
    const k = new URL(url).pathname,
      record = records.get(k) || null,
      tag = record ? '"' + record.rev + '"' : '"null_etag"';
    calls.push({k, ...o});
    if (o.method === 'PUT') {
      if (k === target && contended) {
        contended = false;
        records.set(k, prune(officer(masterySaved(100))));
        return {ok: false, status: 412};
      }
      if (o.headers?.['if-match'] && o.headers['if-match'] !== tag) return {ok: false, status: 412};
      records.set(k, prune(JSON.parse(o.body)));
    }
    return {ok: true, json: async () => structuredClone(record), headers: {get: () => tag}};
  };
  return {fetch, classic, target, records, calls};
}
for (const conflict of [false, true])
  test(`Firebase handoff: ${conflict ? 'a 412 keeps the other game' : 'conditional creation preserves pruned v6 data'}; no writes to Classic`, async t => {
    mockTime(t);
    const st = officer(saved(54));
    st.terr.LOR.u = {};
    const f = firebase(st, conflict);
    const tab = launch({identity, fb: true, fetch: f.fetch});
    await flush();
    assert.deepEqual(structuredClone(tab.game.S.terr.LOR.u), {});
    assert.deepEqual(structuredClone(tab.game.S.props), []);
    const before = structuredClone(f.records.get(f.classic));
    await tab.click('preparemastery');
    await flush();
    assert.match(tab.$('#panel').innerHTML, /revision 54/);
    await tab.click('startmastery');
    const creates = f.calls.filter(c => c.k === f.target && c.method === 'PUT');
    assert.equal(creates.length, 1);
    assert.equal(creates[0].headers['if-match'], '"null_etag"');
    t.mock.timers.tick(2500);
    await flush();
    assert.equal(tab.game.S.rev, conflict ? 100 : 55);
    assert.deepEqual(
      structuredClone(tab.game.S.terr.LOR.u),
      conflict ? structuredClone(masterySaved(100).terr.LOR.u) : {}
    );
    assert.deepEqual(f.records.get(f.classic), before);
    assert.ok(!f.calls.some(c => c.k === f.classic && c.method === 'PUT'));
    assert.equal(tab.game.S.v, 6);
    assert.equal(tab.game.S.ruleset, RULES);
  });

test('shared DB uses separate state AND lock documents; a late higher read or an invalid target is never overwritten', async t => {
  mockTime(t);
  const classic = officer(saved(90)),
    target = officer(masterySaved(20));
  const base = 'game-' + masterWire + '/',
    dbRecords = new Map([['game/state', classic]]),
    calls = [];
  let duringGet = null;
  const snap = k => ({exists: dbRecords.has(k), data: () => structuredClone(dbRecords.get(k))});
  const tab = launch({
    identity,
    claude: {
      use: async () => ({
        doc: k => ({
          acquire: async () => {
            calls.push(['lock', k]);
            return {acquired: true};
          },
          get: async () => {
            if (k === base + 'state' && duringGet) {
              dbRecords.set(k, duringGet);
              duringGet = null;
            }
            return snap(k);
          },
          set: async v => {
            calls.push(['set', k]);
            dbRecords.set(k, structuredClone(v));
          },
          onSnapshot: cb => cb(snap(k))
        })
      })
    }
  });
  await flush();
  await tab.click('preparemastery');
  duringGet = target;
  await tab.click('startmastery');
  assert.equal(tab.game.S.rev, 20);
  assert.deepEqual(calls, [['lock', base + 'lock']]);
  const later = officer(masterySaved(24));
  later.teams.dawn.mastery = {bd_init: {atk: 2}};
  dbRecords.set(base + 'state', later);
  await tab.game.act('mastery', {unit: 'bd_init', skill: 'atk', rank: 1, quote: {gold: 9, steel: 9}});
  assert.equal(tab.game.S.rev, 24);
  assert.equal(calls.filter(c => c[0] === 'set').length, 0);
  dbRecords.set(base + 'state', {v: 7, terr: {}, teams: {}});
  await tab.game.act('noop');
  assert.equal(calls.filter(c => c[0] === 'set').length, 0);
});

test('an untagged v6 preview with existing ranks can carry them forward but cannot fight or spend under mixed rules', async t => {
  mockTime(t);
  const st = saved(50);
  st.teams.dawn.mastery = {bd_init: {def: 5}};
  const {tab} = purchaseRoom(st, 'dawn');
  assert.match(tab.$('#banner').innerHTML, /Orders are paused/);
  await afterLock(t, tab.game.act('contribute', {kind: 'drill'}));
  assert.equal(tab.game.S.rev, 50);
  checkReadOnly(tab);
  await tab.click('preparemastery');
  targetRelay(tab);
  t.mock.timers.tick(650);
  await afterLock(t, tab.click('startmastery'));
  assert.equal(tab.game.S.ruleset, RULES);
  assert.deepEqual(structuredClone(tab.game.S.teams.dawn.mastery), st.teams.dawn.mastery);
});

test('an open battle picker follows roster changes and closes if a teammate already took the target', t => {
  mockTime(t);
  const st = masterySaved(104),
    to = 'LOR',
    from = factory.ADJ[to].find(n => !n.sea).id;
  st.terr[from] = {o: 'reich', u: {inf: 14, rk_mp40: 5}, f: 0, st: 'bunker'};
  st.terr[to] = {o: 'dawn', u: {bd_init: 10}, f: 0, st: 'bunker'};
  const {tab, relay} = purchaseRoom(st, 'reich');
  tab.click('sel', {id: from});
  tab.click('open', {m: 'attack'});
  tab.click('mto', {id: to});
  for (const u of ['inf', 'rk_mp40']) tab.click('step', {u, d: 'max'});
  assert.match(tab.$('#modal').innerHTML, />19 units</);
  st.terr[from].u = {inf: 5};
  st.rev++;
  relay.message('state', st);
  assert.match(tab.$('#modal').innerHTML, />5 units</);
  assert.doesNotMatch(tab.$('#modal').innerHTML, /19 units/);
  st.terr[to].o = 'reich';
  st.rev++;
  relay.message('state', st);
  assert.equal(tab.$('#modal').innerHTML, '');
  checkReadOnly(tab);
});

test('a finished mastery room is read-only; explicit leader reset retains its rules and officers', async t => {
  mockTime(t);
  const st = masterySaved(50);
  st.win = {team: 'reich', t: now, why: 'Fixture victory'};
  st.teams.reich.mastery = {inf: {atk: 1}};
  const {tab, controls} = purchaseRoom(st, 'reich', 'leader');
  tab.click('showmastery', {u: 'inf'});
  assert.ok(
    controls()
      .filter(e => e.dataset.act === 'mastery')
      .every(e => e.disabled)
  );
  await afterLock(
    t,
    tab.game.act('mastery', {unit: 'inf', skill: 'def', rank: 1, quote: {gold: 100, steel: 100}})
  );
  checkReadOnly(tab);
  tab.click('reset');
  checkReadOnly(tab);
  await afterLock(t, tab.click('reset'));
  assert.equal(tab.game.S.ruleset, RULES);
  assert.equal(tab.game.S.rev, 51);
  assert.ok(tab.game.S.players.Veteran);
  assert.equal(tab.game.S.teams.reich.mastery, undefined);
});

test('non-JSON, null, scalar and damaged retained saves are not empty; after a valid save they cannot unlock stale orders', async t => {
  mockTime(t);
  const bad = masterySaved(102);
  delete bad.terr.BUC;
  const wrongRank = masterySaved(102);
  wrongRank.teams.reich.mastery = {inf: {atk: 1.5}};
  const badOfficer = masterySaved(103);
  badOfficer.players.Veteran = null;
  for (const payload of [
    '{truncated',
    'null',
    'false',
    '"text"',
    '',
    JSON.stringify(bad),
    JSON.stringify(wrongRank),
    JSON.stringify(badOfficer)
  ]) {
    const {tab} = purchaseRoom(saved(90), 'dawn');
    await tab.click('preparemastery');
    const r = targetRelay(tab);
    r.receive(publication(MP + 'state', payload, true));
    t.mock.timers.tick(650);
    assert.match(tab.$('#panel').innerHTML, /not supported/);
    await afterLock(t, tab.click('startmastery'));
    assert.equal(tab.game.S, null);
    checkReadOnly(tab);
  }
  const {tab, relay} = purchaseRoom(masterySaved(101), 'reich');
  relay.receive(publication(MP + 'state', '{', true));
  await afterLock(t, tab.game.act('contribute', {kind: 'drill'}));
  assert.match(tab.$('#banner').innerHTML, /Incompatible/);
  checkReadOnly(tab);
  assert.equal(JSON.parse(tab.storage.get(masterKey)).rev, 101);
  const live = structuredClone(tab.game.S);
  relay.message('state', live);
  await afterLock(t, tab.game.act('contribute', {kind: 'drill'}));
  assert.equal(retained(tab).length, 1);
  assert.equal(tab.game.S.rev, 102);
});

test('a peer-only mastery snapshot is browseable, not permission to create a competing save on an empty fallback', async t => {
  mockTime(t);
  const st = officer(masterySaved(120)),
    tab = launch({cached: st, identity, rules: RULES});
  targetRelay(tab, 1);
  tab.channels[0].onmessage({data: {sub: 'state', obj: st}});
  t.mock.timers.tick(650);
  await afterLock(t, tab.game.act('contribute', {kind: 'drill'}));
  checkReadOnly(tab);
  assert.equal(tab.game.S.rev, 120);
});

test('changing backend discards a pending handoff; MQTT and Firebase Mastery caches and late callbacks do not mix', async t => {
  mockTime(t);
  const st = officer(saved(50)),
    f = firebase(st, false),
    tab = launch({identity, fetch: f.fetch});
  const [a, b, c] = tab.sockets;
  a.subscribe();
  b.onerror();
  c.onerror();
  a.message('state', st);
  await tab.click('preparemastery');
  const old = targetRelay(tab),
    late = old.onmessage;
  t.mock.timers.tick(650);
  tab.$('#fbin').value = 'https://fixture.firebaseio.com';
  tab.click('savefb');
  await flush();
  await tab.click('startmastery');
  assert.equal(tab.game.S, null);
  assert.ok(!f.calls.some(c => c.method === 'PUT'));
  assert.doesNotMatch(tab.$('#panel').innerHTML, /Start from revision/);
  const dst = officer(masterySaved(200));
  f.records.set(f.target, prune(dst));
  t.mock.timers.tick(2500);
  await flush();
  assert.equal(tab.game.S.rev, 200);
  late({data: Uint8Array.from(publication(MP + 'state', officer(masterySaved(900)))).buffer});
  assert.equal(tab.game.S.rev, 200);
  tab.click('clearfb');
  assert.equal(tab.game.S, null);
  const live = targetRelay(tab);
  live.receive(publication(MP + 'state', officer(masterySaved(71))));
  t.mock.timers.tick(650);
  assert.equal(tab.game.S.rev, 71);
  assert.equal(JSON.parse(tab.storage.get(masterKey)).rev, 71);
  assert.equal(JSON.parse(tab.storage.get(key + ':' + RULES + '|https://fixture.firebaseio.com')).rev, 200);
  checkReadOnly(tab);
});

function filePicker(tab) {
  const create = tab.document.createElement;
  let input;
  tab.document.createElement = tag => {
    const el = create(tag);
    if (tag === 'input')
      el.click = () => {
        input = el;
      };
    return el;
  };
  return data => {
    input = null;
    tab.click('importstate');
    if (!input) return null;
    input.files = [{text: async () => JSON.stringify(data)}];
    return input.onchange();
  };
}
test('backup imports reject old/equal revisions, a different campaign or rules, unreadable data and a racing update; only a newer matching backup is written', async t => {
  mockTime(t);
  const st = masterySaved(110),
    {tab, relay} = purchaseRoom(st, 'dawn', 'leader'),
    open = filePicker(tab);
  for (const edit of [
    s => (s.rev = 109),
    s => (s.rev = 110),
    s => s.created++,
    s => delete s.ruleset,
    s => s.v++,
    s => (s.terr.TRA.u = {bd_arch: -1}),
    s => (s.rev = Number.MAX_SAFE_INTEGER)
  ]) {
    const backup = structuredClone(st);
    backup.rev = 120;
    edit(backup);
    const p = open(backup);
    await flush();
    await afterLock(t, p);
    checkReadOnly(tab);
    assert.equal(tab.game.S.rev, 110);
  }
  const backup = structuredClone(st);
  backup.rev = 120;
  backup.teams.dawn.mastery = {bd_whis: {atk: 2}};
  const race = open(backup);
  await flush();
  st.rev = 111;
  relay.message('state', st);
  await afterLock(t, race);
  checkReadOnly(tab);
  const good = open(backup);
  await flush();
  await afterLock(t, good);
  assert.equal(retained(tab).length, 1);
  assert.equal(tab.game.S.rev, 121);
  assert.equal(tab.game.S.teams.dawn.mastery.bd_whis.atk, 2);
  const chief = purchaseRoom(masterySaved(110), 'reich');
  assert.equal(filePicker(chief.tab)(backup), null);
  checkReadOnly(chief.tab);
});

test('a reset confirmation does not survive a newer live revision, including during lock acquisition', async t => {
  mockTime(t);
  const st = masterySaved(210),
    {tab, relay} = purchaseRoom(st, 'dawn', 'leader');
  st.teams.dawn.mastery = {bd_init: {atk: 5}};
  tab.click('tab', {k: 'council'});
  tab.click('reset');
  assert.match(tab.$('#panel').innerHTML, /Press again to confirm/);
  st.rev++;
  relay.message('state', st);
  assert.doesNotMatch(tab.$('#panel').innerHTML, /Press again to confirm/);
  tab.click('reset');
  checkReadOnly(tab);
  const order = tab.click('reset');
  st.rev++;
  relay.message('state', st);
  await afterLock(t, order);
  assert.equal(tab.game.S.rev, 212);
  assert.equal(tab.game.S.teams.dawn.mastery.bd_init.atk, 5);
  checkReadOnly(tab);
});

test('a Mastery invite pins the actual backend, not the recipient’s saved Firebase preference or available shared DB', async t => {
  mockTime(t);
  let used = 0;
  const claude = {
      use: async () => {
        used++;
        throw Error('No capability.');
      }
    },
    url = 'https://fixture.firebaseio.com';
  const tab = launch({rules: RULES, via: 'mqtt', claude, storedFb: url});
  assert.equal(tab.sockets.length, 3);
  assert.equal(used, 0);
  checkReadOnly(tab);
  tab.click('room');
  assert.match(tab.$('#modal').innerHTML, /via=mqtt/);
  assert.ok(!tab.location.searchParams.has('fb'));
  const unavailable = launch({rules: RULES, via: 'shared', claude, storedFb: url});
  await flush();
  assert.match(unavailable.$('#panel').innerHTML, /original shared workspace/);
  assert.equal(unavailable.sockets.length, 0);
  checkReadOnly(unavailable);
  const f = firebase(officer(saved(12)), false),
    pinned = launch({rules: RULES, via: 'firebase', fb: true, claude, fetch: f.fetch});
  await flush();
  assert.equal(used, 1);
  assert.equal(pinned.sockets.length, 0);
  assert.equal(f.calls[0].k, f.target);
  assert.ok(f.calls.every(c => !c.method));
});

test('a mastery lease needs a matching broker echo and expires before a delayed writer can commit', async t => {
  mockTime(t);
  const {tab, relay} = purchaseRoom(masterySaved(72), 'reich');
  relay.noEcho = true;
  const order = () => tab.game.act('contribute', {kind: 'drill'}),
    lastClaim = () =>
      publications(relay)
        .filter(p => p.topic === MP + 'lock')
        .at(-1);
  const first = order();
  t.mock.timers.tick(1499);
  await flush();
  assert.equal(lastClaim(), undefined, 'wait out a lease missed while joining');
  t.mock.timers.tick(1);
  await flush();
  const claim = lastClaim();
  assert.ok(claim.data.token);
  tab.channels[0].onmessage({data: {sub: 'lock', obj: claim.data}});
  relay.message('lock', {...claim.data, token: 'earlier-claim'});
  await afterLock(t, first);
  assert.match(tab.$('#toasts').children.at(-1).textContent, /No live lock echo/);
  checkReadOnly(tab);
  const second = order();
  await flush();
  const next = lastClaim();
  assert.notEqual(next.data.token, claim.data.token);
  relay.message('lock', next.data);
  t.mock.timers.tick(1600);
  await afterLock(t, second);
  assert.match(tab.$('#toasts').children.at(-1).textContent, /lock expired/);
  assert.equal(tab.game.S.rev, 72);
  checkReadOnly(tab);
});

test('Firebase stream progress stays live after a slow empty GET; an incompatible stream value never becomes a writable empty room', async t => {
  mockTime(t);
  let put, initial;
  const f = firebase(officer(saved(12)), false),
    st = officer(masterySaved(100));
  f.records.set(f.target, prune(st));
  const EventSource = class {
    addEventListener(name, fn) {
      if (name === 'put') put = data => fn({data: JSON.stringify({path: '/', data})});
    }
    close() {}
  };
  const fetch = (url, o) =>
    !initial && !o?.method
      ? new Promise(resolve => {
          initial = resolve;
        })
      : f.fetch(url, o);
  const tab = launch({rules: RULES, identity, fb: true, fetch, EventSource});
  put(prune(st));
  assert.equal(tab.game.S.rev, 100);
  initial({ok: true, json: async () => null, headers: {get: () => null}});
  await flush();
  await tab.game.act('contribute', {kind: 'drill'});
  assert.equal(tab.game.S.rev, 101);
  assert.equal(f.calls.filter(c => c.k === f.target && c.method === 'PUT').length, 1);
  put(false);
  await tab.game.act('contribute', {kind: 'scavenge'});
  assert.match(tab.$('#banner').innerHTML, /Incompatible/);
  assert.equal(f.calls.filter(c => c.k === f.target && c.method === 'PUT').length, 1);
  assert.equal(tab.game.S.rev, 101);
});

test('a dropped mastery state echo cannot confirm a purchase, advance the cache, or automatically repeat the debit', async t => {
  mockTime(t);
  const {tab, relay} = purchaseRoom(masterySaved(300), 'dawn');
  relay.dropStateEcho = true;
  const order = tab.game.act('mastery', {
    unit: 'bd_init',
    skill: 'def',
    rank: 1,
    quote: {gold: 10, steel: 10}
  });
  await afterLock(t, order);
  const attempts = retained(tab);
  assert.equal(attempts.length, 1);
  assert.match(tab.$('#toasts').children.at(-1).textContent, /not confirmed/);
  assert.equal(tab.game.S.rev, 300);
  assert.equal(JSON.parse(tab.storage.get(masterKey)).rev, 300);
  assert.ok(!tab.channels.flatMap(c => c.sent).some(p => p.sub === 'state'));
  // If the write landed but its acknowledgment was lost, the reconnect adopts it, not a second order.
  const r = targetRelay(tab);
  r.receive(publication(MP + 'state', attempts[0].data));
  t.mock.timers.tick(650);
  assert.equal(tab.game.S.rev, 301);
  assert.equal(tab.game.S.teams.dawn.mastery.bd_init.def, 1);
  assert.equal(retained(tab).length, 1);
});
