const test = require('node:test');
const assert = require('node:assert/strict');
const {saved, purchaseRoom, mockTime, checkReadOnly, finishOrder} = require('../test-support/war-room.cjs');

test('the Council and Diplomacy have no ceremonial hierarchy; legacy usernames are not replaced by aliases', async t => {
  mockTime(t);
  const st = saved(90);
  st.players.Debjit = {team: 'dawn', role: 'soldier', title: 'Reserve', cd: 0, cp: 10};
  const {tab} = purchaseRoom(st, 'dawn', 'leader');
  tab.click('tab', {k: 'council'});
  assert.doesNotMatch(
    tab.$('#panel').innerHTML,
    /Black Dawn hierarchy|Warden of the Dominions|Grand Chancellor|First Legate/
  );
  for (const name of ['Debjit', 'Debjiit'])
    assert.ok(tab.$('#panel').innerHTML.includes(`Game role for ${name}"`));
  tab.click('tab', {k: 'dip'});
  assert.doesNotMatch(tab.$('#panel').innerHTML, /Grand Chancellor|Syamantak|Debjiit/);
  checkReadOnly(tab);
  const title = 'North & South <reserve>';
  await finishOrder(t, tab.game.act('setrole', {name: 'Debjiit', title}));
  assert.equal(tab.game.S.players.Debjiit.title, title);
  assert.equal(tab.game.S.players.Debjit.title, 'Reserve');
  tab.click('switch');
  assert.match(tab.$('#modal').innerHTML, /North &amp; South &lt;reserve&gt;/);
});
