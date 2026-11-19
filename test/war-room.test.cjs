const test = require('node:test');
const assert = require('node:assert/strict');
const {key,prefix,RULES,masterKey,ceiling,flush,now,mockTime,finishOrder,publication,publications,launch,factory,saved,masterySaved,checkReadOnly,enlist,purchaseRoom} = require('../test-support/war-room.cjs');

test('no phantom board during discovery; conflicting saved relays require an explicit selection', async t => {
  mockTime(t);
  const tab = launch({cached:saved(12)}), [fast, slower, empty] = tab.sockets;
  assert.equal(tab.sockets.length, 3);
  assert.equal(new Set(tab.sockets.map(s => s.url)).size, 3);
  assert.equal(tab.game.S, null);
  assert.doesNotMatch(tab.$('#map').innerHTML, /class="node"/);
  assert.match(tab.$('#me').innerHTML, /Syncing/);
  await tab.game.act('enlist', enlist);
  assert.equal(tab.game.S, null);

  fast.subscribe(); empty.subscribe(); slower.open();
  // Interleaved, fragmented packets must not share a receive buffer.
  const old = publication(prefix + 'state', saved(4));
  fast.receive(old.subarray(0, 8)); slower.receive([0x20]); fast.receive(old.subarray(8));
  assert.equal(tab.game.S, null, 'a stale retained state did not become the board');
  slower.receive([2, 0, 0]); slower.receive([0x90, 3, 0, 1, 0]);
  slower.message('state', saved(40));
  assert.equal(tab.game.S, null, 'no provisional troops while comparing independent databases');
  empty.message('sync', {type:'req', from:'other-tab'});
  t.mock.timers.tick(650);
  assert.match(tab.$('#panel').innerHTML, /Choose the shared copy/);
  assert.equal(tab.game.S, null); checkReadOnly(tab);
  assert.equal(JSON.parse(tab.storage.get(key+'|mqtt')).rev, 12, 'original cache left untouched');
  tab.click('pickrelay', {id:'hivemq'});
  const chosen = tab.sockets.at(-1); assert.equal(chosen.url, slower.url);
  chosen.subscribe(); chosen.message('state', saved(40));
  assert.match(tab.$('#me').innerHTML, /Live/);
  assert.equal(tab.game.S.players.Veteran.title, 'Saved post #40');
  assert.equal(JSON.parse(tab.storage.get(key+'|mqtt|hivemq')).teams.dawn.res.gold, 240);
  chosen.message('sync', {type:'res', state:saved(24)});
  assert.equal(tab.game.S.rev, 40);
  assert.ok(tab.sockets.every(s => publications(s).some(p => p.topic === prefix + 'sync' && p.data.type === 'req')));
  checkReadOnly(tab);

  const order = tab.game.act('enlist', enlist); await finishOrder(t,order);
  const writes = tab.sockets.flatMap(publications).filter(p => p.retain);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].topic, prefix + 'state');
  assert.equal(writes[0].data.rev, 41);
  assert.equal(writes[0].data.players.Veteran.title, 'Saved post #40');
  assert.ok(writes[0].data.players[enlist.name]);
});

test('a bare websocket, a refused subscription and an unreachable relay fail over together; stale callbacks are inert', t => {
  mockTime(t);
  const tab = launch(), [stalled, refused, down] = tab.sockets;
  const lateClose = down.onclose, lateMessage = stalled.onmessage;
  stalled.open(); refused.open(); refused.receive([0x20, 2, 0, 0]); refused.receive([0x90, 3, 0, 1, 128]);
  down.onerror(); lateClose();
  t.mock.timers.tick(2000);
  assert.equal(tab.game.S, null, 'no invented offline campaign');
  assert.match(tab.$('#me').innerHTML, /Offline/);
  assert.equal(tab.storage.get(key+'|mqtt'), undefined);
  t.mock.timers.tick(350);
  assert.equal(tab.sockets.length, 6, 'one bounded retry, not one per failure event');
  const [a,b,c] = tab.sockets.slice(3);
  a.onerror(); b.subscribe(); c.onerror(); b.message('state', saved(33));
  lateClose(); lateMessage({data:Uint8Array.from(publication(prefix + 'state', saved(100))).buffer});
  t.mock.timers.tick(3000);
  assert.equal(tab.sockets.length, 6); assert.equal(tab.game.S, null);
  assert.match(tab.$('#panel').innerHTML, /Choose the shared copy/);
  tab.click('pickrelay',{id:'hivemq'});
  const pinned = tab.sockets.at(-1); pinned.subscribe(); pinned.message('state',saved(33));
  assert.equal(tab.game.S.rev, 33); checkReadOnly(tab);
  pinned.close(); t.mock.timers.tick(350);
  assert.equal(tab.sockets.length, 8, 'reconnect only to the confirmed relay');
  assert.equal(tab.sockets.at(-1).url, b.url);
  assert.equal(tab.game.S.rev, 33); checkReadOnly(tab);
});

test('broker silence never retains a cache or new game; a late verified snapshot supplies the first board', async t => {
  mockTime(t);
  for(const cached of [undefined, saved(2)]){
    const tab = launch({cached}); tab.sockets.forEach(s => s.subscribe());
    t.mock.timers.tick(1000);
    assert.deepEqual(tab.sockets.map(s => s.readyState), [1, 1, 1], 'silence cannot select an empty fallback');
    assert.equal(tab.game.S, null);
    tab.sockets[0].message('sync', {type:'req', from:'peer'});
    const noop = tab.game.act('noop'); await finishOrder(t,noop);
    assert.ok(!tab.sockets.flatMap(publications).some(p => p.data.type === 'res'));
    if(!cached) assert.equal(tab.storage.get(key+'|mqtt'), undefined);
    const remote = saved(cached ? 8 : 1); remote.created = now + 10000;
    // Verify the other brokers are empty, rather than silently picking the first reachable one.
    for(const s of tab.sockets.slice(1)) s.message('sync',publications(s).find(p => p.data.type === 'req').data);
    tab.sockets[0].message('state', remote);
    assert.equal(tab.game.S.created, remote.created, 'even a same-revision real state beats a synthetic starting map');
    assert.ok(tab.game.S.players.Veteran); checkReadOnly(tab);
  }
});

test('an empty room is playable: only the first explicit order persists the starting map', async t => {
  mockTime(t);
  const tab = launch({cached:'{broken'}); tab.sockets.forEach(s => s.subscribe());
  t.mock.timers.tick(650); checkReadOnly(tab);
  const tooSoon = tab.game.act('enlist', enlist); await finishOrder(t,tooSoon);
  checkReadOnly(tab); assert.equal(tab.game.S, null, 'a timeout alone is not a read barrier');
  for(const s of tab.sockets){ const request = publications(s).find(p => p.data.type === 'req'); s.message('sync',request.data); } // A real MQTT 3.1.1 subscriber receives its own request.
  const preview = structuredClone(tab.game.S.terr);
  const held = team => Object.keys(preview).filter(id => preview[id].o === team);
  assert.deepEqual(held('reich'), ['BER']); assert.deepEqual(held('dawn'), ['NIG']);
  assert.equal(held('neutral').length, 145); checkReadOnly(tab);
  const order = tab.game.act('enlist', enlist); await finishOrder(t,order);
  assert.deepEqual(structuredClone(tab.game.S.terr), preview);
  assert.equal(tab.game.S.capitalStart, true);
  assert.equal(tab.game.S.rev, 2); assert.ok(tab.game.S.players[enlist.name]);
  assert.equal(publications(tab.sockets[0]).filter(p => p.retain).length, 1);
});

test('manual retry and room changes cancel pending probes, handlers and retry timers', t => {
  mockTime(t);
  const tab = launch({cached:saved(6)}), old = tab.sockets[0].onmessage;
  tab.click('reconnect'); assert.equal(tab.sockets.length, 6);
  tab.sockets.slice(3).forEach(s => s.onerror());
  tab.$('#roomin').value = 'another-test'; tab.click('joinroom');
  assert.ok(tab.channels.every(c => c.closed)); assert.equal(tab.game.S, null);
  const s = tab.sockets.slice(6); s.forEach(r => r.subscribe());
  s.slice(1).forEach(r => r.message('sync',publications(r).find(p => p.data.type === 'req').data));
  s[0].receive(publication('lands-eot/v1/another-test:mastery-1/state', saved(9)));
  old({data:Uint8Array.from(publication(prefix + 'state', saved(99))).buffer});
  t.mock.timers.tick(5000);
  assert.equal(tab.sockets.length, 9); assert.equal(tab.game.S.rev, 9);
  assert.equal(JSON.parse(tab.storage.get(key+'|mqtt')).rev, 6);
  checkReadOnly(tab);
});

test('an older-format live room is not migrated, reset, or replaced with the cache', async t => {
  mockTime(t);
  const tab = launch({cached:saved(3)}), legacy = saved(90); legacy.v = 5;
  tab.sockets.forEach(s => { s.subscribe(); s.message('state', legacy); });
  assert.match(tab.$('#banner').innerHTML, /Incompatible/);
  await tab.game.act('enlist', enlist);
  assert.equal(tab.game.S, null); checkReadOnly(tab);
  assert.equal(JSON.parse(tab.storage.get(key+'|mqtt')).rev, 3);
});

test('Firebase waits for the server; a conflicting conditional write cannot overwrite newer progress', async t => {
  mockTime(t);
  const calls = []; let finishRead;
  const ok = data => ({ok:true, json:async () => data, headers:{get:name => name === 'etag' ? '"rev-42"' : null}});
  const fetch = async (url, options = {}) => {
    calls.push({url, ...options});
    if(url.endsWith('/lock.json')) return ok(null);
    if(options.method === 'PUT') return {ok:false, status:412};
    if(options.headers['X-Firebase-ETag']) return ok(saved(42));
    return new Promise(resolve => { finishRead = resolve; });
  };
  const tab = launch({cached:saved(5), fb:true, fetch});
  assert.equal(tab.game.S, null); assert.match(tab.$('#me').innerHTML, /Syncing/);
  await tab.game.act('enlist', enlist); assert.equal(calls.length, 1);
  finishRead(ok(saved(42))); await flush();
  assert.equal(tab.game.S.rev, 42); assert.equal(calls.length, 1);
  await tab.game.act('enlist', enlist);
  assert.equal(calls.findLast(c => c.method === 'PUT' && c.url.endsWith('/state.json')).headers['if-match'], '"rev-42"');
  assert.equal(tab.game.S.rev, 42); assert.ok(!tab.game.S.players[enlist.name]);
  assert.equal(JSON.parse(tab.storage.get(key+'|https://fixture.firebaseio.com')).rev, 42); checkReadOnly(tab);
});

test('Firebase read failures are not empty rooms and do not trigger writes', async t => {
  mockTime(t);
  const calls = [], tab = launch({fb:true, cached:saved(8), fetch:async (url, options) => { calls.push(options); return {ok:false, status:403}; }});
  await flush(); t.mock.timers.tick(2600); await flush();
  assert.equal(tab.game.S, null); assert.match(tab.$('#me').innerHTML, /Offline/);
  assert.ok(calls.length >= 2 && calls.every(o => !o.method || o.method === 'GET')); checkReadOnly(tab);
});

test('a stalled broker times out; peer updates can pause, but never authorize an order', async t => {
  mockTime(t);
  const tab = launch({cached:{v:6, terr:{}, teams:{}}}), [good, refused] = tab.sockets;
  assert.equal(tab.game.S, null, 'an incomplete cache is a miss, not a boot failure');
  good.subscribe(); good.message('state', saved(15)); refused.open(); refused.receive([0x20, 2, 0, 5]);
  assert.equal(tab.game.S, null, 'candidate has not been selected');
  t.mock.timers.tick(2000);
  assert.match(tab.$('#panel').innerHTML, /Choose the shared copy/);
  tab.click('pickrelay',{id:'emqx'});
  const pinned = tab.sockets.at(-1); pinned.subscribe(); pinned.message('state',saved(15));
  assert.match(tab.$('#me').innerHTML, /Live/);
  tab.channels[0].onmessage({data:{sub:'state', obj:saved(16)}});
  pinned.message('state', saved(14)); checkReadOnly(tab);
  await finishOrder(t,tab.game.act('enlist',enlist)); checkReadOnly(tab);
  assert.equal(tab.game.S.rev,15, 'last confirmed board, not peer 16 or stale 14');
  pinned.message('state',saved(16));
  const order = tab.game.act('enlist', enlist); await finishOrder(t,order);
  assert.equal(tab.game.S.rev, 17);
  assert.equal(tab.game.S.players.Veteran.title, 'Saved post #16');
});

test('a slow shared DB capability does not display an unscoped cache or roll back a newer snapshot', async t => {
  mockTime(t);
  let resolveCapability, emit;
  const tab = launch({cached:saved(10), claude:{use:() => new Promise(resolve => { resolveCapability = resolve; })}});
  assert.equal(tab.game.S, null); assert.match(tab.$('#me').innerHTML, /Syncing/);
  resolveCapability({doc:() => ({onSnapshot:cb => { emit = cb; }})}); await flush();
  for(const rev of [31, 12]) emit({exists:true, data:() => saved(rev)});
  assert.equal(tab.game.S.rev, 31); assert.equal(tab.sockets.length, 0); checkReadOnly(tab);
});

for(const team of ['reich','dawn']) test(`${team} research unlocks with passive income and charges the displayed price once`, async t => {
  mockTime(t);
  const st = saved(30); st.t = now;
  const T = st.teams[team], ctx = {team, now, name:team === 'reich' ? 'DEB' : 'Anish'}, payload = {k:'ind', rank:1, quote:factory.researchCost(st, team, 1)};
  const upgraded = structuredClone(st), projected = structuredClone(st);
  assert.ok(factory.A.research(upgraded, ctx, payload).ok);
  const steel = T.res.steel - upgraded.teams[team].res.steel, gold = T.res.gold - upgraded.teams[team].res.gold;
  factory.tick(projected, now + 1000);
  T.res.steel = steel - 1.5 * (projected.teams[team].res.steel - T.res.steel);
  const {tab, controls} = purchaseRoom(st, team);
  tab.click('tab', {k:'tech'});
  const button = () => controls().find(el => el.dataset.act === 'research' && el.dataset.k === 'ind');
  const label = controls().find(el => el.tagName === 'SPAN' && +el.dataset.steel === steel);
  assert.equal(button().disabled, true); assert.equal(label.classList.no, true);
  t.mock.timers.tick(2000); // No snap, user action, or tab change.
  assert.match(tab.$('#hud').innerHTML, new RegExp('Steel</span><span class="v">' + steel + '</span>'));
  assert.equal(button().disabled, false); assert.equal(label.classList.no, false);
  assert.equal(tab.game.S.t, now); assert.equal(tab.game.S.teams[team].res.steel, T.res.steel); checkReadOnly(tab);

  const order = tab.game.act('research', payload); await finishOrder(t,order);
  const expected = structuredClone(st); factory.tick(expected, tab.game.S.t);
  assert.equal(tab.game.S.teams[team].res.steel, expected.teams[team].res.steel - steel);
  assert.equal(tab.game.S.teams[team].res.gold, expected.teams[team].res.gold - gold);
  assert.equal(tab.game.S.teams[team].tech.ind, 1); assert.equal(tab.game.S.rev, 31);
  assert.equal(tab.sockets.flatMap(publications).filter(p => p.retain).length, 1);
  assert.equal(button().disabled, true, 'the next level is no longer affordable');
});

test('recruit buttons track full batch cost and command points, and a newer room balance still wins', async t => {
  mockTime(t);
  const st = saved(15); st.t = now;
  const T = st.teams.reich, projected = structuredClone(st); factory.tick(projected, now + 1000);
  T.res.man = 50 - 2.5 * (projected.teams.reich.res.man - T.res.man);
  const {tab, controls, relay} = purchaseRoom(st, 'reich', 'chief', 0.97);
  const buy = (n,u = 'inf') => controls().find(el => el.dataset.act === 'recruit' && el.dataset.u === u && +el.dataset.n === n);
  tab.click('sel', {id:'BER'});
  tab.click('recruitlist');
  assert.equal(buy(1).disabled, true, 'needs one command point');
  t.mock.timers.tick(1000); assert.equal(buy(1).disabled, false); assert.equal(buy(5).disabled, true);
  tab.click('tab', {k:'troops'}); assert.equal(buy(1).disabled, false); assert.equal(buy(5).disabled, true);
  t.mock.timers.tick(2000); assert.equal(buy(5).disabled, false); assert.equal(buy(1,'rk_maus').disabled, true, 'still tech locked');
  const order = tab.game.act('recruit', {tid:'BER', unit:'inf', n:5, quote:factory.recruitCost(st, 'reich', 'inf', 5)});
  const spent = structuredClone(st); spent.rev++; spent.t = Date.now(); spent.teams.reich.res.man = 0; spent.players['Test chief'].cp = 4;
  relay.message('state', spent); // A teammate spent the balance while we waited for the lock.
  await finishOrder(t,order);
  assert.equal(tab.game.S.rev, spent.rev); assert.equal(tab.game.S.terr.BER.u.inf, st.terr.BER.u.inf);
  assert.equal(buy(1).disabled, true); checkReadOnly(tab);
});

for(const [team, unit] of [['reich','inf'],['dawn','bd_init']]) test(`${team} formation research: a Mastery room can browse, accrue funds, buy and reload one rank`, async t => {
  mockTime(t);
  const st = masterySaved(42), T = st.teams[team]; st.t = now; T.res.steel = 0;
  const {tab, controls} = purchaseRoom(st, team);
  tab.click('tab', {k:'tech'}); tab.click('researchbranch', {k:'mastery'});
  const abilities = () => controls().filter(el => el.dataset.act === 'mastery');
  const button = () => abilities().find(el => el.dataset.u === unit && el.dataset.skill === 'atk');
  assert.equal(abilities().length, 4); assert.equal(button().disabled, true);
  assert.equal(tab.game.S.teams[team].mastery, undefined);
  const price = button().dataset, minute = structuredClone(st); factory.tick(minute, now + 60000);
  assert.deepEqual([price.gold, price.steel, price.oil], team === 'reich' ? ['6','9',undefined] : ['5','8',undefined]);
  t.mock.timers.tick(1000 + Math.ceil(60000 * Number(price.steel) / minute.teams[team].res.steel));
  assert.equal(button().disabled, false); checkReadOnly(tab);
  const buy = tab.click('mastery', price); await finishOrder(t,buy);
  const beforePayment = structuredClone(st); factory.tick(beforePayment, tab.game.S.t);
  const result = tab.game.S, side = result.teams[team];
  assert.equal(side.res.gold, beforePayment.teams[team].res.gold - Number(price.gold));
  assert.equal(side.res.steel, beforePayment.teams[team].res.steel - Number(price.steel));
  assert.deepEqual(structuredClone(side.mastery), {[unit]:{atk:1}});
  assert.deepEqual(structuredClone(side.tech), structuredClone(T.tech)); assert.ok(result.players.Veteran);
  assert.equal(result.rev, 43); assert.equal(result.v, 7); const next = button().dataset;
  assert.equal(next.rank, '2'); assert.deepEqual([next.gold, next.steel, next.oil], team === 'reich' ? ['12','18','6'] : ['10','15','5']);
  assert.equal(tab.sockets.flatMap(publications).filter(p => p.retain).length, 1);
  const restored = launch({storage:tab.storage, url:tab.location.href}); assert.equal(restored.game.S, null);
  const socket = restored.sockets[0]; socket.subscribe(); socket.message('state',JSON.parse(tab.storage.get(masterKey)));
  assert.equal(restored.game.S.teams[team].mastery[unit].atk, 1); checkReadOnly(restored);
  const locked = team === 'reich' ? 'rk_p1500' : 'bd_gsyn'; tab.change('masteryunit', locked);
  assert.equal(abilities().length, 4); assert.ok(abilities().every(el => el.dataset.u === locked && el.disabled));
  tab.click('researchbranch', {k:'doctrine'}); assert.ok(controls().some(el => el.dataset.act === 'research'));
});

test('every formation in both Troops rosters is selectable and can master all four abilities', t => {
  mockTime(t);
  for(const team of ['reich', 'dawn']){
    const st = masterySaved(70), T = st.teams[team];
    Object.keys(T.tech).forEach(k => T.tech[k] = 4); Object.keys(T.res).forEach(k => T.res[k] = 1000000);
    const {tab, controls, relay} = purchaseRoom(st, team);
    tab.click('tab', {k:'troops'});
    const roster = controls().filter(el => el.dataset.act === 'showmastery').map(el => el.dataset.u);
    tab.click('showmastery', {u:roster[0]});
    const options = Array.from(tab.$('#panel').innerHTML.matchAll(/<option value="([^"]+)"/g), m => m[1]);
    assert.ok(roster.length > 0); assert.deepEqual(options.sort(), roster.sort());
    for(const unit of roster) for(let rank = 1; rank <= 5; rank++) for(const skill of ['atk','def','vit','talent']){
      const result = factory.A.mastery(st, {team, name:'Test chief', now}, {unit, skill, rank, quote:ceiling});
      assert.ok(result.ok, `${unit} ${skill} ${rank}: ${result.err}`);
    }
    st.rev++; relay.message('state', st);
    assert.equal(controls().filter(el => el.dataset.act === 'mastery').length, 0);
    assert.equal((tab.$('#panel').innerHTML.match(/>Mastered</g) || []).length, 4);
    assert.match(tab.$('#panel').innerHTML, /20\/20 ranks/); checkReadOnly(tab);
  }
});

test('mastery rejects unmet requirements, skipped/stale ranks, invalid keys, foreign units, insufficient funds and maxed skills without spending', () => {
  const st = masterySaved(8), side = st.teams.reich, ctx = {team:'reich', name:'Test leader', now};
  st.players[ctx.name] = {role:'leader', team:'reich', cp:10}; side.res = {steel:10000, gold:10000, oil:10000, man:10000};
  const train = (unit, skill, rank) => factory.A.mastery(st, ctx, {unit, skill, rank, quote:ceiling});
  const reject = (u, k, rank, why) => { const before = JSON.stringify(st); assert.match(train(u,k,rank).err, why); assert.equal(JSON.stringify(st),before); };
  reject('rk_p1500','atk',1,/Requires Armor level 4/); reject('bd_init','atk',1,/faction/);
  reject('inf','__proto__',1,/ability/); reject('constructor','def',1,/formation/); reject('inf','atk',2,/rank changed/);
  reject('inf','talent',1,/Infantry doctrine level 2/); side.tech.inf = 2;
  reject('inf','talent',1,/Attack and Defense rank 1/);
  for(let rank=1; rank<=5; rank++){
    assert.ok(train('inf','atk',rank).ok); assert.ok(train('inf','def',rank).ok); assert.ok(train('inf','talent',rank).ok);
  }
  reject('inf','talent',6,/already mastered/); assert.equal(side.mastery.inf.talent, 5);
  side.res.gold = 0; reject('inf','vit',1,/resources/);
  assert.equal(st.teams.dawn.mastery, undefined);
});

test('mastery is read-only for soldiers; an order cannot override a concurrent purchase, demotion or spend', async t => {
  mockTime(t);
  const read = purchaseRoom(masterySaved(5), 'reich', 'soldier'); read.tab.click('showmastery', {u:'inf'});
  assert.ok(read.controls().find(el => el.dataset.act === 'mastery' && el.dataset.skill === 'atk').disabled);
  const payload = {unit:'inf', skill:'atk', rank:1, quote:ceiling};
  await read.tab.game.act('mastery', payload); checkReadOnly(read.tab);
  for(const change of [s => s.teams.reich.mastery = {inf:{atk:1}}, s => s.players['Test chief'].role = 'soldier', s => s.teams.reich.res.gold = 0]){
    const st = masterySaved(9), {tab, relay} = purchaseRoom(st, 'reich');
    const order = tab.game.act('mastery', payload);
    const updated = structuredClone(st); updated.rev++; updated.t = Date.now(); change(updated);
    relay.message('state', updated); await finishOrder(t,order);
    assert.equal(tab.game.S.rev, updated.rev); assert.deepEqual(structuredClone(tab.game.S.teams.reich), updated.teams.reich); checkReadOnly(tab);
  }
});

// Compare the actual combat resolver with identical rolls, not just the values on the cards.
function skirmish({team='reich', foe='neutral', grp={inf:1000}, garrison={inf:1000}, study={}, enemyStudy={}, tactic='frontal', to='LOR'} = {}){
  const st = factory.newGame(now), from = factory.ADJ[to].find(n => !n.sea).id;
  st.terr[from] = {o:team, u:{...grp}, f:0, st:'bunker'}; st.terr[to] = {o:foe, u:{...garrison}, f:0, st:'bunker'};
  Object.assign(st.teams[team].tech, {inf:2, art:2, arm:2, air:2}); st.teams[team].res.oil = 10000;
  st.teams[team].mastery = study; if(foe !== 'neutral') st.teams[foe].mastery = enemyStudy;
  const r = factory.A.attack(st, {team, name:team === 'reich' ? 'DEB' : 'Anish', now}, {grp, from, to, tactic}); assert.ok(r.ok, r.err);
  return structuredClone({att:st.terr[r.battle ? to : from].u, def:r.battle ? {} : st.terr[to].u});
}
test('core ranks only affect the trained formation and the side using it', () => {
  const base = skirmish(); assert.ok(skirmish({study:{inf:{atk:5}}}).att.inf > base.att.inf);
  assert.deepEqual(skirmish({study:{rk_mp40:{atk:5},inf:{def:5}}}), base);
  const defended = {foe:'dawn', garrison:{bd_init:1000}};
  assert.ok(skirmish({...defended, enemyStudy:{bd_init:{def:5}}}).att.inf < skirmish(defended).att.inf);
  assert.deepEqual(skirmish({...defended, enemyStudy:{bd_init:{atk:5}}}), skirmish(defended));
  const grp = {inf:1000, rk_mp40:300}, normal = skirmish({grp}), hardy = skirmish({grp, study:{inf:{vit:5}}});
  assert.ok(hardy.att.inf > normal.att.inf); assert.equal(hardy.att.rk_mp40, normal.att.rk_mp40);
  assert.ok(skirmish({...defended, enemyStudy:{bd_init:{vit:5}}}).def.bd_init > skirmish(defended).def.bd_init);
});
test('formation talents modify matching tactics, coastal defense or specialist recruitment, not unrelated play', () => {
  for(const [unit,tactic] of [['inf','flank'],['art','barrage'],['arm','blitz'],['air','air']]){
    const grp = {[unit]:1000}, study = {[unit]:{talent:5}};
    assert.ok(skirmish({grp,tactic,study}).att[unit] > skirmish({grp,tactic}).att[unit]);
    assert.deepEqual(skirmish({grp,study}), skirmish({grp}));
  }
  const nav = {team:'dawn', foe:'reich', grp:{bd_oath:1000}, garrison:{rk_mboat:1000}}, enemyStudy = {rk_mboat:{talent:5}};
  assert.ok(skirmish({...nav, to:'FRN', enemyStudy}).att.bd_oath < skirmish({...nav, to:'FRN'}).att.bd_oath);
  assert.deepEqual(skirmish({...nav,enemyStudy}), skirmish(nav));
  const fee = (unit, mastery) => {
    const st = masterySaved(1), T = st.teams.dawn, gold = T.res.gold; T.mastery = mastery;
    assert.ok(factory.A.recruit(st,{team:'dawn',name:'Anish',now},{unit,n:1,tid:'BUC',quote:ceiling}).ok); return gold - T.res.gold;
  };
  assert.equal(fee('bd_arch',{bd_arch:{talent:5}}),Math.round(fee('bd_arch',{}) * 0.75));
  assert.equal(fee('bd_whis',{bd_arch:{talent:5}}),fee('bd_whis',{}));
});
