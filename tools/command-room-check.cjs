// Real Council controls and connected attack routes on two separate browser profiles. Synthetic post password only.
const assert = require('node:assert/strict');
const {pbkdf2Sync} = require('node:crypto');
module.exports = async function commandRoom({origin, context, fixture, publish, latest, writes, live}) {
  const code = 'command-fixture',
    topic = 'lands-eot/v2/' + code + ':mastery-1/state',
    st = fixture();
  const pw = 'Fixture sign in';
  st.players.Dhruv.pw = pbkdf2Sync('FIXTURESIGNIN', 'eot-v1:Dhruv', 100000, 32, 'sha256').toString('hex');
  st.players['Fixture reich'].role = 'leader';
  st.players.DEB.role = 'soldier';
  st.rev = 550;
  st.terr.DEN.u = {};
  st.terr.BER.u = {inf: 25};
  await publish(topic, st);
  const url = origin + '/?room=' + code + '&rules=mastery-1&via=mqtt&relay=emqx';
  const [cmd, post] = await Promise.all([context('reich', true), context('guest', true)]);
  try {
    const [admin, dhruv] = await Promise.all([cmd.newPage(), post.newPage()]);
    await Promise.all([admin.goto(url), dhruv.goto(url)]);
    await Promise.all([live(admin), live(dhruv)]);
    const btn = (p, name) => p.getByRole('button', {name, exact: true});
    const revision = (p, rev) => p.waitForFunction(n => window.__eot.S.rev === n, rev);
    await dhruv.locator('[data-act="join"][data-n="Dhruv"]').tap();
    await dhruv.locator('#pwin').fill(pw);
    await dhruv.locator('#pwin').press('Enter');
    await dhruv.waitForFunction(() =>
      document.querySelector('#hud').textContent.includes('StockpilesThe Reich')
    );
    await btn(admin, 'Council').tap();
    await admin.setViewportSize({width: 320, height: 740});
    assert.ok(await admin.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await btn(admin, 'Assign attack seat: Dhruv').tap();
    await revision(dhruv, 551);
    const selectProvince = id => dhruv.locator(`#map .node[data-id="${id}"]`).dispatchEvent('click');
    const optionIds = picker =>
      picker.locator('option').evaluateAll(options =>
        options
          .map(o => o.value)
          .filter(Boolean)
          .sort()
      );
    await selectProvince('TOK');
    assert.ok(await btn(dhruv, 'Attack').isDisabled(), 'Tokyo has no adjacent Reich garrison');
    await selectProvince('BER');
    await btn(dhruv, 'Attack from here').tap();
    assert.deepEqual(await optionIds(dhruv.getByLabel('Target province')), ['DEN']);
    await btn(dhruv, 'Cancel').tap();
    await selectProvince('DEN');
    await btn(dhruv, 'Attack').tap();
    const sources = dhruv.getByLabel('Launching garrison');
    assert.deepEqual(await optionIds(sources), ['BER', 'OSL', 'RUH']);
    assert.match(await sources.locator('option[value="OSL"]').textContent(), /sea/);
    await sources.selectOption('OSL');
    await dhruv.locator('#modal [data-act="step"][data-u="inf"][data-d="1"]').tap();
    assert.ok(await btn(dhruv, 'Launch attack').isDisabled());
    assert.match(await dhruv.locator('#modal').innerText(), /Crossing water/);
    await btn(dhruv, 'Cancel').tap();
    await btn(dhruv, 'Attack').tap();
    await sources.selectOption('BER');
    await btn(dhruv, 'All').first().tap();
    await btn(dhruv, 'Launch attack').tap();
    await revision(admin, 552);
    assert.equal(latest.get(topic).terr.DEN.o, 'reich');
    assert.deepEqual(latest.get(topic).terr.TOK, structuredClone(st.terr.TOK));
    assert.equal(latest.get(topic).players.Dhruv.role, 'soldier');
    assert.equal(await dhruv.locator('[data-act="recruit"]').count(), 0);
    await btn(admin, 'Release attack seat: Dhruv').tap();
    await revision(dhruv, 553);
    assert.equal(await btn(dhruv, 'Attack from here').count(), 0);
    await admin.getByLabel('Game role for Dhruv').selectOption('chief');
    await revision(dhruv, 554);
    await dhruv.getByRole('button', {name: /Recruit here/}).tap();
    const recruit = dhruv.locator('[data-act="recruit"][data-u="inf"][data-n="1"]');
    assert.ok(await recruit.isEnabled());
    await recruit.tap();
    await revision(admin, 555);
    assert.equal(latest.get(topic).players.Dhruv.role, 'chief');
    assert.deepEqual(
      writes.filter(w => w.topic === topic).map(w => w.rev),
      [551, 552, 553, 554, 555]
    );
    console.log(
      'PASS: mobile sign-in, Council attack-only appointment and revocation, only connected attack choices, blocked infantry sea crossing, Berlin → Copenhagen, then chief recruitment there.'
    );
  } finally {
    await Promise.all([cmd.close(), post.close()]);
  }
};
