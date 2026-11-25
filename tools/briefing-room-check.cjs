// Two independently signed-in players from lobby-room-check, on a disposable copy of their room.
const assert = require('node:assert/strict');
module.exports = async function briefing({origin, page, peer, state, publish, latest, writes}) {
  const room = 'board-guide-test',
    topic = `lands-eot/v1/${room}:mastery-1/state`,
    url = `${origin}/?room=${room}&rules=mastery-1&via=mqtt&relay=emqx&rev=50`;
  const st = structuredClone(state);
  st.rev = 50;
  st.teams.dawn.res.gold = st.teams.reich.res.gold = 5000;
  st.t = Date.now();
  const revision = (p, n) => p.waitForFunction(n => window.__eot.S?.rev === n, n);
  const nav = (p, k) => p.locator(`#tabs [data-k="${k}"]`).click();
  const focused = el => el.evaluate(e => e === document.activeElement);
  await publish(topic, st);
  await Promise.all([page, peer].map(p => p.goto(url)));
  await Promise.all([page, peer].map(p => revision(p, 50)));
  // Keep the full extent on a wide, short map, not merely the top slice.
  await page.setViewportSize({width: 1440, height: 500});
  await page.locator('.mapnav [data-r="world"]').click();
  assert.equal(await page.locator('#map').getAttribute('viewBox'), '0 0 5600 2048');
  await page.getByRole('button', {name: 'Zoom out', exact: true}).click();
  assert.equal(await page.locator('#map').getAttribute('viewBox'), '0 0 5600 2048');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width, height: 744});
    assert.ok(
      await page
        .locator('#tabs')
        .evaluate(e => e.scrollWidth <= e.clientWidth + 1 && [...e.children].every(b => b.offsetWidth > 0)),
      `clipped command sections at ${width}px`
    );
  }
  await page.locator('.mapnav [data-r="europe"]').click();
  const pixels = await page.locator('#map').evaluate(svg => {
    const r = svg.getBoundingClientRect(),
      cx = r.x + r.width / 2,
      cy = r.y + r.height / 2;
    const send = (type, id, offset) =>
      svg.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          clientX: cx + offset,
          clientY: cy
        })
      );
    send('pointerdown', 1, -20);
    send('pointerdown', 2, 20);
    send('pointermove', 2, 40);
    send('pointerup', 2, 40);
    const v = svg.viewBox.baseVal,
      before = v.x,
      scale = Math.max(v.width / r.width, v.height / r.height);
    send('pointermove', 1, -14);
    send('pointerup', 1, -14);
    return (before - svg.viewBox.baseVal.x) / scale;
  });
  assert.ok(
    Math.abs(pixels - 6) < 0.05,
    `lifting a finger during pinch jumped ${pixels} px instead of panning 6`
  );
  await page.locator('#board-jump [data-to="desk"]').tap();
  assert.match(await page.locator('#briefing-title').innerText(), /lead your faction/i);
  await page.getByRole('button', {name: 'Open Nigeria orders'}).tap();
  assert.equal(await page.locator('#province-name').textContent(), 'Nigeria');
  await page.getByRole('button', {name: 'Directory', exact: true}).tap();
  await page.getByLabel('Search countries and capitals').fill('Tokyo');
  await page.locator('#natdir [data-id="TOK"]').tap();
  const annex = page.locator('[data-act="annex"]');
  assert.ok(await annex.isDisabled());
  assert.match(await page.locator('#annex-note').innerText(), /neighbor/);
  await page.getByRole('button', {name: 'Locate', exact: true}).tap();
  const tokyo = page.locator('#map .node[data-id="TOK"]');
  assert.ok(await focused(tokyo));
  assert.ok(
    await tokyo.evaluate(e => {
      const r = e.getBoundingClientRect();
      return r.y >= 0 && r.bottom <= innerHeight && r.x >= 0 && r.right <= innerWidth;
    }),
    'Locate did not bring the selected map point into view'
  );
  await nav(page, 'front');
  const summary = page.locator('#front-countries');
  await summary.click();
  await tokyo.focus();
  await peer.locator('#map .node[data-id="DEN"]').press('Enter');
  await peer.locator('[data-act="annex"]').click(); // eligibility AND an actual change to map geometry/ownership
  await revision(page, 51);
  assert.equal(latest.get(topic).terr.DEN.o, 'reich');
  assert.ok(await focused(tokyo), 'a peer order stole map focus');
  assert.ok(await summary.evaluate(e => e.parentElement.open), 'live refresh closed the country list');
  await nav(page, 'dip');
  const give = page.getByLabel('Amount to give'),
    send = page.getByRole('button', {name: 'Send offer'});
  for (const [v, why] of [
    ['0.25', /whole number/],
    ['1000000', /not enough/i]
  ]) {
    await give.fill(v);
    assert.ok(await send.isDisabled());
    assert.match(await page.locator('#trade-note').innerText(), why);
  }
  await give.fill('7');
  await page.getByLabel('Resource to receive').selectOption('oil');
  assert.ok(await send.isDisabled());
  assert.match(await page.locator('#trade-note').innerText(), /different resources/);
  await page.getByLabel('Resource to receive').selectOption('steel');
  await page.getByLabel('Amount to receive').fill('100000');
  await send.tap();
  await revision(peer, 52);
  assert.deepEqual(latest.get(topic).props.at(-1).give, {r: 'oil', n: 7});
  await nav(peer, 'dip');
  assert.ok(await peer.getByRole('button', {name: 'Accept'}).isDisabled());
  assert.match(await peer.locator('#diplomacy-proposals').innerText(), /cannot cover its side/);
  await peer.getByRole('button', {name: 'Reject'}).click();
  await revision(page, 53);
  assert.equal(latest.get(topic).props.at(-1).open, false);
  await nav(peer, 'council');
  await peer.getByRole('button', {name: 'Scavenge +5 Steel'}).click();
  await revision(page, 54);
  await peer.waitForFunction(() =>
    document.querySelector('#duty-note')?.textContent.startsWith('Next field duty in')
  );
  assert.ok(await peer.getByRole('button', {name: 'Prospect +4 Oil'}).isDisabled());
  assert.deepEqual(
    writes.filter(w => w.topic === topic).map(w => w.rev),
    [51, 52, 53, 54]
  );
  console.log(
    'PASS: role briefing and phone shortcuts, all eight sections fit at 320–1440px, visible Locate target, pinch-to-pan, border-gated annex, stable map focus and country disclosure on peer orders, integer quotes and affordable trade responses.'
  );
};
