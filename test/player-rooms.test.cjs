// v8 player-created campaigns. All profiles, public keys, clocks and backends are fixtures.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {
  launch,
  flush,
  inspect,
  now,
  mockTime,
  finishOrder,
  checkReadOnly,
  publications,
  ceiling,
  saved
} = require('../test-support/war-room.cjs');
const script = inspect([
  'validUsername',
  'validSave',
  'restoreFirebaseEmpties',
  'occupation',
  'ATLAS_HOMES',
  'ATLAS_HOME',
  'CAMPAIGN_ADJ',
  'ATLAS',
  'provincesOf',
  'weightsOf',
  'roomReady',
  'advanceFront',
  'restoreProfile',
  'lastStand',
  'attackRoutes',
  'income',
  'vpOf',
  'countOf',
  'frontDue',
  'FRONT_MS',
  'countryAt'
]);
const e = launch({script, timers: {setInterval() {}, setTimeout() {}}, random: () => 0.5}).game;
const key = (name, char) => {
  const key = char.repeat(64),
    salt = char.repeat(32),
    account = createHash('sha256')
      .update(`eot-profile-v1:${name.toLowerCase()}:${salt}:${key}`)
      .digest('hex');
  return {name, key, salt, account};
};
const alpha = key('Amber Fox', 'a'),
  beta = key('Blue Finch', 'b'),
  gamma = key('Cedar', 'c');
const ctx = (p, team) => ({name: p.name, account: p.account, salt: p.salt, team, now});
const member = (s, p, team, create = false) => e.A.membership(s, ctx(p, team), {team, create});
function lobby(team = 'reich') {
  const s = e.newGame(now);
  assert.ok(member(s, alpha, team, true).ok);
  return s;
}
function active() {
  const s = lobby();
  member(s, beta, 'dawn');
  assert.ok(e.A.start(s, ctx(alpha, 'reich')).ok);
  return s;
}
const copy = structuredClone;
const session = (p, key = p.key) =>
  new Map([['eot-profile:v2', JSON.stringify({name: p.name, key, salt: p.salt, id: p.account})]]);
async function enter(st, storage, identity) {
  const t = launch({script, storage, identity, relay: 'emqx'});
  const r = t.sockets[0];
  r.subscribe();
  r.message('state', st);
  await t.game.restoreProfile();
  return t;
}

test('new-room atlas: no roster, only two HQs, a reachable two-way map and exactly one garrison per state', () => {
  const s = e.newGame(now);
  assert.equal(s.v, 8);
  assert.equal(s.phase, 'lobby');
  assert.deepEqual(Object.keys(s.players), []);
  assert.deepEqual(
    Object.keys(s.terr)
      .filter(k => s.terr[k].o !== 'neutral')
      .sort(),
    ['BER', 'NIG']
  );
  assert.equal(s.terr.NIG.u.bd_fact, 1);
  assert.equal(s.terr.BER.f, 1);
  assert.equal(Object.keys(s.terr).length, 201);
  assert.equal(e.weightsOf(s).length, 201);
  assert.equal(e.weightsOf(saved(23)).length, 148);
  const seen = new Set(['BER']);
  for (const from of seen) {
    const edges = e.CAMPAIGN_ADJ[from];
    assert.equal(edges.length, new Set(edges.map(x => x.id)).size);
    for (const {id, sea} of edges) {
      assert.notEqual(id, from);
      assert.ok(e.CAMPAIGN_ADJ[id].some(x => x.id === from && x.sea === sea));
      seen.add(id);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(s.terr).sort());
  const assigned = Object.values(e.ATLAS_HOMES).flat();
  assert.equal(assigned.length, new Set(assigned).size);
  assert.deepEqual(
    Object.keys(s.terr).filter(k => !e.ATLAS_HOME[k]),
    ['BMT']
  ); // sea zone, not a country
  for (const k of [
    'USA',
    'USSR',
    'JPN',
    'GBR',
    'CHN',
    'IND',
    'DEU',
    'NGA',
    'BRA',
    'CAN',
    'AUS',
    'IRN',
    'MEX',
    'ARG',
    'COD',
    'DZA'
  ])
    assert.ok(e.ATLAS_HOMES[k].length > 1, k);
  assert.deepEqual(Array.from(e.ATLAS_HOMES.ISL), ['ICE']);
  assert.equal(e.ATLAS_HOME.THR, 'IRN');
  assert.equal(e.ATLAS_HOME.PER, 'PER');
  assert.equal(e.validSave(s), false, 'a preview without an owner is never a live save');
});
for (const team of ['reich', 'dawn'])
  test(`only the ${team} creator leads; appointees and start are explicit, not presence/income side effects`, () => {
    const other = team === 'dawn' ? 'reich' : 'dawn',
      s = lobby(team),
      before = copy(s),
      lead = ctx(alpha, team);
    assert.ok(e.validSave(s));
    e.tick(s, now + 86400000);
    e.checkWin(s, now + 86400000);
    assert.equal(e.advanceFront(s, now + 86400000, 0, true), false);
    assert.deepEqual(copy(s), before);
    assert.ok(e.A.start(s, lead).err);
    assert.ok(member(s, beta, team).ok);
    assert.ok(e.A.start(s, lead).err);
    assert.ok(member(s, gamma, other).ok);
    assert.equal(s.players[gamma.name].role, 'soldier');
    assert.equal(s.players[beta.name].role, 'soldier');
    assert.equal(s.players[alpha.name].role, 'leader');
    assert.ok(member(s, alpha, other).err);
    assert.ok(member(s, {...beta, name: 'BLUE FINCH'}, other).err);
    assert.ok(member(s, {...gamma, name: 'Another name'}, team).err);
    assert.ok(member(s, key('Pretender', 'f'), other, true).err);
    assert.ok(e.A.enlist(s, lead, {name: 'Ghost', team: other, pw: 'a'.repeat(64)}).err);
    assert.ok(e.A.start(s, ctx(gamma, other)).err);
    assert.ok(e.A.appointLeader(s, ctx(beta, team), {name: gamma.name}).err);
    assert.ok(e.A.appointLeader(s, lead, {name: gamma.name}).ok);
    assert.ok(e.A.start(s, ctx(gamma, other)).err, 'opposing leader is not the room owner');
    const start = now + 86400000;
    assert.ok(e.A.start(s, {...lead, now: start}).ok);
    assert.equal(s.t, start);
    assert.equal(s.phase, 'active');
    assert.ok(e.A.start(s, lead).err);
    for (const t of Object.keys(s.teams)) assert.deepEqual(copy(s.teams[t].res), before.teams[t].res);
    assert.ok(e.A.setrole(s, ctx(gamma, other), {name: beta.name, role: 'chief'}).err);
    assert.ok(e.A.setrole(s, lead, {name: beta.name, role: 'chief'}).ok);
    assert.ok(e.A.reset(s, ctx(gamma, other), {created: s.created, rev: s.rev, origin: s.origin}).err);
    const players = copy(s.players);
    s.players[alpha.name].cd = start + 180000; // no cooldown carries over from the previous war
    assert.ok(
      e.A.reset(s, {...lead, now: start + 1000}, {created: s.created, rev: s.rev, origin: s.origin}).reset
    );
    assert.equal(s.phase, 'lobby');
    assert.deepEqual(copy(s.players), players);
    assert.equal(s.owner, alpha.name);
    assert.ok(e.validSave(s));
  });

test('password verifier, old saved post and spectator are not v8 sessions; remembered account in a new room still has to join', async t => {
  mockTime(t);
  const s = active();
  for (const [storage, identity] of [
    [new Map(), {name: alpha.name, ph: alpha.account}],
    [new Map(), {name: '__spectator'}],
    [session(alpha, alpha.account), null],
    [session(gamma), null]
  ]) {
    const tab = await enter(s, storage, identity);
    assert.ok(tab.$('#entry').innerHTML.length);
    assert.doesNotMatch(tab.$('#map').innerHTML, /class="node"/);
    for (const op of ['noop', 'enlist', 'reset', 'start', 'contribute', 'setrole', 'attack'])
      await finishOrder(t, tab.game.act(op, {}));
    checkReadOnly(tab);
  }
  const real = await enter(s, session(alpha));
  assert.match(real.$('#me').innerHTML, /Amber Fox/);
  assert.match(real.$('#map').innerHTML, /class="node"/);
  checkReadOnly(real);
  await finishOrder(t, real.game.act('contribute', {kind: 'drill'}));
  assert.equal(real.game.S.rev, 2);
});

test('a locked start cannot follow a removed opponent or a sign-out; pending rooms reject orders and a downgraded save', async t => {
  mockTime(t);
  const s = lobby();
  member(s, beta, 'dawn');
  s.rev = 20;
  const tab = await enter(s, session(alpha));
  for (const op of ['noop', 'contribute', 'attack', 'research', 'enlist', 'reset'])
    await finishOrder(t, tab.game.act(op, {}));
  const stale = tab.game.act('start'),
    gone = copy(s);
  delete gone.players[beta.name];
  gone.rev++;
  tab.sockets[0].message('state', gone);
  await finishOrder(t, stale);
  checkReadOnly(tab);
  assert.equal(tab.game.S.phase, 'lobby');
  const restored = copy(s);
  restored.rev = 22;
  tab.sockets[0].message('state', restored);
  const late = tab.game.act('start');
  tab.click('signout');
  await finishOrder(t, late);
  checkReadOnly(tab);
  const old = saved(99);
  old.created = s.created;
  tab.sockets[0].message('state', old);
  assert.match(tab.$('#banner').innerHTML, /older save format/);
  assert.equal(tab.game.S.v, 8);
});

test('corrupt owner, phase, account and map records or duplicate names cannot become a live campaign', () => {
  const st = active();
  assert.ok(e.validSave(st));
  for (const invalid of [
    s => (s.owner = 'Missing'),
    s => (s.players[s.owner].role = 'soldier'),
    s => (s.phase = 'playing'),
    s => delete s.players[beta.name],
    s => (s.players[beta.name].account = 'short'),
    s => delete s.players[s.owner].salt,
    s => (s.players.Duplicate = {...s.players[beta.name]}),
    s => (s.players['BLUE FINCH'] = {...s.players[beta.name], account: gamma.account}),
    s => delete s.terr.RAJ,
    s => (s.terr.NEW = s.terr.TOK)
  ]) {
    const s = copy(st);
    invalid(s);
    assert.equal(e.validSave(s), false);
  }
  for (const name of ['__spectator', 'constructor', 'a/b', 'a.b', '   ', 'Fake\nUser'])
    assert.equal(e.validUsername(name), false, name);
  for (const name of ['Dhruv', 'DEB', 'Player 23', 'বাংলা']) assert.ok(e.validUsername(name));
});

test('a capital is one state: captures and treaties transfer no other garrisons; full control requires every state', () => {
  const s = active(),
    lead = ctx(alpha, 'reich');
  s.terr.OSA.o = 'reich';
  s.terr.OSA.u = {inf: 80, nav: 10};
  s.terr.TOK.u = {};
  const hokkaido = copy(s.terr.HOK),
    kyushu = copy(s.terr.KYU);
  const captured = e.A.attack(s, lead, {from: 'OSA', to: 'TOK', grp: {inf: 50, nav: 2}, tactic: 'frontal'});
  assert.ok(captured.battle);
  assert.match(captured.ok, /remains contested \(2\/4/);
  assert.deepEqual(copy(s.terr.HOK), hokkaido);
  assert.deepEqual(copy(s.terr.KYU), kyushu);
  assert.equal(e.occupation(s, 'JPN').controller, null);
  s.teams.reich.res.gold = 5000;
  for (const id of ['HOK', 'KYU']) assert.ok(e.A.annex(s, lead, {tid: id, quote: ceiling}).ok);
  assert.equal(e.occupation(s, 'JPN').controller, 'reich');
  assert.match(s.log[0].msg, /controls all 4 states of Japan/);
  e.checkWin(s, now);
  assert.equal(s.win, null);
  assert.ok(e.validSave(s));
});

test('no instant HQ win, including a rush against a lone starting capital; the last state falls only after the homeland is secured', () => {
  const s = active(),
    lead = ctx(alpha, 'reich');
  s.terr.CHA.o = 'reich';
  s.terr.CHA.u = {inf: 100};
  s.terr.NIG.u = {};
  const p = {from: 'CHA', to: 'NIG', grp: {inf: 70}, tactic: 'frontal'};
  assert.match(e.A.attack(s, lead, p).err, /last province/);
  assert.equal(s.players[alpha.name].cp, 10);
  assert.deepEqual(Array.from(e.attackRoutes(s, 'reich', 'NIG')), []);
  const multi = copy(s);
  multi.terr.EGY.o = 'dawn';
  assert.ok(e.A.attack(multi, lead, p).battle);
  e.checkWin(multi, now);
  assert.equal(multi.win, null);
  assert.equal(multi.terr.EGY.o, 'dawn');
  for (const id of ['KAN', 'LAG']) s.terr[id].o = 'reich';
  assert.ok(e.A.attack(s, lead, p).battle);
  e.checkWin(s, now);
  assert.equal(s.win.team, 'reich');
});
for (const team of ['reich', 'dawn'])
  test(`a solo active front can counterattack a captured ${team} non-capital state from a real adjacent independent garrison`, () => {
    const s = active();
    s.terr.HEN.o = team;
    s.terr.HEN.u = {};
    for (const {id} of e.CAMPAIGN_ADJ.HEN) s.terr[id].u = {inf: 80, nav: 2};
    const before = copy(s.terr);
    assert.ok(e.advanceFront(s, now + e.FRONT_MS, 0, false));
    const l = s.log[0];
    assert.equal(l.tid, 'HEN');
    assert.equal(l.win, true);
    assert.equal(l.recovery, undefined);
    assert.ok(e.CAMPAIGN_ADJ.HEN.some(n => n.id === l.from));
    assert.match(l.msg, /Border counterattack/);
    assert.equal(s.terr.HEN.o, 'neutral');
    assert.ok(s.terr.HEN.country);
    assert.ok(s.terr[l.from].u.inf < 80);
    for (const id of ['NIG', 'BER']) assert.deepEqual(copy(s.terr[id]), before[id]);
    assert.ok(e.validSave(s));
    assert.equal(e.advanceFront(s, now + e.FRONT_MS, 0, true), false);
  });

const {prune, firebase, shared, filePicker} = require('../test-support/document-room.cjs');
for (const source of ['Firebase', 'shared DB'])
  test(`${source}: v8 staging, launch and owner-only active restore preserve the atlas and roster`, async t => {
    mockTime(t);
    const st = lobby();
    member(st, beta, 'dawn');
    e.A.appointLeader(st, ctx(alpha, 'reich'), {name: beta.name});
    st.rev = 23;
    st.terr.YUN.u = {};
    const backend = source === 'Firebase' ? firebase(null) : shared(st);
    const options = source === 'Firebase' ? {fb: true, fetch: backend.fetch} : {claude: backend.claude};
    if (source === 'Firebase') backend.records.set(backend.target, prune(st));
    const commits = () =>
      source === 'Firebase'
        ? backend.calls.filter(c => c.k === backend.target && c.method === 'PUT')
        : backend.writes.filter(k => k === backend.target);
    const login = async p => {
      const tab = launch({script, storage: session(p), ...options});
      await flush();
      await tab.game.restoreProfile();
      return tab;
    };
    const owner = await login(alpha),
      restore = filePicker(owner);
    assert.match(owner.$('#entry').innerHTML, /Campaign lobby/);
    assert.deepEqual(copy(owner.game.S.terr.YUN.u), {});
    assert.equal(restore(st), null);
    assert.equal(commits().length, 0);
    await owner.game.act('start');
    assert.equal(owner.game.S.phase, 'active');
    assert.equal(owner.game.S.rev, 24);
    const later = copy(owner.game.S);
    later.rev = 27;
    later.terr.YUN.o = 'reich';
    later.terr.YUN.u = {inf: 6};
    const opposing = await login(beta);
    assert.equal(filePicker(opposing)(later), null, 'opposing leader cannot restore');
    for (const change of [
      s => (s.phase = 'lobby'),
      s => (s.players[alpha.name].salt = beta.salt),
      s => s.created++,
      s => (s.rev = 24)
    ]) {
      const bad = copy(later);
      change(bad);
      await restore(bad);
    }
    await restore(saved(50));
    assert.equal(commits().length, 1);
    await restore(later);
    assert.equal(commits().length, 2);
    if (source === 'Firebase')
      assert.deepEqual(
        commits().map(c => c.headers['if-match']),
        ['"23"', '"24"']
      );
    const stored = backend.records.get(backend.target);
    assert.equal(stored.rev, 28);
    assert.deepEqual(stored.terr.YUN.u, {inf: 6});
    assert.equal(Object.keys(stored.terr).length, 201);
    assert.equal(stored.players[alpha.name].account, alpha.account);
    assert.equal(stored.players[beta.name].role, 'leader');
    assert.equal(owner.game.S.rev, 28);
    assert.ok(e.validSave(owner.game.S));
  });

test('RTDB numeric usernames survive array-shaped reads without becoming different seats', () => {
  const st = e.newGame(now);
  for (let n = 10; n <= 23; n++) {
    const p = key(String(n), 'a');
    assert.ok(member(st, p, n % 2 ? 'dawn' : 'reich', n === 10).ok);
  }
  const wire = prune(st);
  wire.players = Array.from({length: 24}, (_, n) => wire.players[n] || null);
  const recovered = e.restoreFirebaseEmpties(wire);
  assert.ok(e.validSave(recovered));
  assert.deepEqual(Object.keys(recovered.players), Object.keys(st.players));
  assert.equal(recovered.players['10'].account, st.players['10'].account);
  assert.equal(recovered.owner, '10');
});

test('only your own unappointed Soldier can correct sides in staging; never carry an appointment or switch in play', async t => {
  mockTime(t);
  const st = lobby();
  member(st, beta, 'reich');
  st.players[beta.name].title = 'Volunteer';
  assert.equal(e.roomReady(st), false);
  const pristine = copy(st);
  for (const [who, dst] of [
    [ctx(alpha, 'reich'), 'dawn'],
    [{...ctx(beta, 'reich'), account: alpha.account}, 'dawn'],
    [ctx(beta, 'reich'), 'reich']
  ]) {
    assert.ok(e.A.changeFaction(st, who, {team: dst}).err);
    assert.deepEqual(copy(st), pristine);
  }
  for (const grant of [{attackSeat: true}, {role: 'chief'}, {role: 'diplomat'}]) {
    const appointed = copy(st);
    Object.assign(appointed.players[beta.name], grant);
    assert.ok(e.A.changeFaction(appointed, ctx(beta, 'reich'), {team: 'dawn'}).err);
  }
  const guest = await enter(st, session(beta));
  await finishOrder(t, guest.click('lobbyside', {team: 'dawn'}));
  const assembled = guest.game.S;
  assert.equal(assembled.rev, st.rev + 1);
  assert.ok(e.roomReady(assembled) && e.validSave(assembled));
  assert.deepEqual(copy(assembled.players[beta.name]), {
    ...pristine.players[beta.name],
    team: 'dawn',
    title: ''
  });
  assert.deepEqual(copy(assembled.terr), pristine.terr);
  assert.deepEqual(copy(assembled.teams), pristine.teams);
  const race = guest.game.act('changeFaction', {team: 'reich'}),
    launched = copy(assembled);
  e.A.start(launched, ctx(alpha, 'reich'));
  launched.rev++;
  guest.sockets[0].message('state', launched);
  await finishOrder(t, race);
  assert.deepEqual(copy(guest.game.S), copy(launched), 'launch won the race; stale switch did not publish');
  assert.ok(e.A.changeFaction(launched, ctx(beta, 'dawn'), {team: 'reich'}).err);
  assert.match(guest.$('#panel').innerHTML, /Start with field duty/);
});

test('the Orders briefing follows live roles and sends a displaced faction to its own garrison, not its lost HQ', async t => {
  mockTime(t);
  const st = active();
  st.terr.NIG.o = 'reich';
  st.terr.CHA.o = 'dawn';
  const tab = await enter(st, session(beta)),
    panel = () => tab.$('#panel').innerHTML;
  assert.match(panel(), /Start with field duty/);
  assert.ok(panel().includes(`Ask ${alpha.name} to appoint`));
  for (const [role, seat, title] of [
    ['chief', false, 'Prepare your garrison'],
    ['diplomat', false, 'Open negotiations'],
    ['soldier', true, 'Use your attack seat'],
    ['leader', false, 'Lead your faction']
  ]) {
    st.rev++;
    st.players[beta.name].role = role;
    if (seat) st.players[beta.name].attackSeat = true;
    else delete st.players[beta.name].attackSeat;
    tab.sockets[0].message('state', st);
    const card = panel().split('</section>')[0];
    assert.ok(card.includes(title));
    if (role === 'diplomat') assert.ok(card.includes('Open diplomacy'));
    else assert.match(card, /data-act="goto" data-id="CHA"/);
    assert.doesNotMatch(card, /Open Nigeria orders/);
  }
  checkReadOnly(tab);
});

test('presence announces immediately on membership, faction switch and late session restore; Soldier guidance explains command and scouting', async t => {
  mockTime(t);
  const st = lobby();
  member(st, beta, 'reich');
  const presOf = sock =>
    publications(sock)
      .filter(p => p.topic.endsWith('/pres'))
      .map(p => p.data);
  const guest = launch({script, storage: session(beta), identity: beta, relay: 'emqx'});
  const sock = guest.sockets[0];
  sock.subscribe();
  sock.message('state', st);
  assert.equal(presOf(sock).at(-1).name, 'Joining…');
  await guest.game.restoreProfile();
  assert.deepEqual(
    presOf(sock)
      .slice(-1)
      .map(p => [p.name, p.team]),
    [[beta.name, 'reich']]
  );
  // Switching factions in staging announces the new team immediately.
  await finishOrder(t, guest.click('lobbyside', {team: 'dawn'}));
  assert.deepEqual(
    presOf(sock)
      .slice(-1)
      .map(p => [p.name, p.team]),
    [[beta.name, 'dawn']]
  );
  const stagingText = guest.$('#entry').innerHTML;
  assert.match(stagingText, /Black Dawn has no commander yet/);
  // After launch, a Soldier sees clear guidance in Council, Orders (friendly & foreign), and Troops (for Leader & Soldier).
  const launched = copy(guest.game.S);
  e.A.start(launched, ctx(alpha, 'reich'));
  launched.rev++;
  sock.message('state', launched);
  guest.click('tab', {k: 'council'});
  assert.match(guest.$('#panel').innerHTML, /No commander yet\. Ask Amber Fox to appoint this side’s Prophet King/);
  guest.click('sel', {id: 'NIG'});
  assert.match(
    guest.$('#panel').innerHTML,
    /As Soldier you cannot command troops\. Ask Amber Fox to appoint your side’s Prophet King in Council/
  );
  guest.click('sel', {id: 'BER'});
  assert.match(
    guest.$('#panel').innerHTML,
    /As Soldier you can scout with Spy\. Only commanders or an appointed attack seat can attack/
  );
  guest.click('tab', {k: 'troops'});
  assert.match(guest.$('#panel').innerHTML, /Leaders and chiefs of staff can recruit\./);
  const leaderTab = await enter(launched, session(alpha));
  leaderTab.click('sel', {id: 'BER'});
  leaderTab.click('tab', {k: 'troops'});
  assert.match(leaderTab.$('#panel').innerHTML, /Recruiting in Berlin/);
});
