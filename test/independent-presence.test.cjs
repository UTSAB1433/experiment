const assert = require('node:assert/strict');
const test = require('node:test');
const {
  launch,
  saved,
  RULES,
  room,
  publication,
  publications,
  now,
  mockTime,
  flush,
  finishOrder
} = require('../test-support/war-room.cjs');
const copy = structuredClone;
function campaign(rules, rev = 80) {
  const st = saved(rev);
  if (rules) st.ruleset = rules;
  for (const team of ['reich', 'dawn'])
    st.players['Fixture ' + team] = {team, role: 'soldier', pw: team + '-only', cd: 0};
  st.terr.MOS.u = {inf: 1};
  return st;
}
const identity = team => ({name: 'Fixture ' + team, ph: team + '-only'});
async function elapsed(t, ms) {
  while (ms > 0) {
    const step = Math.min(ms, 5000);
    t.mock.timers.tick(step);
    await flush();
    ms -= step;
  }
}
// Link actual game clients through one ordered, asynchronous local topic bus. No
// shared localStorage or BC; new publications arrive live (not retained replays).
function mqtt(st) {
  const clients = [],
    writes = [],
    messages = [];
  const wire = st.ruleset ? room + ':' + RULES : room,
    pfx = 'lands-eot/v1/' + wire + '/';
  const net = {before: null, filter: null, state: copy(st), sleepOffset: 0};
  const WallClock = class extends Date {
    static now() {
      return Date.now() + net.sleepOffset;
    }
  };
  function deliver(sub, data, retained = false) {
    const raw = publication(pfx + sub, data);
    raw[0] = retained ? 0x31 : 0x30;
    for (const c of clients) if (c.online && c.socket.readyState === 1) c.socket.receive(raw);
  }
  function join(who, opts = {}) {
    const tab = launch({identity: who, rules: st.ruleset, timers: {Date: WallClock}, ...opts}),
      [socket, b, c] = tab.sockets;
    b.onerror();
    c.onerror();
    socket.subscribe();
    socket.message('state', net.state);
    const client = {tab, socket, online: true};
    clients.push(client);
    socket.noEcho = true;
    const original = socket.send.bind(socket);
    socket.send = bytes => {
      original(bytes);
      if (bytes[0] >> 4 !== 3 || !client.online) return;
      const [{topic, data, retain}] = publications({sent: [Buffer.from(bytes)]}),
        sub = topic.slice(pfx.length);
      messages.push({sub, data, retain});
      if (sub === 'state') {
        writes.push(copy(data));
        net.state = copy(data);
      }
      if (net.filter?.(sub, data, client) === false) return;
      queueMicrotask(() => {
        net.before?.(sub, data, client);
        deliver(sub, data);
      });
    };
    return client;
  }
  return Object.assign(net, {deliver, join, clients, writes, messages});
}
function allCapitalsHome(st) {
  for (const id of ['PAR', 'BSB', 'DEL']) st.terr[id].o = 'neutral';
  return st;
}
function challengeableCapital(st) {
  allCapitalsHome(st);
  st.terr.MOS.o = 'dawn';
  st.terr.MOS.u = {};
  st.terr.LEN.u = {arm: 100};
  return st;
}
for (const rules of [undefined, RULES])
  for (const team of ['reich', 'dawn'])
    test(`MQTT ${rules || 'Classic'}: one ${team} soldier activates training and capital recovery, even with duplicate tabs; no one, no turn`, async t => {
      mockTime(t);
      const st = challengeableCapital(campaign(rules)),
        net = mqtt(st);
      const spec = net.join({name: '__spectator'}),
        bad = net.join({...identity(team), ph: 'wrong'});
      net.deliver('pres', {tab: 'advertised', team, name: 'Fixture ' + team});
      await elapsed(t, 100000);
      assert.equal(net.writes.length, 0);
      const r = net.join(identity(team)),
        r2 = net.join(identity(team));
      await elapsed(t, 90000);
      assert.equal(net.writes.length, 0, 'first confirmed check-in starts the clock');
      r.tab.click('tab', {k: 'front'});
      assert.match(r.tab.$('#panel').innerHTML, /Active player online/);
      await elapsed(t, 5000);
      assert.deepEqual(
        net.writes.map(s => s.rev),
        [81]
      );
      const first = copy(net.state);
      assert.equal(first.front.turn, 1);
      assert.ok(first.front.drill.USA);
      assert.ok(
        Object.values(first.terr.WDC.u).reduce((n, x) => n + x, 0) >
          Object.values(st.terr.WDC.u).reduce((n, x) => n + x, 0)
      );
      assert.equal(first.log[0].kind, 'front');
      assert.equal(first.log[0].recovery, true);
      assert.equal(first.terr.MOS.country, 'USSR');
      assert.deepEqual(first.players, copy(st.players));
      assert.equal(first.v, 6);
      for (const c of [r, r2, spec, bad]) assert.equal(c.tab.game.S.rev, 81);
      const signals = net.messages.filter(m => m.sub === 'muster');
      assert.ok(
        signals.length > 2 && signals.every(m => !m.retain && !JSON.stringify(m.data).includes('-only'))
      );
      r.tab.click('spectate');
      assert.equal(r.tab.storage.get('eot-me'), '__spectator');
      assert.equal(r.tab.storage.has('eot-ph'), false);
      r2.online = false; // abrupt loss; no broker echoes from the second tab
      await elapsed(t, 120000);
      assert.deepEqual(net.state, first);
      net.sleepOffset += 86400000; // suspension, not a day's worth of replayed intervals
      r2.online = true;
      r2.tab.dispatch('pointerdown');
      await elapsed(t, 90000);
      assert.equal(net.writes.length, 1);
      await elapsed(t, 5000);
      assert.deepEqual(
        net.writes.map(s => s.front.turn),
        [1, 2]
      );
      assert.equal(net.state.log[0].tid, undefined, 'no unrelated raids once the capital is home');
    });

test('paired players can still enable ordinary raids; losing one side keeps the other side’s upkeep clock running', async t => {
  mockTime(t);
  const net = mqtt(allCapitalsHome(campaign())),
    r = net.join(identity('reich')),
    d = net.join(identity('dawn'));
  await elapsed(t, 90000);
  assert.equal(net.writes.length, 0);
  await elapsed(t, 10000);
  assert.deepEqual(
    net.writes.map(s => s.rev),
    [81]
  );
  assert.ok(net.state.log[0].from && !net.state.log[0].recovery);
  r.tab.click('tab', {k: 'front'});
  assert.match(r.tab.$('#panel').innerHTML, /Both factions online/);
  r.tab.click('spectate');
  await elapsed(t, 90000);
  assert.equal(net.writes.length, 2);
  assert.equal(net.state.log[0].tid, undefined);
  d.tab.click('tab', {k: 'front'});
  assert.match(d.tab.$('#panel').innerHTML, /Active player online/);
});
test('cached/offline/spectating, peer-only, and silent or corrupt selected relays never authorize even a muster; join cannot initialize a board', async t => {
  mockTime(t);
  const st = campaign();
  const tabs = [];
  for (const state of ['cached', 'silent', 'peer', 'corrupt']) {
    const tab = launch({identity: identity('reich'), cached: st});
    tabs.push(tab);
    for (const [i, s] of tab.sockets.entries())
      if (state === 'cached' || i !== 0) s.onerror();
      else s.subscribe();
    const s = tab.sockets[0];
    if (state === 'peer') tab.channels[0].onmessage({data: {sub: 'state', obj: st}});
    if (state === 'corrupt') s.message('state', {...st, front: {turn: -1}});
    await elapsed(t, 600);
    s.message('pres', {tab: 'dawn', team: 'dawn', name: 'Fixture dawn'});
  }
  await elapsed(t, 120000);
  for (const tab of tabs)
    assert.ok(tab.sockets.flatMap(publications).every(p => !p.retain && !p.topic.endsWith('/muster')));
});
test('cached, absent, retained and BroadcastChannel self-echoes cannot establish a solo live streak', async t => {
  mockTime(t);
  const net = mqtt(campaign()),
    r = net.join(identity('dawn'));
  net.filter = sub => sub !== 'muster'; // drop actual broker check-ins
  let early;
  for (let i = 0; i < 25; i++) {
    await elapsed(t, 5000);
    const q = net.messages.filter(m => m.sub === 'muster').at(-1).data;
    early ||= q;
    net.deliver('muster', q, true);
    r.tab.channels[0].onmessage({data: {sub: 'muster', obj: q}});
    if (Date.now() - early.at > 18000) net.deliver('muster', early);
    for (const bad of [
      {...q, tab: 'elsewhere'},
      {...q, rev: 17},
      {...q, created: 0},
      {...q, origin: 'old'},
      {...q, name: 'Spectator'}
    ])
      net.deliver('muster', bad);
  }
  assert.equal(net.writes.length, 0);
  net.filter = null;
  await elapsed(t, 90000);
  assert.equal(net.writes.length, 0);
  await elapsed(t, 25000); // allow the last unconfirmed pulse to expire before a fresh check-in
  assert.equal(net.writes.length, 1);
});
test('a pre-deadline, retained, BC, malformed or expired opposing reply cannot promote a solo turn to an ordinary raid', async t => {
  mockTime(t);
  const net = mqtt(allCapitalsHome(campaign())),
    r = net.join(identity('reich'));
  await elapsed(t, 5000);
  const challenge = () => net.messages.filter(m => m.sub === 'muster' && m.data.to === 'dawn').at(-1).data;
  const reply = q => ({...q, at: Date.now(), tab: 'other-tab', name: 'Fixture dawn', team: 'dawn', to: q.tab});
  for (let i = 0; i < 17; i++) {
    net.deliver('muster', reply(challenge()));
    await elapsed(t, 5000);
  }
  const early = reply(challenge());
  for (let i = 0; i < 25; i++) {
    await elapsed(t, 5000);
    const q = challenge(),
      ack = reply(q);
    net.deliver('muster', ack, true);
    r.tab.channels[0].onmessage({data: {sub: 'muster', obj: ack}});
    for (const bad of [
      early,
      {...ack, tab: q.tab},
      {...ack, to: 'another'},
      {...ack, v: 1},
      {...ack, rev: 21},
      {...ack, created: now - 400000},
      {...ack, name: 'Joining…'},
      {...ack, team: 'reich'},
      {...ack, turn: 99},
      {...ack, at: now},
      {...ack, until: Date.now()}
    ])
      net.deliver('muster', bad);
  }
  await elapsed(t, 25000); // an answer to another tab may briefly yield the lock, never authorize a raid
  assert.deepEqual(
    net.writes.map(s => s.front.turn),
    [1, 2]
  );
  assert.ok(net.writes.every(s => !s.log[0].tid));
});
for (const scene of ['newer', 'removed', 'victory', 'leave', 'disconnect', 'unconfirmed'])
  test(`due turn rechecks live authority during the lock: ${scene}`, async t => {
    mockTime(t);
    const st = campaign(),
      net = mqtt(st),
      r = net.join(identity('reich'));
    let interrupted = false;
    net.before = (sub, msg) => {
      if (sub !== 'lock' || interrupted) return;
      interrupted = true;
      if (scene === 'disconnect') return r.socket.close();
      if (scene === 'leave') {
        r.tab.click('spectate');
        return;
      }
      const fresh = copy(st);
      fresh.rev = 109;
      fresh.teams.reich.res.gold = 1234;
      if (scene === 'removed') delete fresh.players['Fixture reich'];
      if (scene === 'victory') fresh.win = {team: 'dawn', why: 'Fixture', t: Date.now()};
      if (scene === 'unconfirmed') r.tab.channels[0].onmessage({data: {sub: 'state', obj: fresh}});
      else net.deliver('state', fresh);
    };
    await elapsed(t, 95000);
    assert.ok(interrupted);
    assert.equal(net.writes.length, 0);
    assert.equal(r.tab.game.S.front, undefined);
    if (scene === 'newer') {
      await elapsed(t, 15000);
      assert.equal(net.writes.length, 1);
      assert.equal(net.state.rev, 110);
      assert.ok(net.state.teams.reich.res.gold >= 1234);
    } else if (['removed', 'victory', 'unconfirmed'].includes(scene)) {
      await elapsed(t, 105000);
      assert.equal(net.writes.length, 0);
    }
  });

// Two expiring signal slots are separate from state and lock. Exercise the real
// Firebase REST adapter (including pruning/ETags) and shared-document adapter.
const prune = v => {
  if (v == null || typeof v !== 'object') return v;
  const out = Array.isArray(v)
    ? Array.from(v, prune)
    : Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, prune(x)])
          .filter(([, x]) => x != null)
      );
  return Object.keys(out).length ? out : null;
};
function documents(type, rules, st = campaign(rules)) {
  const fb = type === 'firebase',
    wire = rules ? room + ':' + rules : room;
  const dir = fb ? '/eot-rooms/' + encodeURIComponent(wire) + '/' : rules ? 'game-' + wire + '/' : 'game/';
  const state = dir + 'state' + (fb ? '.json' : ''),
    lock = dir + 'lock' + (fb ? '.json' : '');
  const slots = t => dir + (fb ? 'muster/' + t + '.json' : 'muster-' + t);
  const records = new Map([[state, fb ? prune(st) : copy(st)]]),
    calls = [],
    writes = [],
    listeners = new Set();
  const net = {
    records,
    calls,
    writes,
    state,
    lock,
    slots,
    conflict: null,
    onLock: null,
    onCheck: null,
    onRead: null
  };
  const snap = k => ({exists: records.get(k) != null, data: () => copy(records.get(k))});
  function commit(k, data) {
    records.set(k, fb ? prune(data) : copy(data));
    if (k === state) {
      writes.push(copy(data));
      for (const cb of listeners) cb(snap(k));
    }
  }
  function join(who, cached) {
    const client = {blocked: false, deny: false};
    function available(k) {
      if (client.blocked || (client.deny && k.includes('muster'))) throw Error('Signals unavailable');
    }
    const fetch = async (url, o = {}) => {
      const k = new URL(url).pathname;
      available(k);
      calls.push([k, o.method || 'GET', o.headers]);
      if (k === lock && o.method === 'PUT') await net.onLock?.();
      if (k === state && o.headers?.['X-Firebase-ETag']) await net.onCheck?.();
      const data = copy(records.get(k) ?? null),
        tag = '"' + (data?.rev || 0) + '"';
      if (o.method === 'PUT') {
        if (k === state && net.conflict) {
          commit(k, net.conflict);
          net.conflict = null;
          return {ok: false, status: 412};
        }
        if (k === state && o.headers?.['if-match'] !== tag) return {ok: false, status: 412};
        commit(k, JSON.parse(o.body));
      }
      return {ok: true, json: async () => data, headers: {get: () => tag}};
    };
    const claude = {
      use: async () => ({
        doc: k => ({
          async get() {
            available(k);
            calls.push([k, 'GET']);
            if (k === state) await net.onCheck?.();
            await net.onRead?.(k);
            return snap(k);
          },
          async set(v) {
            available(k);
            calls.push([k, 'SET']);
            commit(k, v);
          },
          async acquire({holder, ttlMs}) {
            available(k);
            calls.push([k, 'LOCK']);
            const prev = records.get(k);
            if (prev?.until > Date.now() && prev.holder !== holder) return {acquired: false};
            records.set(k, {holder, until: Date.now() + ttlMs});
            await net.onLock?.();
            return {acquired: true};
          },
          onSnapshot(cb) {
            listeners.add(cb);
            cb(snap(k));
            return () => listeners.delete(cb);
          }
        })
      })
    };
    client.tab = launch({rules, identity: who, cached, ...(fb ? {fb: true, fetch} : {claude})});
    return client;
  }
  return Object.assign(net, {join, commit});
}
for (const type of ['firebase', 'shared'])
  for (const rules of [undefined, RULES])
    test(`${type} ${rules || 'Classic'}: solo Dawn can liberate a capital; duplicate tabs cannot double-write, and ghost mailboxes cannot keep the room running`, async t => {
      mockTime(t);
      const f = documents(type, rules, challengeableCapital(campaign(rules)));
      const d = f.join(identity('dawn')),
        d2 = f.join(identity('dawn')),
        spec = f.join({name: '__spectator'});
      await flush();
      await elapsed(t, 90000);
      assert.equal(f.writes.length, 0);
      await elapsed(t, 10000);
      assert.deepEqual(
        f.writes.map(s => s.rev),
        [81]
      );
      assert.equal(f.writes[0].front.turn, 1);
      assert.equal(f.writes[0].terr.MOS.country, 'USSR');
      for (const c of [d, d2, spec]) assert.equal(c.tab.game.S.rev, 81);
      if (type === 'firebase')
        assert.ok(f.calls.some(([k, m, h]) => k === f.state && m === 'PUT' && h['if-match'] === '"80"'));
      const r = f.join(identity('reich'));
      await flush();
      await elapsed(t, 25000);
      for (const side of ['reich', 'dawn']) assert.ok(f.records.has(f.slots(side)));
      assert.deepEqual(
        [...f.records.keys()].sort(),
        [f.lock, f.state, f.slots('reich'), f.slots('dawn')].sort()
      );
      assert.ok([...f.records.values()].filter(m => m.token).every(m => !JSON.stringify(m).includes('-only')));
      d.tab.click('spectate');
      d2.tab.click('spectate');
      r.tab.click('spectate');
      const frozen = copy(f.records.get(f.state));
      await elapsed(t, 150000);
      assert.deepEqual(f.records.get(f.state), frozen);
      f.join(identity('reich'));
      await flush();
      await elapsed(t, 90000);
      assert.equal(f.writes.length, 1);
      await elapsed(t, 5000);
      assert.deepEqual(
        f.writes.map(s => s.front.turn),
        [1, 2]
      );
    });
test('Firebase refuses a conflicting front save, adopts the higher revision and never overwrites a post-battle roster change', async t => {
  mockTime(t);
  const f = documents('firebase', RULES),
    updated = campaign(RULES, 190);
  delete updated.players['Fixture reich'];
  updated.teams.dawn.res.gold = 982;
  f.conflict = updated;
  const r = f.join(identity('reich'));
  await flush();
  await elapsed(t, 230000);
  assert.deepEqual(f.records.get(f.state), prune(updated));
  assert.equal(r.tab.game.S.rev, 190);
  assert.equal(r.tab.game.S.front, undefined);
  assert.equal(f.calls.filter(([k, m]) => k === f.state && m === 'PUT').length, 1);
});
test('a delayed shared locked read cannot use an expired lease, a newer unseen save or a departed player', async t => {
  mockTime(t);
  const f = documents('shared', RULES);
  const r = f.join(identity('dawn'));
  await flush();
  let release;
  f.onCheck = () =>
    new Promise(ok => {
      release = ok;
    });
  for (let i = 0; i < 26 && !release; i++) await elapsed(t, 5000);
  assert.ok(release);
  const updated = campaign(RULES, 208);
  delete updated.players['Fixture dawn'];
  f.records.set(f.state, updated); // not yet in onSnapshot
  r.tab.click('spectate');
  await elapsed(t, 10000);
  release();
  await flush();
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.records.get(f.state), updated);
  assert.equal(r.tab.game.S.front, undefined);
});
for (const type of ['firebase', 'shared'])
  test(`${type}: failed live reads pause the local streak; another healthy post can still run upkeep`, async t => {
    mockTime(t);
    const f = documents(type, undefined, allCapitalsHome(campaign())),
      d = f.join(identity('dawn'));
    d.deny = true;
    await flush();
    await elapsed(t, 120000);
    assert.equal(f.writes.length, 0);
    const r = f.join(identity('reich'));
    await flush();
    await elapsed(t, 100000);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].log[0].tid, undefined);
    r.blocked = true;
    await elapsed(t, 100000);
    assert.equal(f.writes.length, 1);
    d.deny = false;
    d.tab.dispatch('pointerdown');
    await elapsed(t, 90000);
    assert.equal(f.writes.length, 1);
    await elapsed(t, 5000);
    assert.equal(f.writes.length, 2);
  });
test('a higher shared snapshot arriving AFTER the locked read but during the final quorum check is never overwritten', async t => {
  mockTime(t);
  const f = documents('shared'),
    r = f.join(identity('reich'));
  f.join(identity('dawn'));
  await flush();
  let intervened = false;
  f.onCheck = () => {
    f.onRead = k => {
      if (intervened || k !== f.slots('dawn')) return;
      intervened = true;
      const newer = campaign(undefined, 150);
      newer.terr.MOS.u = {arm: 77};
      f.commit(f.state, newer); // snapshot delivered after the locked read
    };
  };
  for (let i = 0; i < 26 && !intervened; i++) await elapsed(t, 5000);
  assert.ok(intervened);
  assert.deepEqual(
    f.writes.map(s => s.rev),
    [150]
  );
  assert.deepEqual(copy(r.tab.game.S.terr.MOS.u), {arm: 77});
});
for (const writer of ['same device', 'other faction'])
  test(`a player order racing an independent operation survives both writes (${writer})`, async t => {
    mockTime(t);
    const st = campaign(),
      net = mqtt(st),
      r = net.join(identity('reich')),
      d = net.join(identity('dawn'));
    let order;
    const who = writer === 'same device' ? r : d,
      team = writer === 'same device' ? 'reich' : 'dawn';
    net.before = sub => {
      if (sub === 'lock' && !order) order = who.tab.game.act('contribute', {kind: 'drill'});
    };
    await elapsed(t, 95000);
    assert.ok(order);
    await finishOrder(t, order);
    assert.deepEqual(
      net.writes.map(s => s.rev),
      [81, 82]
    );
    assert.equal(net.state.front.turn, 1);
    assert.equal(net.state.log.filter(l => l.kind === 'front').length, 1);
    assert.deepEqual(net.state.front, net.writes[0].front);
    const first = copy(net.writes[0]);
    r.tab.game.tick(first, net.state.t);
    assert.equal(net.state.teams[team].res.man, first.teams[team].res.man + 6);
  });
for (const type of ['firebase', 'shared'])
  test(`${type}: two players with warm caches cannot create a missing live save or run a finished campaign`, async t => {
    mockTime(t);
    const f = documents(type),
      st = campaign();
    f.records.delete(f.state);
    f.join(identity('reich'), st);
    f.join(identity('dawn'), st);
    await flush();
    await elapsed(t, 130000);
    assert.equal(f.writes.length, 0);
    assert.equal(f.records.size, 0);
    const ended = campaign(undefined, 87);
    ended.win = {team: 'reich', why: 'Fixture victory', t: now};
    f.commit(f.state, ended);
    await elapsed(t, 140000);
    assert.equal(f.writes.length, 1);
    assert.equal(f.records.get(f.state).front, undefined);
    assert.equal(f.records.size, 1);
  });
test('an expired shared lease alone stops a due operation even if the roster, proof and revision remain unchanged', async t => {
  mockTime(t);
  const f = documents('shared');
  f.join(identity('dawn'));
  await flush();
  let release;
  f.onCheck = () =>
    new Promise(resolve => {
      release = resolve;
    });
  for (let n = 0; n < 26 && !release; n++) await elapsed(t, 5000);
  assert.ok(release);
  await elapsed(t, 1600);
  release();
  await flush();
  assert.equal(f.writes.length, 0);
  assert.equal(f.records.get(f.state).front, undefined);
});

test('the visible five-minute timer follows input, not heartbeats, other tabs or renders; AFK pauses and keyboard return starts a fresh interval', async t => {
  mockTime(t);
  const net = mqtt(allCapitalsHome(campaign())),
    d = net.join(identity('dawn')),
    spec = net.join({name: '__spectator'});
  d.tab.click('tab', {k: 'front'});
  spec.tab.click('room');
  assert.doesNotMatch(spec.tab.$('#hud').innerHTML, /AFK in/);
  await elapsed(t, 250000);
  assert.match(d.tab.$('#hud').innerHTML, /AFK in<\/span><span>0:50/);
  d.tab.dispatch('pointerdown'); // extend the deadline, not the independent turn clock
  await elapsed(t, 50000);
  assert.match(d.tab.$('#hud').innerHTML, /AFK in<\/span><span>4:10/);
  await elapsed(t, 249000);
  assert.match(d.tab.$('#hud').innerHTML, /AFK in<\/span><span>0:01/);
  await elapsed(t, 1000);
  assert.match(d.tab.$('#hud').innerHTML, /AFK<\/span><span>Interact to return/);
  assert.equal(d.tab.$('#front-signal').textContent, 'AFK on this device');
  assert.match(spec.tab.$('#room-presence').innerHTML, /Fixture dawn · AFK/);
  const frozen = copy(net.state),
    heartbeatCount = net.messages.filter(m => m.sub === 'muster' && !m.data.bye).length;
  assert.equal(frozen.front.turn, 6);
  spec.tab.dispatch('pointermove');
  d.tab.dispatch('pointermove', {isTrusted: false});
  await elapsed(t, 180000);
  assert.deepEqual(net.state, frozen);
  assert.equal(net.messages.filter(m => m.sub === 'muster' && !m.data.bye).length, heartbeatCount);
  d.tab.dispatch('keydown', {key: 'Shift', target: {}});
  await elapsed(t, 90000);
  assert.deepEqual(net.state, frozen, 'no catch-up attack on wake');
  assert.doesNotMatch(spec.tab.$('#room-presence').innerHTML, /Fixture dawn · AFK/);
  await elapsed(t, 5000);
  assert.equal(net.state.front.turn, frozen.front.turn + 1);
  assert.deepEqual(net.state.players, frozen.players);
  assert.ok(!/lastInput|activeUntil|"afk"|"until":/.test(JSON.stringify(net.state.front)));
});

test('an AFK deadline crossed inside a still-valid lock cannot authorize a last turn', async t => {
  mockTime(t);
  const st = campaign();
  st.front = {turn: 1, at: now + 210000, drill: {}};
  const net = mqtt(st),
    r = net.join(identity('reich'));
  await elapsed(t, 800);
  r.tab.dispatch('wheel'); // AFK deadline at 300.8 seconds
  await elapsed(t, 294200); // t = 295 seconds, five seconds before the saved turn is due
  assert.equal(net.writes.length, 0);
  let held = false;
  net.before = sub => {
    if (sub === 'lock') {
      held = true;
      net.sleepOffset += 900;
    }
  }; // under the 1.5s lease
  await elapsed(t, 5000);
  assert.ok(held);
  assert.equal(net.writes.length, 0);
  await elapsed(t, 100000);
  assert.deepEqual(net.state, copy(st));
});

test('pagehide stops even a still-ticking tab; pageshow or waking after suspension cannot bank an interval', async t => {
  mockTime(t);
  const net = mqtt(campaign(RULES)),
    d = net.join(identity('dawn'));
  await elapsed(t, 85000);
  d.tab.dispatchWindow('pagehide');
  await elapsed(t, 125000);
  assert.equal(net.writes.length, 0);
  d.tab.dispatchWindow('pageshow');
  await elapsed(t, 85000);
  assert.equal(net.writes.length, 0);
  net.sleepOffset += 86400000;
  // Return before a timer has had a chance to observe the gap.
  d.tab.dispatch('pointermove');
  await elapsed(t, 90000);
  assert.equal(net.writes.length, 0);
  await elapsed(t, 5000);
  assert.deepEqual(
    net.writes.map(s => s.front.turn),
    [1]
  );
});

for (const type of ['firebase', 'shared'])
  test(`${type}: a live pair can raid, but an AFK opponent's mailbox cannot enable further expansion`, async t => {
    mockTime(t);
    const f = documents(type, RULES, allCapitalsHome(campaign(RULES))),
      r = f.join(identity('reich'));
    const r2 = f.join(identity('reich')),
      d = f.join(identity('dawn'));
    await flush();
    await elapsed(t, 250000);
    assert.equal(f.writes.length, 2);
    assert.ok(
      f.writes.some(s => s.log[0].from && !s.log[0].recovery),
      'pair-muster must not starve behind solo turns'
    );
    r2.tab.click('spectate');
    r.tab.dispatch('pointerdown'); // only r remains active past 300s
    await elapsed(t, 60000);
    assert.match(d.tab.$('#hud').innerHTML, /Interact to return/);
    const count = f.writes.length;
    await elapsed(t, 190000);
    assert.equal(f.writes.length, count + 2);
    assert.ok(
      f.writes.slice(count).every(s => !s.log[0].tid),
      'Dawn idle, so only non-raid turns'
    );
  });

test('a paired turn loses raid authority when the opposing post signs out during the lock', async t => {
  mockTime(t);
  const net = mqtt(allCapitalsHome(campaign()));
  net.join(identity('reich'));
  const d = net.join(identity('dawn'));
  let left = false;
  net.before = sub => {
    if (sub === 'lock' && !left) {
      left = true;
      d.tab.click('spectate');
    }
  };
  await elapsed(t, 95000);
  assert.ok(left);
  assert.equal(net.writes.length, 0);
  await elapsed(t, 15000);
  assert.deepEqual(
    net.writes.map(s => s.front.turn),
    [1]
  );
  assert.ok(net.state.front.drill.USA && !net.state.log[0].tid);
});

test('an active solo post cannot mutate a Classic save that already contains Mastery ranks', async t => {
  mockTime(t);
  const st = campaign();
  st.teams.reich.mastery = {inf: {atk: 1}};
  const net = mqtt(st),
    r = net.join(identity('reich'));
  await elapsed(t, 120000);
  r.tab.click('tab', {k: 'front'});
  assert.match(r.tab.$('#panel').innerHTML, /Orders paused/);
  assert.deepEqual(net.state, copy(st));
  assert.ok(net.messages.every(m => m.sub !== 'muster' && m.sub !== 'lock'));
});
