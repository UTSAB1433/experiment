// Three isolated profiles; all account and campaign traffic goes to loopback brokers.
const assert = require('node:assert/strict');
module.exports = async function lobby({origin, context, writes, latest, publish}) {
  const contexts = await Promise.all([context('guest', true), context('guest'), context('guest')]);
  const [owner, guest, third] = await Promise.all(contexts.map(c => c.newPage()));
  const act = (p, k) => p.locator(`[data-act="${k}"]`).first(),
    title = (p, n) => p.getByRole('heading', {name: n, exact: true});
  const password = 'local QA only 239';
  async function account(p, name, signup) {
    if (signup && (await act(p, 'signup').count())) await act(p, 'signup').click();
    await p.getByLabel('Username', {exact: true}).fill(name);
    await p.getByLabel('Password', {exact: true}).fill(password);
    await p.locator('#account-submit').click();
  }
  async function deskAudit(p) {
    if (!(await p.evaluate(() => !!window.axe)))
      await p.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    const problems = await p.evaluate(async () =>
      (
        await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})
      ).violations.map(v => [v.id, v.nodes.map(n => n.target)])
    );
    assert.deepEqual(problems, []);
    assert.ok(await p.locator('#entry').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  }
  try {
    await owner.goto(origin + '/');
    await title(owner, 'Enter the war room').waitFor();
    assert.equal(await owner.locator('#map .node').count(), 0);
    await owner.setViewportSize({width: 320, height: 780});
    await deskAudit(owner);
    await act(owner, 'newroom').click();
    await title(owner, 'Sign in to create a room').waitFor();
    await owner.reload();
    await title(owner, 'Sign in to create a room').waitFor();
    await deskAudit(owner);
    const code = new URL(owner.url()).searchParams.get('room'),
      topic = `lands-eot/v2/${code}:mastery-1/state`;
    const revisions = () => writes.filter(w => w.topic === topic).map(w => w.rev);
    const preview = await owner.evaluate(() => window.__eot.S.terr);
    assert.equal(Object.keys(preview).length, 201);
    assert.deepEqual(
      Object.keys(preview)
        .filter(id => preview[id].o !== 'neutral')
        .sort(),
      ['BER', 'NIG']
    );
    assert.deepEqual(revisions(), []);
    await account(owner, 'Amber Fox', true);
    await title(owner, 'Choose your faction').waitFor();
    assert.deepEqual(revisions(), []);
    await owner.locator('[data-act="membership"][data-team="dawn"]').click();
    await title(owner, 'Campaign lobby').waitFor();
    assert.equal(await act(owner, 'startcampaign').isDisabled(), true);
    await deskAudit(owner);
    const privateSession = await owner.evaluate(() => JSON.parse(localStorage.getItem('eot-profile:v2')));
    assert.ok(
      !JSON.stringify(latest.get(topic)).includes(privateSession.key) &&
        !JSON.stringify(latest.get(topic)).includes(password)
    );
    assert.equal(latest.get(topic).players['Amber Fox'].role, 'leader');
    assert.equal(latest.get(topic).owner, 'Amber Fox');
    assert.deepEqual(latest.get(topic).terr, preview);
    await owner.evaluate(() => window.__eot.act('start'));
    await owner.evaluate(() => window.__eot.act('contribute', {kind: 'drill'}));
    assert.deepEqual(revisions(), [2]);
    await owner.reload();
    await title(owner, 'Campaign lobby').waitFor();
    // Clipboard access is optional (e.g. embedded/mobile browsers). Manual copy must still work.
    await owner.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: () => Promise.reject(Error('denied'))},
        configurable: true
      })
    );
    await owner.getByRole('button', {name: 'Copy invite link', exact: true}).click();
    await owner.waitForFunction(() => {
      const e = document.querySelector('#roomlink');
      return e && document.activeElement === e && e.selectionStart === 0 && e.selectionEnd === e.value.length;
    });
    const invite = await owner.getByLabel('Room invite link').inputValue();
    await act(owner, 'closem').click();
    // Code and invite both identify the same room. Neither enrolls or starts automatically.
    await Promise.all([guest, third].map(p => p.goto(origin + '/')));
    const codeField = guest.getByLabel('Room code or invite link', {exact: true});
    await codeField.fill(invite + '&via=unknown');
    await codeField.press('Enter');
    assert.match(await guest.locator('#home-code-error').innerText(), /invite/i);
    assert.equal(guest.url(), origin + '/');
    await codeField.fill(invite);
    assert.equal(await codeField.inputValue(), invite);
    await codeField.press('Enter');
    await third.getByLabel('Room code or invite link', {exact: true}).fill(code.toUpperCase());
    await third.getByRole('button', {name: 'Join room', exact: true}).click();
    await Promise.all([guest, third].map(p => title(p, 'Sign in to join').waitFor()));
    assert.equal(new URL(guest.url()).search, new URL(invite).search);
    await account(guest, 'Amber Fox', true);
    await guest.waitForFunction(() =>
      document.querySelector('#account-error')?.textContent.includes('post in this room')
    );
    await Promise.all([account(third, 'Blue Finch', true), account(guest, 'Gray Falcon', true)]);
    await Promise.all([guest, third].map(p => title(p, 'Choose your faction').waitFor()));
    await Promise.all(
      [guest, third].map(p => p.locator('[data-act="membership"][data-team="dawn"]').click())
    );
    await Promise.all([guest, third].map(p => title(p, 'Campaign lobby').waitFor()));
    const st = latest.get(topic);
    assert.deepEqual(Object.keys(st.players).sort(), ['Amber Fox', 'Blue Finch', 'Gray Falcon']);
    assert.equal(st.players['Blue Finch'].role, 'soldier');
    assert.equal(st.players['Gray Falcon'].role, 'soldier');
    await guest.evaluate(() => window.__eot.act('start'));
    assert.equal(latest.get(topic).phase, 'lobby');
    assert.ok(await act(owner, 'startcampaign').isDisabled(), 'all three joined the same side');
    assert.equal(await act(owner, 'lobbyside').count(), 0);
    for (const p of [guest, third]) {
      await p.getByText('Picked the wrong side?', {exact: true}).click();
      await p.getByRole('button', {name: 'Switch to The Reich'}).click();
      await p.waitForFunction(
        () => document.querySelector('[data-act="lobbyside"]')?.dataset.team === 'dawn'
      );
    }
    await owner.waitForFunction(() => !document.querySelector('[data-act="startcampaign"]').disabled);
    assert.match(
      await guest.locator('#entry').innerText(),
      /The Reich has no commander yet[\s\S]*only a commander can move or attack/
    );
    await act(owner, 'room').click();
    await owner.waitForFunction(() =>
      document.querySelector('#room-presence')?.textContent.includes('Gray Falcon')
    );
    assert.doesNotMatch(await owner.locator('#room-presence').innerText(), /Joining…/);
    await act(owner, 'closem').click();
    await owner.getByRole('button', {name: /Appoint Gray Falcon as/}).click();
    await owner.waitForFunction(() => window.__eot.S.players['Gray Falcon'].role === 'leader');
    await guest.waitForFunction(
      () =>
        window.__eot.S.players['Gray Falcon'].role === 'leader' &&
        !document.querySelector('[data-act="lobbyside"]')
    );
    await act(owner, 'startcampaign').click();
    for (const p of [owner, guest, third])
      await p.waitForFunction(
        () => window.__eot.S.phase === 'active' && document.querySelectorAll('#map .node').length === 201
      );
    assert.deepEqual(latest.get(topic).terr, preview);
    assert.match(await third.locator('#briefing-title').innerText(), /field duty/i);
    await third.locator('#map .node[data-id="BER"]').press('Enter');
    assert.match(
      await third.locator('#panel').innerText(),
      /As Soldier you cannot command troops\. Your Führer assigns command roles in Council/
    );
    await third.locator('#map .node[data-id="NIG"]').press('Enter');
    assert.match(
      await third.locator('#panel').innerText(),
      /As Soldier you can scout with Spy\. Only commanders or an appointed attack seat can attack/
    );
    await third.locator('[data-act="clearsel"]').click();
    await third.getByRole('button', {name: 'Open field duty'}).click();
    assert.ok(await third.getByRole('button', {name: 'Prospect +4 Oil'}).isEnabled());
    await guest.locator('#tabs [data-k="council"]').click();
    await guest.getByLabel('Game role for Blue Finch').selectOption('chief');
    await third.waitForFunction(() => window.__eot.S.players['Blue Finch'].role === 'chief');
    assert.doesNotMatch(
      await guest.locator('#panel').textContent(),
      /Grand Chancellor|First Legate|Dhruv|Syamantak/
    );
    await guest.locator('#map [data-id="TOK"]').press('Enter');
    assert.match(await guest.locator('#panel').textContent(), /Hold every state/);
    // New device, same account uses password; subsequent visits need neither password nor a faction choice.
    await act(third, 'signout').click();
    await title(third, 'Sign in to join').waitFor();
    await third.evaluate(() => localStorage.clear());
    await third.reload();
    await third.getByLabel('Username', {exact: true}).fill('amber fox');
    await third.getByLabel('Password', {exact: true}).fill('not the password');
    await third.locator('#account-submit').click();
    await third.waitForFunction(() =>
      document.querySelector('#account-error')?.textContent.includes('Incorrect')
    );
    await account(third, 'amber fox', false);
    await third.waitForFunction(() => document.querySelector('#me')?.textContent.includes('Amber Fox'));
    await third.reload();
    await third.waitForFunction(() => document.querySelector('#me')?.textContent.includes('Amber Fox'));
    assert.deepEqual(revisions(), [2, 3, 4, 5, 6, 7, 8, 9]);
    // The remembered profile is not a faction or command grant in a different room.
    await third.goto(origin + '/');
    await act(third, 'newroom').click();
    await title(third, 'Choose your faction').waitFor();
    assert.equal(await third.locator('#map .node').count(), 0);
    assert.deepEqual(revisions(), [2, 3, 4, 5, 6, 7, 8, 9]);
    // A clean sign-in outside an existing membership uses the directory, not that other room’s roster.
    await act(third, 'signout').click();
    await account(third, 'Amber Fox', true);
    await third.waitForFunction(() =>
      document.querySelector('#account-error')?.textContent.includes('registered')
    );
    await act(third, 'signin').click();
    await account(third, 'Blue Finch', false);
    await title(third, 'Choose your faction').waitFor();
    assert.deepEqual(Object.keys(await third.evaluate(() => window.__eot.S.players)), []);
    // A cancelled creation is no longer a claim on that code, even on the same tab.
    const abandoned = new URL(third.url()).searchParams.get('room');
    await act(third, 'rooms').click();
    await third.getByLabel('Room code or invite link', {exact: true}).fill(abandoned);
    await third.getByRole('button', {name: 'Join room', exact: true}).click();
    await title(third, 'Room not found').waitFor();
    await third.evaluate(() => window.__eot.act('membership', {team: 'reich'}));
    assert.equal(latest.has(`lands-eot/v2/${abandoned}:mastery-1/state`), false);
    assert.equal(await third.locator('#map .node').count(), 0);
    // First enlistment AFTER launch, including a reload between signup and the faction choice.
    await third.goto(invite);
    await act(third, 'signout').click();
    await account(third, 'Late Rook', true);
    await title(third, 'Choose your faction').waitFor();
    await third.reload();
    await title(third, 'Choose your faction').waitFor();
    await third.locator('[data-act="membership"][data-team="dawn"]').click();
    await third.waitForFunction(() => document.querySelectorAll('#map .node').length === 201);
    assert.equal(latest.get(topic).players['Late Rook'].role, 'soldier');
    assert.equal(latest.get(topic).owner, 'Amber Fox');
    assert.deepEqual(revisions(), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // A legitimate active v8 room with a captured state, one active device and no
    // occupied independent capitals. Let the real presence/lease path run the turn.
    const isolated = structuredClone(latest.get(topic)),
      raidCode = 'solo-state-test',
      raidTopic = `lands-eot/v2/${raidCode}:mastery-1/state`;
    isolated.rev = 40;
    delete isolated.frontTraffic;
    isolated.terr.HEN.o = 'reich';
    isolated.terr.HEN.u = {};
    await publish(raidTopic, isolated);
    const wall = Date.now() + 12000;
    await third.clock.install({time: wall - 1000});
    await third.clock.pauseAt(wall);
    await third.goto(`${origin}/?room=${raidCode}&rules=mastery-1&via=mqtt&relay=emqx`);
    await third.waitForFunction(() => document.querySelectorAll('#map .node').length === 201);
    for (let i = 0; i < 21; i++) {
      await third.clock.fastForward(5000);
      await new Promise(r => setTimeout(r, 65));
    }
    const raid = latest.get(raidTopic);
    assert.equal(raid.front.turn, 1);
    assert.equal(raid.log[0].tid, 'HEN');
    assert.equal(raid.terr.HEN.o, 'neutral');
    assert.match(raid.log[0].msg, /Border counterattack/);
    assert.deepEqual(
      writes.filter(w => w.topic === raidTopic).map(w => w.rev),
      [41]
    );
    await require('./briefing-room-check.cjs')({
      origin,
      page: owner,
      peer: guest,
      state: latest.get(topic),
      publish,
      latest,
      writes
    });
    console.log(
      'PASS: phone room picker, signup, portable sign-in and remembered session; code/invite, concurrent Soldiers, two-side launch, opposing appointments, accessible staging at 320px, 201 playable states and a real solo counterattack.'
    );
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
};
