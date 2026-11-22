// No hosted data: replay cold starts, partitions and out-of-order reads against the actual client.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  launch,
  saved,
  masterySaved,
  legacySaved,
  RULES,
  now,
  mockTime,
  flush,
  finishOrder,
  checkReadOnly,
  enlist,
  publications
} = require('../test-support/war-room.cjs');
const home = 'https://example.test/game/',
  legacyLink = home + '?room=friends&via=mqtt&relay=emqx&rev=900',
  primary = home + '?room=friends&rules=mastery-1&via=mqtt&relay=emqx',
  mastery = home + 'index.html?room=friends&rules=' + RULES + '&via=mqtt&relay=hivemq';
const who = {name: 'Test friend', ph: 'offline-fixture'};
function board(make, rev, oil, troops) {
  const s = make(rev);
  s.t = now;
  s.teams.dawn.res.oil = oil;
  s.terr.BUC.u.bd_init = troops;
  s.players[who.name] = {team: 'dawn', role: 'chief', pw: who.ph, cp: 10, cd: 0};
  return s;
}
function accept(tab, state) {
  const socket = tab.sockets.at(-1);
  socket.subscribe();
  socket.message('state', state);
  return socket;
}
const text = el => el.innerHTML.replace(/<[^>]+>/g, '');
function noBoard(tab) {
  assert.equal(tab.game.S, null);
  assert.doesNotMatch(tab.$('#hud').innerHTML, /Oil|Your CP/);
  assert.doesNotMatch(tab.$('#map').innerHTML, /class="node"/);
  assert.doesNotMatch(tab.$('#panel').innerHTML, /data-act="recruit"/);
}
function checkBoard(tab, st) {
  assert.deepEqual(structuredClone(tab.game.S), structuredClone(st));
  assert.match(text(tab.$('#hud')), new RegExp(`StockpilesBlack Dawn.*Oil${st.teams.dawn.res.oil}\\+`));
  assert.equal(tab.game.S.terr.BUC.u.bd_init, st.terr.BUC.u.bd_init);
}

test('old 12k-oil Classic and stale Mastery caches never flash; the home shortcut resumes the confirmed army, and an archived link never plays Classic', t => {
  mockTime(t);
  const old = board(legacySaved, 800, 12765, 802),
    real = board(masterySaved, 62, 71, 27),
    stale = board(masterySaved, 33, 18000, 903);
  delete old.ruleset;
  old.t = stale.t = now - 12 * 3600000;
  const storage = new Map([
    ['eot-live-state:friends', JSON.stringify(old)],
    ['eot-live-state:friends:' + RULES + '|mqtt', JSON.stringify(stale)]
  ]);
  const first = launch({storage, url: mastery + '&unrelated=omit#private', identity: who});
  noBoard(first);
  accept(first, real);
  checkBoard(first, real);
  const invite = new URL(first.location.href);
  assert.equal(invite.searchParams.get('relay'), 'hivemq');
  assert.equal(invite.searchParams.get('rev'), '62');
  assert.ok(!invite.searchParams.has('unrelated') && !invite.hash);
  const returning = launch({storage, url: home, identity: who});
  noBoard(returning);
  assert.equal(returning.sockets.length, 0);
  returning.click('resume');
  assert.deepEqual(
    returning.sockets.map(s => new URL(s.url).hostname),
    ['broker.hivemq.com']
  );
  const newer = board(masterySaved, 63, 38, 44);
  accept(returning, newer);
  checkBoard(returning, newer);
  const friend = launch({
    url: invite.href,
    identity: who,
    storedFb: 'https://other.firebaseio.com',
    claude: {use: () => assert.fail('pinned MQTT used a different store')}
  });
  accept(friend, newer);
  checkBoard(friend, newer);
  returning.click('tab', {k: 'tech'});
  returning.click('researchbranch', {k: 'mastery'});
  checkBoard(returning, newer);
  const ambiguous = launch({storage, url: home + '?room=friends'});
  noBoard(ambiguous);
  assert.match(ambiguous.sockets[0].url, /hivemq/);
  accept(ambiguous, newer);
  checkBoard(ambiguous, newer);
  const back = launch({storage, url: legacyLink, identity: who});
  noBoard(back);
  assert.match(back.sockets[0].url, /hivemq/);
  accept(back, newer);
  checkBoard(back, newer);
  // Explicit qualified invites still win, without a late tab stealing the home shortcut.
  const other = launch({storage, url: primary, identity: who});
  accept(other, newer);
  checkBoard(other, newer);
  const later = board(masterySaved, 64, 20, 21);
  returning.sockets[0].message('state', later);
  const nextHome = launch({storage, url: home});
  nextHome.click('resume');
  assert.match(nextHome.sockets[0].url, /emqx/);
  for (const tab of [first, returning, friend, ambiguous, back, nextHome]) checkReadOnly(tab);
  assert.equal(storage.get('eot-live-state:friends'), JSON.stringify(old));
  assert.equal(storage.get('eot-live-state:friends:' + RULES + '|mqtt'), JSON.stringify(stale));
});

test('no remembered room or a malformed preference opens the room chooser; unknown invite addresses fail closed, without touching the last good route', t => {
  mockTime(t);
  const storage = new Map([['eot-last-room:v1:/game', '?room=wrong&via=ftp&rev=550']]);
  const empty = launch({storage, url: home});
  noBoard(empty);
  assert.equal(empty.sockets.length, 0);
  assert.match(empty.$('#entry').innerHTML, /Join with a code/);
  empty.$('#home-code').value = 'friends';
  empty.dispatch('submit', {target: {dataset: {form: 'joincode'}}, preventDefault() {}});
  assert.equal(empty.sockets.length, 3);
  assert.doesNotMatch(text(empty.$('#panel')), /Which campaign|Classic/);
  const [a, b, c] = empty.sockets;
  b.onerror();
  c.onerror();
  a.subscribe();
  const st = board(masterySaved, 20, 6, 7);
  a.message('state', st);
  empty.click('pickrelay', {id: 'emqx'});
  accept(empty, st);
  const last = storage.get('eot-last-room:v1:/game');
  assert.match(last, /rules=mastery-1/);
  for (const q of [
    'rules=future',
    'relay=other',
    'via=firebase',
    'via=shared&relay=emqx',
    'rev=-1',
    'fb=https://test.invalid/',
    'room=other',
    'room=%20',
    'via=mqtt&via=shared'
  ]) {
    const tab = launch({storage, url: home + '?room=invalid&' + q});
    noBoard(tab);
    assert.equal(tab.sockets.length, 0);
    checkReadOnly(tab);
  }
  const fresh = launch({storage: new Map([['eot-last-room:v1:/other', last]]), url: home});
  assert.equal(fresh.sockets.length, 0);
  assert.equal(storage.get('eot-last-room:v1:/game'), last);
  checkReadOnly(empty);
});

for (const [name, url, make] of [
  ['Mastery primary', primary, saved],
  ['Mastery', mastery, masterySaved]
])
  test(`${name}: an existing invite cannot initialize a missing record, show an earlier revision or use a peer as a write base`, async t => {
    mockTime(t);
    const tab = launch({url: url + '&rev=220', identity: who}),
      socket = tab.sockets[0];
    socket.subscribe();
    const req = publications(socket).find(p => p.data.type === 'req');
    socket.message('sync', req.data);
    t.mock.timers.tick(650);
    noBoard(tab);
    assert.match(text(tab.$('#banner')), /revision 220/i);
    for (const st of [board(make, 219, 14500, 901), board(make, 220, 90, 11)]) {
      socket.message('sync', {type: 'res', state: st});
      noBoard(tab);
      socket.message('state', st);
      if (st.rev === 220) {
        checkBoard(tab, st);
        break;
      }
      await finishOrder(t, tab.game.act('enlist', enlist));
      noBoard(tab);
    }
    socket.close();
    const frozen = structuredClone(tab.game.S);
    t.mock.timers.tick(800);
    assert.ok(tab.sockets.every(s => s.url === socket.url));
    await finishOrder(t, tab.game.act('enlist', enlist));
    assert.deepEqual(structuredClone(tab.game.S), frozen);
    assert.match(text(tab.$('#hud')), /Oil90Last save/);
    checkReadOnly(tab);
  });

test('same-revision conflicting troops are quarantined, both snapshots remain exportable, and a newer authoritative revision unblocks orders', async t => {
  mockTime(t);
  const tab = launch({url: primary, identity: who}),
    consistent = board(saved, 91, 61, 40),
    socket = accept(tab, consistent);
  const fork = structuredClone(consistent);
  fork.terr.BUC.u.bd_init = 4;
  fork.teams.dawn.res.oil = 700;
  socket.message('state', fork);
  assert.match(text(tab.$('#banner')), /disagree at revision 91/);
  assert.deepEqual(structuredClone(tab.game.S), structuredClone(consistent));
  assert.equal(
    JSON.parse(tab.storage.get('eot-live-state:friends:mastery-1|mqtt|emqx')).terr.BUC.u.bd_init,
    40
  );
  tab.click('room');
  assert.match(tab.$('#modal').innerHTML, /exportconflict/);
  assert.match(tab.$('#modal').innerHTML, /exportstate/);
  await finishOrder(t, tab.game.act('contribute', {kind: 'drill'}));
  checkReadOnly(tab);
  fork.rev++;
  socket.message('state', fork);
  checkBoard(tab, fork);
});

test('a half-open socket stops being live; sleep, online and retry always revalidate the original relay without replaying orders', async t => {
  mockTime(t);
  const tab = launch({url: mastery, identity: who}),
    s = board(masterySaved, 65, 201, 11),
    socket = accept(tab, s);
  socket.dropPong = true;
  t.mock.timers.tick(20000);
  t.mock.timers.tick(10000);
  assert.match(text(tab.$('#me')), /Offline/);
  await finishOrder(t, tab.game.act('enlist', enlist));
  checkReadOnly(tab);
  tab.dispatchWindow('online');
  const next = board(masterySaved, 71, 36, 39);
  accept(tab, next);
  tab.document.hidden = true;
  tab.dispatch('visibilitychange');
  t.mock.timers.tick(20000);
  tab.document.hidden = false;
  tab.dispatch('visibilitychange');
  assert.doesNotMatch(text(tab.$('#me')), /Live/);
  const after = board(masterySaved, 72, 83, 36);
  accept(tab, after);
  assert.equal(tab.game.S.rev, 72);
  assert.equal(tab.game.S.terr.BUC.u.bd_init, 36);
  assert.ok(tab.sockets.every(s => s.url === socket.url));
  checkReadOnly(tab);
});

test('Firebase is pinned and backend-scoped: child puts and patches refetch the full army; out-of-order REST reads never win', async t => {
  mockTime(t);
  const storage = new Map(),
    unrelated = board(saved, 500, 12099, 888);
  unrelated.created--;
  storage.set('eot-live-state:friends', JSON.stringify(unrelated));
  const requests = [],
    listeners = {},
    EventSource = class {
      addEventListener(k, fn) {
        listeners[k] = fn;
      }
      close() {}
    };
  const fetch = (url, o) => new Promise(resolve => requests.push({resolve, url, o}));
  const url = home + '?room=friends&via=firebase&fb=https://fixture.firebaseio.com';
  const tab = launch({
    url,
    storage,
    identity: who,
    EventSource,
    fetch,
    claude: {
      use() {
        assert.fail('pinned Firebase used shared storage');
      }
    }
  });
  const answer = (i, st) =>
    requests[i].resolve({ok: true, json: async () => structuredClone(st), headers: {get: () => '"fixture"'}});
  const push = (kind, path, data) => listeners[kind]({data: JSON.stringify({path, data})});
  const newer = board(saved, 31, 110, 48);
  noBoard(tab);
  push('put', '/', newer);
  checkBoard(tab, newer);
  answer(0, null);
  await flush();
  checkBoard(tab, newer);
  push('patch', '/teams/dawn/res', {oil: 22});
  push('put', '/terr/BUC/u/bd_init', 59);
  assert.equal(requests.length, 3);
  assert.doesNotMatch(text(tab.$('#me')), /Live/);
  const latest = board(saved, 33, 22, 59);
  answer(2, latest);
  await flush();
  answer(1, board(saved, 32, 45, 52));
  await flush();
  checkBoard(tab, latest);
  assert.equal(storage.get('eot-live-state:friends'), JSON.stringify(unrelated));
  assert.equal(
    JSON.parse(storage.get('eot-live-state:friends:mastery-1|https://fixture.firebaseio.com')).rev,
    33
  );
  assert.ok(requests.every(r => !r.o.method));
  checkReadOnly(tab);
});

test('partial legacy discovery cannot create a competing save on an empty primary when another broker cannot be checked', async t => {
  mockTime(t);
  const tab = launch(),
    [a, b, c] = tab.sockets;
  b.onerror();
  c.onerror();
  a.subscribe();
  const req = publications(a).find(p => p.data.type === 'req');
  a.message('sync', req.data);
  t.mock.timers.tick(650);
  noBoard(tab);
  assert.match(text(tab.$('#banner')), /discovery is incomplete/);
  await finishOrder(t, tab.game.act('enlist', enlist));
  checkReadOnly(tab);
});

test('an old code-only bookmark with a pre-update Mastery backup cannot start a fresh army', t => {
  mockTime(t);
  const key = 'eot-live-state:friends:' + RULES + '|mqtt',
    raw = JSON.stringify(board(masterySaved, 146, 3, 92)),
    storage = new Map([[key, raw]]);
  const tab = launch({url: home + '?room=friends', storage});
  noBoard(tab);
  assert.equal(tab.sockets.length, 3);
  for (const socket of tab.sockets) {
    socket.subscribe();
    socket.message('sync', publications(socket).find(m => m.data.type === 'req').data);
  }
  t.mock.timers.tick(650);
  assert.match(text(tab.$('#banner')), /revision 146/);
  assert.equal(storage.get(key), raw);
  noBoard(tab);
  checkReadOnly(tab);
});

test('confirmed-empty starting numbers disappear on loss; a peer revision still blocks a stale pinned relay after redial', async t => {
  mockTime(t);
  const tab = launch({url: primary}),
    socket = tab.sockets[0];
  socket.subscribe();
  socket.message('sync', publications(socket).find(p => p.data.type === 'req').data);
  t.mock.timers.tick(650);
  assert.match(text(tab.$('#me')), /Empty room/);
  assert.ok(tab.game.S);
  tab.click('room');
  assert.match(tab.$('#modal').innerHTML, /data-act="copyroom" disabled/);
  socket.message('sync', {type: 'res', state: board(saved, 93, 4, 19)});
  noBoard(tab);
  socket.close();
  tab.dispatchWindow('online');
  const next = accept(tab, board(saved, 44, 14100, 49));
  noBoard(tab);
  await finishOrder(t, tab.game.act('enlist', enlist));
  checkReadOnly(tab);
  next.message('state', board(saved, 93, 4, 19));
  assert.equal(tab.game.S.rev, 93);
  checkReadOnly(tab);
});

test('a newer on-disk backup written while acquiring the lock prevents a stale write, even before the storage event is delivered', async t => {
  mockTime(t);
  const tab = launch({url: primary, identity: who}),
    old = board(saved, 45, 70, 7),
    current = board(saved, 46, 6, 14),
    socket = accept(tab, old);
  const key = 'eot-live-state:friends:mastery-1|mqtt|emqx';
  const order = tab.game.act('contribute', {kind: 'prospect'});
  tab.storage.set(key, JSON.stringify(current));
  await finishOrder(t, order);
  checkReadOnly(tab);
  assert.equal(tab.game.S.rev, 45);
  assert.equal(JSON.parse(tab.storage.get(key)).rev, 46);
  const next = accept(tab, old);
  assert.doesNotMatch(text(tab.$('#me')), /Live/);
  next.message('state', current);
  assert.equal(tab.game.S.rev, 46);
  const newer = board(saved, 47, 50, 20),
    raw = JSON.stringify(newer);
  tab.storage.set(key, raw);
  tab.dispatchWindow('storage', {key, newValue: raw});
  assert.equal(tab.game.S.rev, 46);
  assert.match(text(tab.$('#banner')), /Another tab has revision 47/);
  assert.equal(next.readyState, 1, 'wait for the broker on the same connection');
  next.message('state', newer);
  assert.equal(tab.game.S.rev, 47);
  checkReadOnly(tab);
});

test('offline followed by a fast reconnect cannot replay an outstanding lock request or project income from the disconnected board', async t => {
  mockTime(t);
  const tab = launch({url: primary, identity: who}),
    s = board(saved, 78, 30, 11),
    socket = accept(tab, s);
  t.mock.timers.tick(1500);
  socket.noEcho = true;
  const order = tab.game.act('contribute', {kind: 'prospect'});
  await flush();
  assert.ok(publications(socket).some(p => p.topic.endsWith('/lock')));
  tab.dispatchWindow('offline');
  t.mock.timers.tick(450);
  assert.match(text(tab.$('#hud')), /Oil30Last save/);
  tab.dispatchWindow('online');
  const next = accept(tab, board(saved, 79, 9, 44));
  await finishOrder(t, order);
  assert.equal(tab.game.S.rev, 79);
  checkReadOnly(tab);
  assert.ok(!publications(next).some(p => p.topic.endsWith('/lock')));
});

test('Firebase omission of null and empty children at the same revision is not a fork; a changed amount at that revision is', async t => {
  mockTime(t);
  const key = 'eot-live-state:friends:mastery-1|https://fixture.firebaseio.com',
    st = board(saved, 65, 38, 29);
  st.origin = null;
  st.terr.BER.u = {};
  const raw = JSON.stringify(st),
    storage = new Map([[key, raw]]);
  const compact = structuredClone(st);
  for (const k of ['pact', 'win', 'dom', 'treach', 'intel', 'props', 'origin']) delete compact[k];
  delete compact.terr.BER.u;
  let onput;
  const EventSource = class {
    addEventListener(k, cb) {
      if (k === 'put') onput = data => cb({data: JSON.stringify({path: '/', data})});
    }
    close() {}
  };
  const tab = launch({
    storage,
    identity: who,
    url: home + '?room=friends&fb=https://fixture.firebaseio.com',
    EventSource,
    fetch: () => new Promise(() => {})
  });
  onput(compact);
  assert.match(text(tab.$('#me')), /Live/);
  assert.equal(tab.game.S.teams.dawn.res.oil, 38);
  assert.equal(storage.get(key), raw, 'comparison does not rewrite the backup');
  compact.teams.dawn.res.oil = 38000;
  onput(compact);
  assert.match(text(tab.$('#banner')), /disagree at revision 65/);
  await tab.game.act('enlist', enlist);
  assert.equal(tab.game.S.teams.dawn.res.oil, 38);
  assert.equal(storage.get(key), raw);
  checkReadOnly(tab);
});

test('an in-flight Firebase PUT that finishes after switching databases cannot repaint, unlock or save into the new room', async t => {
  mockTime(t);
  const src = board(saved, 80, 12000, 33),
    dst = board(masterySaved, 10, 52, 14),
    writes = [];
  const response = v => ({ok: true, json: async () => structuredClone(v), headers: {get: () => '"etag"'}});
  let ack,
    pendingLock,
    blockMaster = false;
  async function fetch(url, o = {}) {
    const master = url.startsWith('https://second.firebaseio.com/');
    if (url.endsWith('/lock.json')) {
      if (master && blockMaster && !o.method)
        return new Promise(resolve => {
          pendingLock = () => resolve(response(null));
        });
      return response(null);
    }
    if (o.method === 'PUT') {
      writes.push({url, data: JSON.parse(o.body)});
      return new Promise(resolve => {
        ack = () => resolve(response(writes[0].data));
      });
    }
    return response(master ? dst : src);
  }
  const tab = launch({url: home + '?room=friends&fb=https://fixture.firebaseio.com', identity: who, fetch});
  await flush();
  checkBoard(tab, src);
  const pending = tab.game.act('contribute', {kind: 'prospect'});
  await flush();
  assert.equal(writes.length, 1);
  // An explicit change of source while awaiting the first response, then a fresh invite on the pinned DB.
  tab.$('#fbin').value = 'https://second.firebaseio.com';
  tab.click('savefb');
  await flush();
  checkBoard(tab, dst);
  blockMaster = true;
  const ordering = tab.game.act('contribute', {kind: 'prospect'});
  await flush();
  assert.ok(pendingLock);
  ack();
  await pending;
  checkBoard(tab, dst);
  assert.match(text(tab.$('#hud')), /Sending orders/);
  tab.click('clearfb');
  pendingLock();
  await ordering;
  noBoard(tab);
  assert.equal(writes.length, 1);
  assert.ok(
    writes[0].url.startsWith('https://fixture.firebaseio.com/') && writes[0].url.includes('mastery-1')
  );
  assert.equal(
    JSON.parse(tab.storage.get('eot-live-state:friends:' + RULES + '|https://second.firebaseio.com')).rev,
    10
  );
});

test('shared workspace: reject cache-only and pending local snapshots, keep the live winner during a delayed acknowledgement, ignore the old subscription after wake', async t => {
  mockTime(t);
  let st = board(saved, 10, 85, 18),
    finish,
    proposed;
  const listeners = [];
  const snapshot = (s, metadata = {}) => ({exists: !!s, data: () => structuredClone(s), metadata});
  const state = {
    onSnapshot(cb) {
      listeners.push(cb);
      return () => {};
    },
    get: async () => snapshot(st),
    set(v) {
      proposed = structuredClone(v);
      return new Promise(resolve => {
        finish = resolve;
      });
    }
  };
  const doc = k => (k === 'game-friends:mastery-1/lock' ? {acquire: async () => ({acquired: true})} : state);
  const tab = launch({
    url: home + '?room=friends&via=shared',
    claude: {use: async () => ({doc})},
    identity: who
  });
  await flush();
  listeners[0](snapshot(st, {fromCache: true}));
  noBoard(tab);
  listeners[0](snapshot(null, {hasPendingWrites: true}));
  noBoard(tab);
  listeners[0](snapshot(st));
  checkBoard(tab, st);
  const order = tab.game.act('contribute', {kind: 'prospect'});
  await flush();
  assert.equal(proposed.rev, 11);
  st = board(saved, 11, 3, 81);
  listeners[0](snapshot(st));
  finish();
  await order;
  checkBoard(tab, st);
  const key = 'eot-live-state:friends:mastery-1|shared';
  assert.equal(JSON.parse(tab.storage.get(key)).teams.dawn.res.oil, 3);
  tab.dispatchWindow('online');
  listeners[0](snapshot(board(saved, 90, 2929, 827)));
  assert.equal(tab.game.S.rev, 11);
  const next = board(saved, 12, 5, 9);
  listeners[1](snapshot(next));
  checkBoard(tab, next);
});

test('a legacy Classic bookmark resumes its last confirmed Firebase source, not another available workspace or MQTT; the remembered floor survives a missing backup', async t => {
  mockTime(t);
  const storage = new Map(),
    fb = 'https://fixture.firebaseio.com',
    queries = [];
  let st = board(saved, 99, 12, 18);
  // These disposable GETs never write. Following a Firebase invite need not have set the old Firebase preference.
  const fetch = async (url, o = {}) => {
    queries.push({url, o});
    return {ok: true, json: async () => structuredClone(st)};
  };
  const first = launch({url: home + '?room=friends&via=firebase&fb=' + fb, storage, identity: who, fetch});
  await flush();
  checkBoard(first, st);
  storage.delete('eot-live-state:friends:mastery-1|' + fb);
  st = board(saved, 14, 17500, 87);
  const back = launch({
    url: home + '?room=friends',
    storage,
    fetch,
    claude: {
      use() {
        assert.fail('used another campaign');
      }
    }
  });
  await flush();
  noBoard(back);
  assert.equal(back.sockets.length, 0);
  assert.match(text(back.$('#banner')), /revision 99/);
  st = board(saved, 100, 60, 27);
  t.mock.timers.tick(2500);
  await flush();
  assert.equal(back.game.S.rev, 100);
  assert.ok(
    queries.every(r => !r.o.method && r.url.startsWith(fb + '/eot-rooms/friends%3Amastery-1/state.json'))
  );
  checkReadOnly(first);
  checkReadOnly(back);
});

test('a failing workspace capability on a legacy link is not permission to open a different campaign', async t => {
  mockTime(t);
  let attempts = 0;
  const tab = launch({
    url: home + '?room=friends',
    claude: {
      use: async () => {
        attempts++;
        throw Error('Unavailable');
      }
    }
  });
  await flush();
  noBoard(tab);
  assert.match(text(tab.$('#panel')), /original shared workspace/);
  tab.click('reconnect');
  await flush();
  assert.equal(attempts, 2);
  assert.equal(tab.sockets.length, 0);
  checkReadOnly(tab);
});
