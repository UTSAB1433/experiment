// Desktop diplomat, mobile chief and signing-in guest on separate profiles and one disposable relay.
const assert = require('node:assert/strict');
const {pbkdf2Sync} = require('node:crypto');
module.exports = async function interfaceRoom({
  origin,
  context,
  fixture,
  publish,
  latest,
  writes,
  live,
  rev,
  factory
}) {
  const room = 'interface-check',
    topic = `lands-eot/v2/${room}:mastery-1/state`,
    st = fixture();
  const url = `${origin}/?room=${room}&rules=mastery-1&via=mqtt&relay=emqx`;
  const name = 'Interface cadet',
    password = 'Interface fixture';
  st.players[name] = {
    team: 'dawn',
    role: 'soldier',
    cd: 0,
    title: 'QA',
    cp: 10,
    pw: pbkdf2Sync('INTERFACEFIXTURE', 'eot-v1:' + name, 100000, 32, 'sha256').toString('hex')
  };
  st.players['Fixture dawn'].role = 'diplomat';
  st.teams.reich.tech.air = 4;
  st.terr.PER.o = st.terr.DEN.o = 'reich';
  st.terr.SWE.o = 'dawn';
  st.terr.NIG.u.bd_ocov = 1;
  st.pact = {until: Date.now() + 3600000, mins: 60};
  await publish(topic, st);
  const contexts = await Promise.all([context('reich', true), context('dawn'), context('guest', true)]);
  const [chief, dip, guest] = await Promise.all(contexts.map(c => c.newPage()));
  const tab = (p, k) => p.locator(`#tabs [data-k="${k}"]`).click();
  const select = (p, id) => p.locator(`#map .node[data-id="${id}"]`).press('Enter');
  const focused = node => node.evaluate(el => document.activeElement === el);
  const roomSaves = () => writes.filter(w => w.topic === topic).map(w => w.rev);
  try {
    await Promise.all([chief, dip, guest].map(p => p.goto(url)));
    await Promise.all([chief, dip, guest].map(live));
    // Named map presets really move the camera, not just the region highlight.
    const box = () => chief.locator('#map').getAttribute('viewBox'),
      world = await box(),
      boxes = [];
    for (const region of ['americas', 'europe', 'africa', 'mideast', 'asia', 'oceania', 'world']) {
      await chief.locator(`.mapnav [data-r="${region}"]`).tap();
      boxes.push(await box());
      assert.equal(await chief.locator('.mapnav [aria-pressed="true"]').getAttribute('data-r'), region);
    }
    assert.equal(new Set(boxes).size, 7);
    assert.equal(await box(), world);
    await chief.getByRole('button', {name: 'Zoom in', exact: true}).tap();
    assert.equal(await chief.locator('.mapnav .on').count(), 0);
    const cities = chief.locator('#natdir button[data-act="goto"]');
    assert.deepEqual(
      await cities.evaluateAll(els =>
        els
          .filter(e => e.tabIndex >= 0)
          .map(e => e.dataset.id)
          .sort()
      ),
      Object.keys(st.terr).sort()
    );
    for (const region of ['Europe', 'Africa']) {
      await chief.locator(`#natdir [data-r="${region}"]`).tap();
      assert.equal(
        await chief.locator('#natdir [data-id="ALG"],#natdir [data-id="TUN"]').count(),
        region === 'Africa' ? 2 : 0
      );
    }
    await chief.locator('#natdir [data-r="all"]').tap();
    await chief.getByLabel('Search countries and capitals').fill('San Francisco');
    assert.equal(await cities.count(), 1);
    await cities.press('Enter');
    assert.equal(await chief.locator('#province-name').textContent(), 'San Francisco');
    assert.ok(await focused(chief.locator('#province-name')));
    await select(chief, 'BER');
    const move = chief.getByRole('button', {name: 'Move units', exact: true}),
      disclosure = chief.locator('[data-act="recruitlist"]');
    const offset = await move.evaluate(el =>
      Math.round(
        el.getBoundingClientRect().top - document.querySelector('#panel').getBoundingClientRect().top
      )
    );
    assert.ok(offset >= 0 && offset < 400, `Move in Orders was ${offset}px down at 390px width`);
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
    assert.equal(await chief.locator('[data-act="recruit"]').count(), 0);
    await disclosure.tap();
    assert.equal(await chief.locator('[data-act="recruit"]').count(), 77);
    await disclosure.tap();
    await tab(chief, 'troops');
    assert.equal(await chief.locator('[data-act="recruit"]').count(), 77);
    await select(dip, 'NIG');
    await tab(dip, 'troops');
    assert.match(await dip.locator('#panel').innerText(), /Leaders and chiefs of staff can recruit/i);
    assert.equal(await dip.locator('[data-act="recruit"]').count(), 0);
    await tab(dip, 'tech');
    assert.doesNotMatch(
      await dip
        .locator('.card.tech')
        .allTextContents()
        .then(rows => rows.join(' ')),
      /Pz III|Nebelwerfer|Bf 109/
    );
    await tab(dip, 'dip');
    const amount = dip.getByRole('spinbutton', {name: 'Amount to give'});
    assert.equal(await dip.getByRole('spinbutton', {name: 'Amount to receive'}).count(), 1);
    await dip.getByRole('combobox', {name: 'Resource to give'}).selectOption('man');
    await dip.getByRole('combobox', {name: 'Resource to receive'}).selectOption('oil');
    await dip.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    assert.deepEqual(
      await dip.evaluate(async () =>
        (await window.axe.run(document.querySelector('#panel'))).violations.map(v => v.id)
      ),
      []
    );
    await amount.fill('37');
    const pass = guest.locator('#pwin');
    await guest.locator('[data-act="join"][data-n="Fixture reich"]').tap();
    await pass.fill('discard on back');
    await guest.getByRole('button', {name: 'Back', exact: true}).tap();
    await guest.locator(`[data-act="join"][data-n="${name}"]`).tap();
    assert.equal(await pass.inputValue(), '');
    await pass.fill(password);
    await pass.evaluate(el => el.setSelectionRange(2, 7));
    assert.deepEqual(roomSaves(), []);
    await select(chief, 'PER');
    await tab(chief, 'troops');
    const plane = chief.locator('[data-act="recruit"][data-u="rk_h18"][data-n="1"]');
    await plane.tap();
    await Promise.all([guest, dip, chief].map(p => rev(p, 81)));
    assert.equal(await pass.inputValue(), password);
    assert.ok(await focused(pass));
    assert.deepEqual(await pass.evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 7]);
    assert.ok(await focused(amount));
    assert.equal(await amount.inputValue(), '37');
    assert.equal(await dip.getByLabel('Resource to give').inputValue(), 'man');
    assert.equal(await dip.getByLabel('Resource to receive').inputValue(), 'oil');
    assert.equal(latest.get(topic).terr.PER.u.rk_h18, 1);
    const deployment = () =>
      plane.evaluate(el => el.closest('div[style*="border-bottom"]').querySelector('.mono').textContent);
    assert.equal(await deployment(), 'Deployed: 1/2');
    assert.ok(await plane.isEnabled());
    await pass.press('Enter');
    await guest.waitForFunction(
      n => localStorage.getItem('eot-me') === n && !document.querySelector('#pwin'),
      name
    );
    await tab(guest, 'council');
    const newPass = guest.getByLabel('Password for new post');
    assert.equal(await newPass.getAttribute('type'), 'password');
    await guest.getByLabel('Name for new post').fill('Unsubmitted cadet');
    await newPass.fill('unsaved fixture');
    await plane.tap();
    await Promise.all([guest, dip, chief].map(p => rev(p, 82)));
    assert.equal(await deployment(), 'Deployed: 2/2');
    assert.ok(await plane.isDisabled());
    assert.equal(await newPass.inputValue(), 'unsaved fixture');
    assert.ok(await focused(newPass));
    assert.equal(await guest.getByLabel('Name for new post').inputValue(), 'Unsubmitted cadet');
    await newPass.blur(); // The unsubmitted form also survives a peer order while not focused.
    // A live revision must not drop Room's draft, disclosure, focus trap or return target.
    const sw = dip.locator('#me [data-act="switch"]'),
      roomBtn = dip.locator('#me [data-act="room"]');
    await sw.focus();
    await dip.waitForTimeout(1150); // cross at least one real HUD tick
    assert.ok(await focused(sw));
    await roomBtn.press('Enter');
    const dialog = dip.getByRole('dialog', {name: 'War Room'}),
      invite = dialog.getByLabel('Room invite link'),
      done = dialog.getByRole('button', {name: 'Done'});
    await dip.keyboard.press('Tab');
    assert.ok(await focused(invite));
    await dip.keyboard.press('Shift+Tab');
    assert.ok(await focused(done));
    await dip.keyboard.press('Tab');
    assert.ok(await focused(invite));
    await dialog.locator('summary').click();
    await dialog.getByLabel('Room code').fill('unsent-room-draft');
    await select(chief, 'SWE');
    assert.ok(await chief.getByRole('button', {name: 'Attack', exact: true}).isDisabled());
    assert.match(await chief.locator('#panel').innerText(), /ceasefire is in force/);
    await select(chief, 'PRU');
    await chief.getByRole('button', {name: 'Attack from here'}).tap();
    assert.deepEqual(
      await chief
        .getByLabel('Target province')
        .locator('option')
        .evaluateAll(els => els.map(el => el.value).filter(Boolean)),
      ['BAL']
    );
    await chief.getByRole('button', {name: 'Cancel', exact: true}).tap();
    await select(chief, 'OSL');
    await move.tap();
    await chief.locator('[data-act="mto"][data-id="DEN"]').tap();
    await chief.locator('[data-act="step"][data-u="inf"][data-d="1"]').tap();
    const confirm = chief.locator('[data-act="confirm"]');
    assert.ok(await confirm.isDisabled());
    assert.match(await chief.locator('#modal').innerText(), /Crossing water/);
    assert.equal(latest.get(topic).rev, 82);
    await chief.locator('[data-act="step"][data-u="air"][data-d="1"]').tap(); // mixed group, Air 4
    assert.ok(await confirm.isEnabled());
    await confirm.tap();
    await Promise.all([rev(dip, 83), rev(guest, 83)]);
    assert.equal(await newPass.inputValue(), 'unsaved fixture');
    assert.equal(await guest.getByLabel('Name for new post').inputValue(), 'Unsubmitted cadet');
    assert.equal(await dialog.getByLabel('Room code').inputValue(), 'unsent-room-draft');
    assert.ok(await focused(dialog.getByLabel('Room code')));
    assert.ok(await dialog.locator('details').evaluate(el => el.open));
    await dip.keyboard.press('Escape');
    assert.ok(await focused(roomBtn));
    const tear = dip.locator('#panel [data-act="breakpact"]'),
      pri = structuredClone(latest.get(topic));
    assert.match(await tear.innerText(), /13G, -10% attack for 15 min/);
    await tear.click();
    await rev(chief, 84);
    const end = latest.get(topic);
    factory.tick(pri, end.t);
    assert.equal(pri.teams.dawn.res.gold - end.teams.dawn.res.gold, 13);
    assert.equal(end.treach.dawn - end.t, 15 * 60000);
    await select(chief, 'SWE');
    assert.ok(await chief.getByRole('button', {name: 'Attack', exact: true}).isEnabled());
    assert.deepEqual(roomSaves(), [81, 82, 83, 84]);
    console.log(
      `PASS: all 147 directory entries and 7 map presets; mobile Move ${offset}px into Orders; two Lima recruits, masked sign-in/drafts across peer orders, modal keyboard return, Diplomacy axe, sea moves and discounted treaty.`
    );
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
};
