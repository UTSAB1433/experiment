const test = require('node:test'),
  assert = require('node:assert/strict');
const {inspect, launch, mockTime, publications, publication} = require('../test-support/war-room.cjs');
const script = inspect(['directoryRecord']);
const hash = 'f'.repeat(64),
  prefix = `lands-eot/profiles/v2/${hash}/`;
const profile = {name: 'Field mouse', salt: 'b'.repeat(32), id: 'a'.repeat(64)};
function lookup(profile, current = () => true) {
  const tab = launch({script, url: 'https://example.test/'});
  assert.equal(tab.sockets.length, 0);
  const promise = tab.game.directoryRecord(hash, profile, current),
    socket = tab.sockets[0];
  socket.subscribe();
  const list = () => publications(socket),
    receive = (sub, msg) => socket.receive(publication(prefix + sub, msg));
  const own = sub => list().find(p => p.topic === prefix + sub).data;
  return {promise, socket, list, receive, own};
}

test('sign-up requires a confirmed subscription, live read and lease echoes and the matching saved profile; only the public card is retained', async t => {
  mockTime(t);
  const d = lookup(profile);
  t.mock.timers.tick(2100);
  assert.deepEqual(
    d.list().map(p => p.topic),
    [prefix + 'read']
  );
  d.receive('read', d.own('read'));
  assert.deepEqual(
    d.list().map(p => p.topic),
    [prefix + 'read', prefix + 'claim']
  );
  d.receive('claim', d.own('claim'));
  const [write] = d.list().filter(p => p.retain);
  assert.equal(write.topic, prefix + 'profile');
  assert.deepEqual(write.data, profile);
  assert.equal(d.socket.readyState, 1);
  d.receive('profile', profile);
  assert.deepEqual(structuredClone(await d.promise), profile);
  assert.equal(d.socket.readyState, 3);
});
test('registered or malformed directory records are never overwritten; reading a profile cannot create a room or a credential', async t => {
  mockTime(t);
  const read = lookup(null);
  read.receive('profile', profile);
  assert.deepEqual(structuredClone(await read.promise), profile);
  assert.ok(read.list().every(p => !p.retain));
  for (const msg of [profile, null, {}, {name: 'Test', id: profile.id, salt: 'short'}]) {
    const d = lookup(profile);
    const checked = assert.rejects(d.promise, /registered|verify/);
    d.receive('profile', msg);
    await checked;
    assert.ok(d.list().every(p => !p.retain));
  }
});
test('silence, lost registration lease, cancelled sign-in and dropped connections all fail closed', async t => {
  mockTime(t);
  for (const reason of ['silence', 'contended', 'cancelled', 'expired', 'dropped']) {
    let active = true;
    const d = lookup(profile, () => active);
    const checked = assert.rejects(d.promise);
    if (reason === 'silence') t.mock.timers.tick(10000);
    else {
      d.receive('read', d.own('read'));
      t.mock.timers.tick(1600);
      if (reason === 'dropped') d.socket.close();
      else {
        if (reason === 'contended') d.receive('claim', 'other');
        if (reason === 'cancelled') active = false;
        if (reason === 'expired') t.mock.timers.tick(1600);
        d.receive('claim', d.own('claim'));
      }
    }
    await checked;
    assert.ok(
      d.list().every(p => !p.retain),
      reason
    );
  }
});
