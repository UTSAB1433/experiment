// Real Council controls and global targeting on two separate browser profiles. Synthetic post password only.
const assert = require('node:assert/strict');
const {pbkdf2Sync} = require('node:crypto');
module.exports = async function commandRoom({origin, context, fixture, publish, latest, writes, live}) {
  const code = 'command-fixture',
    topic = 'lands-eot/v1/' + code + ':mastery-1/state',
    st = fixture();
  const pw = 'Fixture sign in';
  st.players.Dhruv.pw = pbkdf2Sync('FIXTURESIGNIN', 'eot-v1:Dhruv', 100000, 32, 'sha256').toString('hex');
  st.players['Fixture reich'].role = 'leader';
  st.players.DEB.role = 'soldier';
  st.rev = 550;
  st.terr.TOK.u = {};
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
    await dhruv.locator('#map .node[data-id="TOK"]').dispatchEvent('click');
    await btn(dhruv, 'Attack').tap();
    await dhruv.getByLabel('Launching garrison').selectOption('BER');
    await btn(dhruv, 'All').first().tap();
    await btn(dhruv, 'Launch attack').tap();
    await revision(admin, 552);
    assert.equal(latest.get(topic).terr.TOK.o, 'reich');
    assert.equal(latest.get(topic).players.Dhruv.role, 'soldier');
    assert.equal(await dhruv.locator('[data-act="recruit"]').count(), 0);
    await btn(admin, 'Release attack seat: Dhruv').tap();
    await revision(dhruv, 553);
    assert.equal(await btn(dhruv, 'Attack from here').count(), 0);
    await admin.getByLabel('Game role for Dhruv').selectOption('chief');
    await revision(dhruv, 554);
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
      'PASS: mobile sign-in, Council attack-only appointment and revocation, Berlin → Tokyo, then chief recruitment in the captured province.'
    );
  } finally {
    await Promise.all([cmd.close(), post.close()]);
  }
};
