// The UI is a preview; the locked engine must not trust typed amounts or stale balances.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  factory,
  saved,
  now,
  mockTime,
  purchaseRoom,
  finishOrder,
  checkReadOnly
} = require('../test-support/war-room.cjs');
const trade = (g = 8, w = 12) => ({type: 'trade', give: {r: 'oil', n: g}, get: {r: 'steel', n: w}});
const ctx = (team, name) => ({team, name, now});
const sender = ctx('dawn', 'Sender'),
  recipient = ctx('reich', 'Buyer');
function board() {
  const st = saved(41);
  st.t = now;
  for (const c of [sender, recipient])
    st.players[c.name] = {team: c.team, role: 'diplomat', cp: 10, cd: 0, pw: 'fixture'};
  return st;
}

test('invalid or unaffordable terms never spend CP, claim a proposal number, or round down to zero', () => {
  const st = board(),
    before = structuredClone(st);
  for (const p of [
    trade(0.25),
    trade(0),
    trade(5.5),
    trade(4, -2),
    trade(NaN),
    trade(4, Infinity),
    trade(4, Number.MAX_SAFE_INTEGER + 1),
    trade(st.teams.dawn.res.oil + 1),
    {...trade(), get: {r: 'oil', n: 1}},
    {...trade(), give: null},
    {type: 'other'}
  ]) {
    assert.ok(factory.A.propose(st, sender, p).err);
    assert.deepEqual(structuredClone(st), before);
  }
  assert.ok(factory.A.propose(st, sender, trade()).ok);
  assert.equal(st.players.Sender.cp, 9);
  assert.equal(st.pid, 2);
  assert.deepEqual(structuredClone(st.props[0].give), {r: 'oil', n: 8});
  assert.ok(factory.A.propose(st, sender, trade(8, 2)).err);
  assert.equal(st.players.Sender.cp, 9);
  assert.ok(factory.A.answer(st, sender, {id: 1, accept: true}).err);
  assert.ok(factory.A.answer(st, recipient, {id: 1, accept: true}).ok);
  const after = structuredClone(st);
  assert.equal(st.teams.reich.res.steel, before.teams.reich.res.steel - 12);
  assert.equal(st.teams.reich.res.oil, before.teams.reich.res.oil + 8);
  assert.equal(st.teams.dawn.res.oil, before.teams.dawn.res.oil - 8);
  assert.ok(st.teams.dawn.res.steel >= before.teams.dawn.res.steel + 12, 'Dawn keeps its trade bonus');
  assert.ok(factory.A.answer(st, recipient, {id: 1, accept: true}).err);
  assert.deepEqual(structuredClone(st), after);
});

test('an older zero-amount offer can be read and rejected, never accepted; the recipient can wait for its own funds', async t => {
  mockTime(t);
  for (const zero of [true, false]) {
    const st = board();
    st.teams.reich.res.steel = 0;
    factory.A.propose(st, sender, trade());
    if (zero) st.props[0].give.n = 0;
    const {tab} = purchaseRoom(st, 'reich', 'diplomat');
    assert.equal(tab.game.S.rev, 41, 'older saves stay readable');
    await finishOrder(t, tab.game.act('answer', {id: 1, accept: true}));
    checkReadOnly(tab);
    assert.equal(tab.game.S.props[0].open, true);
    assert.match(tab.$('#toasts').children.at(-1).textContent, zero ? /Invalid trade terms/ : /cannot cover/);
    await finishOrder(t, tab.game.act('answer', {id: 1}));
    assert.equal(tab.game.S.props[0].open, false);
    assert.equal(tab.game.S.rev, 42);
  }
});

test('accept rereads both budgets: a stale offer closes exactly once without an exchange', async t => {
  mockTime(t);
  const st = board();
  factory.A.propose(st, sender, trade());
  const {tab, relay} = purchaseRoom(st, 'reich', 'diplomat');
  const attempt = tab.game.act('answer', {id: 1, accept: true}),
    newer = structuredClone(st);
  newer.rev++;
  newer.teams.dawn.res.oil = 0;
  relay.message('state', newer);
  await finishOrder(t, attempt);
  const end = tab.game.S,
    base = structuredClone(newer);
  factory.tick(base, end.t);
  assert.equal(end.rev, 43);
  assert.equal(end.props[0].open, false);
  assert.deepEqual(structuredClone(end.teams), base.teams);
  assert.deepEqual(structuredClone(end.players), base.players);
  assert.match(end.log[0].msg, /Nothing was exchanged/);
  await finishOrder(t, tab.game.act('answer', {id: 1, accept: true}));
  assert.equal(tab.game.S.rev, 43);
});

test('the 20-proposal history limit prunes closed entries, never a pending offer', () => {
  const st = board();
  factory.A.propose(st, sender, trade());
  for (let i = 0; i < 24; i++) {
    st.players.Buyer.cp = 10;
    assert.ok(factory.A.propose(st, recipient, {type: 'ceasefire', mins: 60}).ok);
    assert.ok(factory.A.answer(st, recipient, {id: st.pid - 1, cancel: true}).ok);
  }
  assert.equal(st.props.length, 20);
  assert.equal(st.props[0].id, 1);
  assert.equal(st.props[0].open, true);
  assert.ok(factory.A.answer(st, recipient, {id: 1, accept: true}).ok);
});
