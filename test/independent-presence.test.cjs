const assert = require('node:assert/strict');
const test = require('node:test');
const {
  launch,
  saved,
  RULES,
  room,
  prefix,
  key,
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
for (const rules of [undefined, RULES])
  test(`MQTT ${rules || 'Classic'}: needs one signed-in player of EACH faction; three tabs, one revision, real losses, no absentee turns or offline catch-up`, async t => {
    mockTime(t);
    const st = campaign(rules),
      net = mqtt(st);
    const r1 = net.join(identity('reich')),
      r2 = net.join(identity('reich'));
    const spec = net.join({name: '__spectator', ph: 'anything'}),
      bad = net.join({...identity('dawn'), ph: 'wrong'});
    net.deliver('pres', {tab: 'idle', team: 'dawn', name: 'Fixture dawn'});
    await elapsed(t, 100000);
    assert.equal(net.writes.length, 0);
    assert.deepEqual(copy(r1.tab.game.S.terr), copy(st.terr));
    for (const c of [r1, r2, spec, bad]) assert.equal(c.tab.game.S.front, undefined);
    const dawn = net.join(identity('dawn'));
    await elapsed(t, 25000);
    r1.tab.click('tab', {k: 'front'});
    assert.match(r1.tab.$('#panel').innerHTML, /Both factions online/);
    await elapsed(t, 60000);
    assert.equal(net.writes.length, 0, 'not due yet');
    await elapsed(t, 25000);
    assert.deepEqual(
      net.writes.map(s => s.rev),
      [81]
    );
    const first = copy(net.state);
    assert.equal(first.front.turn, 1);
    assert.ok(first.front.drill.USSR);
    assert.ok(Object.values(first.terr.MOS.u).reduce((a, b) => a + b, 0) > 1);
    assert.equal(first.log[0].kind, 'front');
    assert.ok(first.log[0].from);
    assert.deepEqual(first.players, copy(st.players));
    assert.equal(first.v, 6);
    assert.match(r1.tab.$('#panel').innerHTML, /OP \/ 001/);
    assert.equal(
      net.clients.every(c => c.tab.game.S.rev === 81),
      true
    );
    const signals = net.messages.filter(m => m.sub === 'muster');
    assert.ok(signals.length > 2);
    assert.ok(signals.every(m => !m.retain && !JSON.stringify(m.data).includes('-only')));
    dawn.online = false; // Abrupt disappearance, deliberately NO leave packet.
    await elapsed(t, 200000);
    assert.equal(net.writes.length, 1);
    assert.deepEqual(net.state, first);
    r1.tab.click('tab', {k: 'front'});
    assert.match(r1.tab.$('#panel').innerHTML, /On standby/);
    // A suspended tab returns after a day. A fresh full interval must pass first.
    net.sleepOffset += 86400000;
    dawn.online = true;
    await elapsed(t, 85000);
    assert.equal(net.writes.length, 1);
    await elapsed(t, 35000);
    assert.deepEqual(
      net.writes.map(s => s.front.turn),
      [1, 2]
    );
    // The reverse direction: Dawn alone cannot run a turn either.
    r1.online = r2.online = false;
    await elapsed(t, 140000);
    assert.equal(net.writes.length, 2);
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
test('retained/BC replies, self, bad team, stale revision or campaign, replayed or pre-deadline responses are not turn authority', async t => {
  mockTime(t);
  const st = campaign(),
    net = mqtt(st),
    r = net.join(identity('reich'));
  await elapsed(t, 5000);
  const reply = q => ({...q, at: Date.now(), tab: 'only-peer', name: 'Fixture dawn', team: 'dawn', to: q.tab});
  const challenge = () => net.messages.filter(m => m.sub === 'muster' && m.data.team === 'reich').at(-1).data;
  // Refresh ordinary heartbeats until just BEFORE the first legal turn. Replaying
  // one should not turn receipt time into an authorization for a later attack.
  for (let i = 0; i < 17; i++) {
    net.deliver('muster', reply(challenge()));
    await elapsed(t, 5000);
  }
  const early = reply(challenge());
  await elapsed(t, 5000);
  net.deliver('muster', early);
  await flush();
  assert.equal(net.writes.length, 0);
  for (let i = 0; i < 25; i++) {
    await elapsed(t, 5000);
    const q = challenge(),
      ack = reply(q);
    net.deliver('muster', ack, true);
    r.tab.channels[0].onmessage({data: {sub: 'muster', obj: ack}});
    for (const bad of [
      early,
      {...ack, tab: q.tab},
      {...ack, to: 'different'},
      {...ack, rev: 21},
      {...ack, created: now - 400000},
      {...ack, name: 'Joining…'},
      {...ack, team: 'reich'},
      {...ack, turn: 1},
      {...ack, at: now}
    ])
      net.deliver('muster', bad);
  }
  await flush();
  assert.equal(net.writes.length, 0);
  assert.equal(r.tab.game.S.rev, 80);
  assert.deepEqual(copy(r.tab.game.S.terr), copy(st.terr));
});
for (const scene of ['newer', 'removed', 'victory', 'leave', 'disconnect', 'unconfirmed'])
  test(`due turn rechecks live authority during the lock: ${scene}`, async t => {
    mockTime(t);
    const st = campaign(),
      net = mqtt(st),
      r = net.join(identity('reich'));
    net.join(identity('dawn'));
    let interrupted = false;
    net.before = (sub, msg) => {
      if (sub !== 'lock' || interrupted) return;
      interrupted = true;
      if (scene === 'disconnect') return r.socket.close();
      if (scene === 'leave') {
        const d = net.messages.filter(m => m.sub === 'muster' && m.data.team === 'dawn').at(-1).data;
        net.deliver('pres', {...d, bye: true});
        return;
      }
      const fresh = copy(st);
      fresh.rev = 109;
      fresh.teams.reich.res.gold = 1234;
      if (scene === 'removed') delete fresh.players['Fixture dawn'];
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
    test(`${type} ${rules || 'Classic'}: only paired campaigns train, no state initialization by presence, no ghost mailbox turn after sign-out or reload`, async t => {
      mockTime(t);
      const f = documents(type, rules),
        r = f.join(identity('reich')),
        r2 = f.join(identity('reich'));
      const spec = f.join({name: '__spectator'});
      await flush();
      await elapsed(t, 115000);
      assert.equal(f.writes.length, 0);
      const dawn = f.join(identity('dawn'));
      await flush();
      await elapsed(t, 85000);
      assert.equal(f.writes.length, 0);
      await elapsed(t, 45000);
      assert.deepEqual(
        f.writes.map(s => s.rev),
        [81]
      );
      assert.equal(f.writes[0].front.turn, 1);
      for (const c of [r, r2, dawn, spec]) assert.equal(c.tab.game.S.rev, 81);
      for (const side of ['reich', 'dawn']) assert.ok(f.records.has(f.slots(side)));
      assert.deepEqual(
        [...f.records.keys()].sort(),
        [f.lock, f.state, f.slots('reich'), f.slots('dawn')].sort()
      );
      assert.ok([...f.records.values()].filter(m => m.token).every(m => !JSON.stringify(m).includes('-only')));
      if (type === 'firebase')
        assert.ok(f.calls.some(([k, m, h]) => k === f.state && m === 'PUT' && h['if-match'] === '"80"'));
      const frozen = copy(f.records.get(f.state));
      dawn.tab.click('spectate');
      await flush();
      await elapsed(t, 190000);
      assert.deepEqual(f.records.get(f.state), frozen);
      f.join(identity('dawn'));
      await flush();
      await elapsed(t, 85000);
      assert.equal(f.writes.length, 1);
      await elapsed(t, 45000);
      assert.deepEqual(
        f.writes.map(s => s.front.turn),
        [1, 2]
      );
    });
test('Firebase refuses a conflicting front save, adopts the higher revision and never overwrites a post-battle roster change', async t => {
  mockTime(t);
  const f = documents('firebase', RULES),
    updated = campaign(RULES, 190);
  delete updated.players['Fixture dawn'];
  updated.teams.dawn.res.gold = 982;
  f.conflict = updated;
  const r = f.join(identity('reich'));
  f.join(identity('dawn'));
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
  const r = f.join(identity('reich')),
    d = f.join(identity('dawn'));
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
  d.tab.click('spectate');
  await elapsed(t, 10000);
  release();
  await flush();
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.records.get(f.state), updated);
  assert.equal(r.tab.game.S.front, undefined);
});
for (const type of ['firebase', 'shared'])
  test(`${type}: a read-only or offline opposite client cannot signal, and mailbox errors never produce a solo attack`, async t => {
    mockTime(t);
    const f = documents(type),
      d = f.join(identity('dawn'));
    d.deny = true;
    const r = f.join(identity('reich'));
    await flush();
    await elapsed(t, 140000);
    assert.equal(f.writes.length, 0);
    assert.equal(r.tab.game.S.front, undefined);
    d.deny = false;
    await elapsed(t, 125000);
    assert.equal(f.writes.length, 1);
    r.blocked = true;
    await elapsed(t, 145000);
    assert.equal(f.writes.length, 1);
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
  f.join(identity('reich'));
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
