const test = require('node:test');
const assert = require('node:assert/strict');
const {
  launch, saved, masterySaved, factory, mockTime, finishOrder, checkReadOnly, purchaseRoom, now
} = require('../test-support/war-room.cjs');

// Seat, existing login key, name published in the charter, office, portfolio.
const appointments = [
  ['I', 'Syamantak Kar', 'Syamantak', 'Prophet-King', 'doctrine, foreign policy, appointments'],
  ['II', 'Anish', 'Anish', 'First Legate', 'internal administration'],
  ['III', 'Rishit Mullick', 'Rishit', 'Grand Chancellor', 'economic affairs, resources'],
  ['IV', 'Debjiit', 'Debjit', 'Warden of the Dominions', 'provincial governance'],
  ['V', 'Ratnadeep', 'Ratnadeep', 'High Archivist', 'research and sacred texts'],
  ['VII', 'Souvik', 'Souvik', 'Master of the Raven Couriers', 'intelligence records'],
  ['VIII', 'Swapnil Das', 'Swapnil', 'High Envoy of the Eclipse', 'diplomatic relations'],
  ['IX', 'Titli', 'Titli', 'Oracle of the Black Dawn', 'ceremonial traditions']
];
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const panel = tab => tab.$('#panel').innerHTML;
const modal = tab => tab.$('#modal').innerHTML;
function connect(tab, st) {
  const [relay, b, c] = tab.sockets;
  relay.subscribe(); b.onerror(); c.onerror(); relay.message('state', st);
  return relay;
}

for (const make of [saved, masterySaved]) {
  test(`${make === saved ? 'Classic' : 'Mastery'}: complete three-tier charter, including the unspecified VI; browsing writes nothing`, t => {
    mockTime(t);
    const st = make(209);
    st.front = {turn: 7, at: now, drill: {USSR: 4}};
    const tab = launch({cached: st, rules: st.ruleset, identity: {name: '__spectator'}});
    connect(tab, st);
    tab.click('tab', {k: 'council'});
    assert.match(panel(tab), /Black Dawn hierarchy/);
    tab.click('councilview', {k: 'hierarchy'});
    const charter = panel(tab);
    assert.match(text(charter), /Secta Vatum Aurorae Nigrae.*The Supreme Black Followers.*Official Hierarchy &amp; Appointments/i);
    assert.deepEqual(Array.from(charter.matchAll(/<h3>([^<]*)<\/h3>/g), m => m[1]), [
      'The Prophet-King', 'The Inner Council', 'The Six High Offices', 'The Order of Authority'
    ]);
    const seats = new Map(Array.from(charter.matchAll(/<li><span class="charter-seat">(\w+)<\/span>([\s\S]*?)<\/li>/g), m => [m[1], text(m[2])]));
    assert.deepEqual([...seats.keys()], ['I','II','III','IV','V','VI','VII','VIII','IX']);
    assert.equal(seats.get('VI'), 'Appointment not specified.');
    for (const [seat, , name, title, portfolio] of appointments) {
      assert.ok(seats.get(seat).startsWith(`${name} — ${title}`));
      assert.ok(seats.get(seat).includes(portfolio));
    }
    assert.match(seats.get('I'), /Supreme Leader · Supreme Hierophant · Chancellor of the Black Dawn/);
    assert.match(seats.get('II'), /Keeper of the Sacred Seal.*First Deputy/);
    assert.match(seats.get('III'), /Master of the Treasury.*Second Deputy/);
    assert.match(charter, /<li>The Prophet-King<\/li><li>The First Legate and Grand Chancellor<\/li><li>The Six High Officers<\/li>/);
    assert.match(charter, /hold equal deputy status/);
    assert.match(charter, /under the authority of the Inner Council and, ultimately, the Prophet-King/);
    t.mock.timers.tick(10000);
    assert.equal(panel(tab), charter);
    tab.click('councilview', {k: 'posts'});
    assert.match(panel(tab), /Enlist someone new/);
    assert.deepEqual(structuredClone(tab.game.S), structuredClone(st));
    checkReadOnly(tab);
  });
}

test('the post picker and password prompt show the office but use the original login key for every appointee', t => {
  mockTime(t);
  const st = saved(72), tab = launch({cached: st});
  connect(tab, st);
  const picker = modal(tab), ids = Array.from(picker.matchAll(/data-act="join" data-n="([^"]+)"/g), m => m[1]);
  assert.deepEqual(ids.filter(k => st.players[k].team === 'dawn'), [
    ...appointments.map(a => a[1]), 'Subhadeep', 'Suvodeep', 'Veteran'
  ]);
  for (const [, key, , title] of appointments) {
    const display = key === 'Debjiit' ? 'Debjit' : key;
    assert.ok(picker.includes(`data-n="${key}"><b>${display}</b><span class="mut sm">${title}</span>`));
    tab.click('join', {n: key});
    assert.ok(modal(tab).includes(`<h2>${display}</h2>`));
    assert.ok(text(modal(tab)).includes(`${title}. Enter the password`));
    tab.click('pwback');
  }
  assert.ok(!st.players.Debjit);
  assert.equal(ids.length, Object.keys(st.players).length);
  assert.deepEqual(structuredClone(tab.game.S.players), structuredClone(st.players));
  checkReadOnly(tab);
});

test('an explicit leader edit preserves a custom room title alongside the appointment without renaming the player or changing their rights', async t => {
  mockTime(t);
  const st = masterySaved(90);
  st.players.Debjiit.cd = now + 80000;
  st.players.Debjiit.cp = 20; // no passive change while the title edit is in flight
  const {tab} = purchaseRoom(st, 'dawn', 'leader');
  const before = structuredClone(tab.game.S.players.Debjiit);
  tab.click('tab', {k: 'council'});
  assert.match(panel(tab), /aria-label="Room title for Debjit"[^>]*data-n="Debjiit"/);
  assert.match(panel(tab), /aria-label="Game role for Debjit"[^>]*data-n="Debjiit"/);
  assert.match(panel(tab), /data-act="reset"/);
  tab.click('reset');
  tab.click('councilview', {k: 'hierarchy'});
  tab.click('councilview', {k: 'posts'});
  assert.doesNotMatch(panel(tab), /Press again to confirm/);
  checkReadOnly(tab);
  const title = 'North & South <reserve>';
  await finishOrder(t, tab.game.act('setrole', {name: 'Debjiit', title}));
  assert.equal(tab.game.S.rev, 91);
  assert.deepEqual(structuredClone(tab.game.S.players.Debjiit), {...before, title});
  assert.equal(tab.game.S.players.Debjit, undefined);
  tab.click('switch');
  assert.match(modal(tab), /Warden of the Dominions · North &amp; South &lt;reserve&gt;/);
  assert.doesNotMatch(modal(tab), /<reserve>/);
  assert.equal(tab.game.S.players.Ratnadeep.role, 'soldier');
  assert.equal(tab.game.S.players['Rishit Mullick'].role, 'diplomat');
  assert.ok(factory.A.mastery(structuredClone(tab.game.S), {name:'Ratnadeep',team:'dawn',now}, {unit:'bd_init',skill:'atk',rank:1,quote:{gold:50,steel:50}}).err);
});

test('a similarly named enlistee, reassignment or removal in a newer save never transfers an office or restores a missing post', t => {
  mockTime(t);
  const st = saved(114);
  st.players.Debjit = {team:'dawn',role:'soldier',title:'Reserve',cd:0,cp:10};
  st.players.Souvik.team = 'reich';
  const tab = launch({cached: st}), relay = connect(tab, st);
  assert.match(modal(tab), /data-n="Debjiit"><b>Debjit \(Debjiit\)<\/b>[^<]*<span[^>]*>Warden of the Dominions/);
  assert.match(modal(tab), /data-n="Debjit"><b>Debjit<\/b>[^<]*<span[^>]*>Reserve/);
  assert.match(modal(tab), /data-n="Souvik"><b>Souvik<\/b>[^<]*<span[^>]*>Soldier/);
  tab.click('join', {n:'Debjiit'});
  const next = structuredClone(st); next.rev++; delete next.players.Debjiit;
  relay.message('state', next);
  assert.match(modal(tab), /Choose your post/);
  assert.doesNotMatch(modal(tab), /data-n="Debjiit"|Warden of the Dominions/);
  tab.click('spectate'); tab.click('councilview', {k:'hierarchy'});
  assert.match(panel(tab), /Warden of the Dominions/); // Faction charter, not a list of sign-in buttons.
  assert.deepEqual(structuredClone(tab.game.S), next);
  checkReadOnly(tab);
});
