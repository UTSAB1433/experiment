// Called by mixed-room-smoke: same real loopback brokers and isolated Chromium
// identities. Only browser clocks are accelerated; no manual engine/AI entry point.
const assert = require('node:assert/strict');
module.exports = async function frontRoom({origin, context, brokers, fixture, publish, latest, writes, live}) {
  const code = 'world-front-test',
    topic = 'lands-eot/v1/' + code + '/state',
    url = origin + '/?room=' + code;
  const board = fixture();
  board.rev = 310;
  for (const id of ['PAR', 'DEL', 'BSB']) board.terr[id].o = 'neutral';
  board.terr.MOS.o = 'dawn';
  board.terr.MOS.u = {};
  board.terr.LEN.u = {arm: 100};
  await Promise.all(brokers.map(b => publish(topic, board, b)));
  const changes = () => writes.filter(w => w.topic === topic).map(w => w.rev);
  let wall = Date.now() + 20000;
  async function join(team, mobile = false) {
    const ctx = await context(team, mobile);
    await ctx.clock.install({time: wall - 10000});
    await ctx.clock.pauseAt(wall);
    const p = await ctx.newPage();
    await p.goto(url);
    await live(p);
    return p;
  }
  const [r1, r2, d] = await Promise.all([join('reich'), join('reich'), join('dawn', true)]);
  let pages = [r1, r2, d];
  async function advance(steps) {
    for (let i = 0; i < steps; i++) {
      wall += 5000;
      await Promise.all(pages.map(p => p.clock.fastForward(5000)));
      // Deliver the real WS packets and allow the lock and state echoes to arrive
      // at this virtual instant, rather than fast-forwarding a pending 1.5 s lease.
      await new Promise(r => setTimeout(r, 70));
    }
  }
  const front = p => p.locator('#tabs [data-k="front"]').dispatchEvent('click');
  await Promise.all(pages.map(front));
  assert.deepEqual(changes(), []);
  assert.equal(await d.locator('.power-row').count(), 5);
  await advance(18);
  assert.deepEqual(changes(), [], 'no operation before a full live interval');
  await advance(3);
  assert.deepEqual(changes(), [311]);
  const first = structuredClone(latest.get(topic));
  assert.equal(first.front.turn, 1);
  assert.ok(first.front.drill.USSR);
  assert.equal(first.log[0].recovery, true);
  assert.equal(first.terr.MOS.country, 'USSR');
  assert.equal(first.log[0].kind, 'front');
  for (const p of pages) {
    assert.equal(await p.evaluate(() => window.__eot.S.rev), 311);
    assert.equal(await p.locator('#front-signal').textContent(), 'Both factions online');
  }
  const next = await r1.locator('.dispatch p').textContent();
  assert.equal(next, first.log[0].msg);
  await Promise.all([r1.context().close(), r2.context().close()]);
  pages = [d]; // a lone Dawn officer continues the SAME front clock
  await advance(19);
  assert.deepEqual(changes(), [311, 312]);
  assert.equal(latest.get(topic).log[0].tid, undefined, 'no unrelated raid');
  assert.equal(await d.locator('#front-signal').textContent(), 'Active player online');
  await advance(22); // five minutes since last input; MQTT packets and renders are not activity
  assert.equal(await d.locator('#front-signal').textContent(), 'AFK on this device');
  assert.match(await d.locator('#hud').textContent(), /Interact to return/);
  assert.deepEqual(changes(), [311, 312, 313]);
  const frozen = structuredClone(latest.get(topic));
  await advance(22);
  assert.deepEqual(latest.get(topic), frozen);
  await d.keyboard.press('Shift');
  await advance(18);
  assert.deepEqual(changes(), [311, 312, 313], 'no catch-up from AFK');
  await advance(3);
  assert.deepEqual(changes(), [311, 312, 313, 314]);
  assert.equal(latest.get(topic).front.turn, 4);
  for (const p of pages) await p.clock.resume();
  await d.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
  const issues = await d.evaluate(async () =>
    (
      await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})
    ).violations.map(v => [v.id, v.nodes.map(n => n.target)])
  );
  assert.deepEqual(issues, []);
  for (const width of [320, 390, 768, 1440]) {
    await d.setViewportSize({width, height: 844});
    assert.ok(
      await d.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
      'front overflow at ' + width
    );
  }
  await d.setViewportSize({width: 390, height: 844});
  await d.getByRole('button', {name: 'Locate Japan on the map'}).tap();
  assert.match(await d.locator('#panel').textContent(), /Tokyo/);
  assert.match(await d.locator('#panel').textContent(), /Japan · Rank/);
  await Promise.all(pages.map(p => p.context().close()));
  console.log(
    'PASS: real World front reclaimed Moscow once across three devices; Dawn alone kept training, then AFK froze the front. Keyboard return started a fresh interval (310→314). Mobile locate, 320–1440px layout and axe passed.'
  );
};
