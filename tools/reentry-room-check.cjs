// Two independent browser profiles, deliberately different inventories on three real loopback brokers.
const assert = require('node:assert/strict');
module.exports = async function reentry({origin, context, brokers, fixture, publish, writes, live}) {
  const code = 'return-fixture',
    prefix = 'lands-eot/v1/' + code,
    classic = prefix + '/state',
    mastery = prefix + ':mastery-1/state';
  const starting = structuredClone(fixture()),
    chosen = structuredClone(starting),
    other = structuredClone(starting);
  const wall = starting.t;
  const address = origin + '/index.html?room=' + code;
  starting.rev = 920;
  starting.teams.dawn.res.oil = 12003;
  starting.terr.BUC.u = {bd_init: 700};
  chosen.ruleset = other.ruleset = 'mastery-1';
  chosen.rev = 81;
  chosen.teams.dawn.res.oil = 43;
  chosen.terr.BUC.u = {bd_init: 15};
  other.rev = 990;
  other.teams.dawn.res.oil = 50001;
  other.terr.BUC.u = {bd_init: 83};
  await Promise.all([
    publish(classic, starting),
    publish(mastery, chosen, brokers[1]),
    publish(mastery, other, brokers[2])
  ]);
  const [mobile, desktop] = await Promise.all([context('dawn', true), context('dawn')]);
  // Fix time, not sockets/timers: compare exact rendered oil, independently of wall-clock test duration.
  await Promise.all([mobile, desktop].map(c => c.clock.setFixedTime(wall)));
  const broker = brokers[1],
    forward = broker.authorizeForward;
  async function retained(b, key) {
    const records = [];
    for await (const p of b.persistence.createRetainedStream(key)) records.push(JSON.parse(p.payload));
    return records;
  }
  const changes = () => writes.filter(w => w.topic === classic || w.topic === mastery);
  const by = (p, act) => p.locator(`[data-act="${act}"]`).first();
  async function check(p, rev, oil, garrison) {
    await live(p);
    await p.waitForFunction(r => window.__eot.S.rev === r, rev);
    assert.equal(
      await p.locator('#hud .hudcell').filter({hasText: 'Oil'}).locator('.v').textContent(),
      String(oil)
    );
    assert.equal(await p.locator('#map [data-id="BUC"] text').first().textContent(), String(garrison));
    assert.match(await p.locator('#hud').textContent(), /StockpilesBlack Dawn/);
  }
  try {
    const phone = await mobile.newPage(),
      friend = await desktop.newPage();
    await phone.goto(origin + '/');
    const choose = phone.getByRole('button', {name: 'Open Mastery', exact: true});
    await choose.waitFor();
    const button = await choose.boundingBox();
    assert.ok(button && button.y < 844, 'first-visit choice visible without scrolling on a phone');
    await phone.goto(address + '&via=mqtt&relay=emqx');
    await check(phone, 920, 12003, 700);
    await by(phone, 'room').click();
    await by(phone, 'viewcampaign').click();
    await by(phone, 'pickrelay').waitFor(); // a high but divergent revision is not a winner
    assert.equal(await phone.locator('#map .node').count(), 0);
    assert.equal(await phone.locator('#hud .v').count(), 0);
    await phone.locator('[data-act="pickrelay"][data-id="hivemq"]').click();
    await check(phone, 81, 43, 15);
    await by(phone, 'room').click();
    const invite = await phone.locator('#roomlink').inputValue();
    assert.equal(new URL(invite).searchParams.get('relay'), 'hivemq');
    assert.equal(new URL(invite).searchParams.get('rev'), '81');
    await phone.close();
    // Even another device with a different most recent campaign must obey the qualified invite.
    await friend.goto(address + '&via=mqtt&relay=emqx');
    await check(friend, 920, 12003, 700);
    await friend.goto(invite);
    await check(friend, 81, 43, 15);
    assert.deepEqual(changes(), []);
    await friend.locator('#map [data-id="BUC"]').dispatchEvent('click');
    await friend.locator('[data-act="tab"][data-k="troops"]').click();
    await friend.locator('[data-act="recruit"][data-u="bd_rave"][data-n="1"]').click();
    await check(friend, 82, 40, 16);
    // Peers can still answer, but the returning mobile receives no state from the selected broker.
    broker.authorizeForward = function (client, packet) {
      return packet.topic === mastery ? null : forward.call(this, client, packet);
    };
    const returning = await mobile.newPage();
    await returning.goto(origin + '/');
    await returning.waitForFunction(() =>
      document.querySelector('#banner').textContent.includes('Waiting for revision')
    );
    assert.equal(await returning.evaluate(() => window.__eot.S), null);
    assert.equal(await returning.locator('#map .node').count(), 0);
    assert.equal(await returning.locator('#hud .v').count(), 0);
    await returning.evaluate(() => window.__eot.act('contribute', {kind: 'prospect'}));
    broker.authorizeForward = forward;
    await by(returning, 'reconnect').click();
    await check(returning, 82, 40, 16);
    assert.equal(await returning.locator('#tabs .on').textContent(), 'Orders');
    await returning.goto(address);
    await by(returning, 'resumeconfirmed').click();
    await check(returning, 82, 40, 16);
    await returning.goto(address + '&via=mqtt&relay=emqx');
    await check(returning, 920, 12003, 700);
    assert.deepEqual(
      changes(),
      [{topic: mastery, rev: 82}],
      'only the deliberate recruitment wrote a campaign'
    );
    assert.deepEqual(await retained(brokers[0], classic), [starting]);
    assert.deepEqual(await retained(brokers[2], mastery), [other]);
    const [end] = await retained(brokers[1], mastery);
    assert.equal(end.rev, 82);
    assert.equal(end.teams.dawn.res.oil, 40);
    assert.equal(end.terr.BUC.u.bd_rave, 1);
    console.log(
      'PASS: returning phone and independent friend agree on 40 oil and 16 troops in Orders. A missing relay read exposed no cached stock; Classic and the divergent relay stayed unchanged.'
    );
  } finally {
    broker.authorizeForward = forward;
    await Promise.all([mobile, desktop].map(c => c.close()));
  }
};
