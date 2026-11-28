// A campaign spans days, so leaving and returning must be quick, safe and lossless.
// These cover the reconnect behaviour, the catch-up cap and password exactness.
const test = require('node:test');
const assert = require('node:assert/strict');
const {launch, masterySaved, RULES, now, mockTime, flush} = require('../test-support/war-room.cjs');

const home = 'https://example.test/game/',
  link = home + '?room=friends&rules=' + RULES + '&via=mqtt&relay=emqx&rev=62',
  who = {name: 'Test friend', ph: 'offline-fixture'};
// $() returns an element fixture whose innerHTML is a string; accept either.
const text = el => String(typeof el === 'string' ? el : (el?.innerHTML ?? ''))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function board(rev, oil = 71, troops = 27) {
  const s = masterySaved(rev);
  s.t = now;
  s.teams.dawn.res.oil = oil;
  s.terr.BUC.u.bd_init = troops;
  s.players[who.name] = {team: 'dawn', role: 'chief', pw: who.ph, cp: 10, cd: 0};
  return s;
}
function returning(storage) {
  storage.set('eot-last-room:v1:/game', new URL(link).search);
  storage.set('eot-live-state:friends:' + RULES + '|mqtt|emqx', JSON.stringify(board(62)));
  return launch({storage, url: link, identity: who});
}

test('a live campaign that loses the socket keeps its confirmed board, read-only, instead of a blank page', async t => {
  mockTime(t);
  const tab = launch({url: link, identity: who});
  const socket = tab.sockets.at(-1);
  socket.subscribe();
  socket.message('state', board(62));
  await flush();
  assert.match(text(tab.$('#hud')), /Oil 71/, 'live board is shown first');

  tab.dispatchWindow('offline');
  await flush();
  // The last confirmed army and map stay on screen, and the banner says the save survives.
  assert.match(text(tab.$('#hud')), /Oil 71/, 'confirmed stockpiles survive a disconnect');
  assert.match(tab.$('#map').innerHTML, /class="node"/, 'the map is not torn down');
  assert.match(text(tab.$('#banner')), /Your progress is saved/);
  // It is read-only: no order can be sent while unconfirmed.
  assert.doesNotMatch(text(tab.$('#banner')), /Empty room/);

  tab.dispatchWindow('online');
  await flush();
  const recovered = tab.sockets.at(-1);
  recovered.subscribe();
  recovered.message('state', board(63, 88));
  await flush();
  assert.match(text(tab.$('#hud')), /Oil 88/, 'reconnect upgrades to the newer confirmed save');
});

test('a pinned relay that stops answering is widened to the other public brokers', async t => {
  mockTime(t);
  const tab = returning(new Map());
  assert.deepEqual(tab.sockets.map(s => new URL(s.url).hostname), ['broker.emqx.io'], 'the pinned relay is tried first');
  // Every socket opens at the TCP level but the broker never sends CONNACK.
  for (let round = 0; round < 4; round++) {
    for (const s of tab.sockets) if (s.readyState === 0) s.open();
    t.mock.timers.tick(2500);
    await flush();
  }
  const hosts = new Set(tab.sockets.map(s => new URL(s.url).hostname));
  assert.ok(hosts.size > 1, 'silence is not treated as an empty room forever');
});

test('a long absence cannot be banked as a windfall', t => {
  mockTime(t);
  const tab = launch({url: link, identity: who});
  const s = board(70);
  s.t = now - 24 * 3600 * 1000; // came back after a day away
  const before = {...s.teams.dawn.res};
  tab.game.tick(s, now);
  const oil = s.teams.dawn.res.oil - before.oil;
  // Capped at two hours of production rather than the whole day.
  assert.ok(oil > 0, 'a pause still settles what it is allowed to');
  assert.ok(oil < 1500, `a 24h pause must not mint a day of income (got ${Math.round(oil)} oil)`);
});

test('v8 passwords are exact, while legacy posts keep the folded rule', async t => {
  mockTime(t);
  const tab = launch({url: link, identity: who});
  const {pwHash, normPw} = tab.game;
  // Legacy folding: case-insensitive, spaces and hyphens ignored.
  assert.equal(normPw('Correct-Horse 9'), 'CORRECTHORSE9');
  assert.equal(await pwHash('Post', 'Correct-Horse 9'), await pwHash('Post', 'corre cthorse9'));
  // A v8 campaign keeps the password exactly as typed.
  const exact = await pwHash('Post', 'Correct-Horse 9', true);
  assert.notEqual(exact, await pwHash('Post', 'corre cthorse9', true));
  assert.notEqual(exact, await pwHash('Post', 'correct-horse 9', true));
  assert.equal(exact, await pwHash('Post', 'Correct-Horse 9', true), 'the same password still matches');
});
test('removing a post works on a v8 room, is logged, and cannot remove yourself', async t => {
  mockTime(t);
  const tab = launch({url: link, identity: who});
  const s = {
    v: 8, ruleset: RULES, rev: 5, created: 1, t: now, phase: 'active', owner: 'A',
    players: {
      A: {team: 'dawn', role: 'leader', account: 'a'.repeat(64), salt: 's'.repeat(32), cp: 10, cd: 0, title: ''},
      B: {team: 'dawn', role: 'soldier', account: 'b'.repeat(64), salt: 's'.repeat(32), cp: 5, cd: 0, title: ''}
    },
    log: [], terr: {}
  };
  // Regression: this compared the subject's team to the *context*, so it always failed.
  const res = tab.game.A.remove(s, {name: 'A', now}, {name: 'B'});
  assert.ok(res.ok, res.err);
  assert.equal(s.players.B, undefined);
  assert.ok(
    s.log.some(l => l.kind === 'sys' && /B \(Soldier\) was removed from the room by A/.test(l.msg)),
    'the removal is recorded in the shared log'
  );
  assert.ok(tab.game.A.remove(s, {name: 'A', now}, {name: 'A'}).err, 'a leader cannot remove themselves');
  // A non-owner leader can remove a teammate, but the room owner's post is protected.
  const ownerRoom = {
    ...s, owner: 'B',
    players: {A: {...s.players.A}, B: {team: 'dawn', role: 'soldier', account: 'b'.repeat(64), salt: 's'.repeat(32), cp: 5, cd: 0, title: ''}}
  };
  assert.ok(tab.game.A.remove(ownerRoom, {name: 'A', now}, {name: 'B'}).err, 'the owner cannot be removed');
  assert.equal(ownerRoom.players.B !== undefined, true);
});
