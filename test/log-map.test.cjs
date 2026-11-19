const test = require('node:test');
const assert = require('node:assert/strict');
const {
  launch,
  inspect,
  saved,
  masterySaved,
  now,
  ceiling,
  mockTime,
  checkReadOnly
} = require('../test-support/war-room.cjs');
const copy = structuredClone;
let roll = 0.5;
const {game: g} = launch({
  script: inspect(['logMessageHtml', 'advanceFront', 'drillCap', 'COUNTRIES', 'validSave']),
  random: () => roll,
  timers: {setInterval() {}, setTimeout() {}}
});
const links = html =>
  Array.from(html.matchAll(/<button [^>]*data-act="goto" data-id="(\w+)"[^>]*>([^<]*)<\/button>/g), m => [
    m[1],
    m[2]
  ]);

test('location-bearing orders record their actual map IDs; earlier plain-text copies of the same reports still navigate', () => {
  const ctx = {name: 'Berlin', team: 'reich', now}; // an officer can share a city name
  const cases = [
    ['recruit', {tid: 'BER', unit: 'inf', n: 1, quote: ceiling}],
    ['fort', {tid: 'BER', rank: 2, quote: ceiling}],
    ['stance', {tid: 'BER', st: 'elastic'}],
    ['move', {from: 'RIO', to: 'BSB', grp: {inf: 1}}],
    ['annex', {tid: 'WDC', quote: ceiling}],
    ...['spy', 'honey', 'sabotage', 'decap'].flatMap(order => [0, 0.99].map(r => [order, {tid: 'CHA'}, r]))
  ];
  for (const [name, p, r] of cases) {
    roll = r ?? 0.5;
    const s = saved(12);
    s.players.Berlin = {...s.players.DEB};
    s.teams.reich.tech.intel = 4;
    s.teams.reich.res.gold = 1000;
    s.terr.RIO.o = s.terr.BSB.o = s.terr.NYC.o = 'reich';
    s.terr.RIO.u = {inf: 2};
    s.terr.WDC.u = {};
    const result = g.A[name](s, ctx, p);
    assert.ok(result.ok, name + ': ' + result.err);
    const l = s.log[0],
      dest = p.tid || p.to;
    assert.equal(l.tid, dest);
    assert.equal(l.from, p.from);
    const ids = l.from ? [l.from, dest] : [dest];
    const html = g.logMessageHtml(l);
    assert.deepEqual(
      links(html).map(([id]) => id),
      ids,
      l.msg
    );
    const legacy = {...l};
    delete legacy.tid;
    delete legacy.from;
    assert.equal(g.logMessageHtml(legacy), html, l.msg);
    if (name === 'recruit') assert.match(html, /^Berlin raised/, 'the officer is not the map link');
    if (p.tid === 'CHA') assert.match(html, /N&#39;Djamena<\/button>/);
  }
  roll = 0.5;
});

test('expedition and resistance dispatches link countries to the battle, not a home capital; origin is separate', () => {
  const msg =
    'USA captured Mexico City from Dawn. Expedition from Washington D.C.: 10 sent, 1 lost; 2 defenders lost.';
  assert.deepEqual(links(g.logMessageHtml({kind: 'front', country: 'USA', tid: 'MEX', from: 'WDC', msg})), [
    ['MEX', 'USA'],
    ['MEX', 'Mexico City'],
    ['WDC', 'Washington D.C.']
  ]);
  assert.deepEqual(
    links(
      g.logMessageHtml({
        kind: 'front',
        country: 'PER',
        tid: 'PER',
        msg: 'Peru was repelled by Brazil trying to reclaim its capital, Lima. Local resistance: 6 sent, 3 lost; 1 defenders lost.'
      })
    ),
    [
      ['PER', 'Peru'],
      ['PER', 'Brazil'],
      ['PER', 'Lima']
    ]
  );
  assert.deepEqual(
    links(g.logMessageHtml({kind: 'battle', tid: 'PAR', msg: 'Paris took Paris from neutral forces.'})),
    [['PAR', 'Paris']]
  );
  assert.deepEqual(links(g.logMessageHtml({kind: 'win', msg: 'Black Dawn wins the war. Berlin has fallen.'})), [
    ['BER', 'Berlin']
  ]);
  for (const msg of [
    'Rome enlists with The Reich.',
    'Coastal watch rank 5/5.',
    'Independent powers held their ground.'
  ]) {
    assert.equal(g.logMessageHtml({msg}), msg);
  }
  assert.equal(g.logMessageHtml({tid: 'constructor', msg: '<unknown> event'}), '&lt;unknown&gt; event');
  assert.deepEqual(links(g.logMessageHtml({tid: ['PAR'], msg: 'Paris fortified to level 1.'})), []);
  assert.match(
    g.logMessageHtml({tid: 'PAR', msg: 'A <visitor> took Paris.'}),
    /^A &lt;visitor&gt; took <button/
  );
});

test('a new quiet-turn report snapshots only affected countries, prioritizing real resistance or garrison sites', () => {
  const s = saved(20);
  for (const c of Object.values(g.COUNTRIES)) for (const id of c.homes) s.terr[id].o = 'neutral';
  s.terr.ICE.o = 'dawn'; // no Icelandic source army; resistance recruits in the occupied capital
  // Saturate every held garrison but drain a non-capital. No drill at the rank cap.
  const full = Object.fromEntries(Object.keys(g.COUNTRIES).map(k => [k, g.drillCap(k)]));
  s.front = {turn: 10, at: now - 90000, drill: full};
  for (const t of Object.values(s.terr))
    if (t.o === 'neutral') t.u = {inf: 100, arm: 100, air: 100, art: 100, nav: 100};
  s.terr.OSA.u = {};
  assert.ok(g.advanceFront(s, now, 10));
  const l = s.log[0];
  assert.equal(l.tid, undefined);
  assert.deepEqual(copy(l.sites), {JPN: 'OSA', ISL: 'ICE'});
  s.terr.OSA.o = 'reich';
  assert.equal(l.sites.JPN, 'OSA', 'history does not move to Tokyo after a border change');
  assert.ok(g.validSave(s));
});

for (const make of [saved, masterySaved])
  test(`${make === saved ? 'Classic' : 'Mastery'} Log: links center and select, keep the log, respect visibility and never write`, t => {
    mockTime(t);
    const st = make(50);
    st.players.Reader = {team: 'dawn', role: 'soldier', pw: 'fixture', cp: 10};
    st.log = [
      {kind: 'battle', vis: 'all', t: now, tid: 'MOS', msg: 'Battle at Moscow.'},
      {kind: 'intel', vis: 'reich', t: now, tid: 'WDC', msg: 'Private report from Washington D.C.'},
      {kind: 'info', vis: 'dawn', t: now, tid: 'CHA', msg: "Agents report from N'Djamena."},
      {
        kind: 'front',
        vis: 'all',
        t: now,
        sites: {JPN: 'OSA', ISL: 'ICE', France: 'PAR', BRA: 'not-a-place'},
        msg: 'Independent powers held their ground.'
      },
      {kind: 'front', vis: 'all', t: now - 90000, msg: 'Earlier worldwide report.'}
    ];
    for (const identity of [{name: 'Reader', ph: 'fixture'}, {name: '__spectator'}]) {
      const tab = launch({cached: st, rules: st.ruleset, identity, relay: 'emqx'});
      const [relay] = tab.sockets;
      relay.subscribe();
      relay.message('state', st);
      tab.click('tab', {k: 'log'});
      const panel = tab.$('#panel'),
        html = panel.innerHTML;
      assert.doesNotMatch(html, /Private report|Washington D.C./);
      assert.equal(html.includes('Agents report'), identity.name === 'Reader');
      assert.match(html, /Countries active this turn \(2\)/);
      assert.deepEqual(
        links(html).map(([id]) => id),
        identity.name === 'Reader' ? ['MOS', 'CHA'] : ['MOS']
      );
      const report = html.match(/class="log-sites" data-report="([^"]+)"/)[1];
      const box = {
        open: true,
        matches: () => true,
        dataset: {report},
        lastElementChild: {childElementCount: 0}
      };
      panel.contains = el => el === box;
      tab.dispatch('toggle', {target: box});
      assert.deepEqual(links(box.lastElementChild.innerHTML), [
        ['ICE', 'Iceland'],
        ['OSA', 'Japan']
      ]);
      let focused = false,
        scrolled = false,
        view;
      tab.$('#map .node[data-id="OSA"]').focus = () => {
        focused = true;
      };
      const svg = tab.$('#map');
      svg.scrollIntoView = () => {
        scrolled = true;
      };
      svg.setAttribute = (k, v) => {
        if (k === 'viewBox') view = v.split(' ').map(Number);
      };
      tab.click('goto', {id: 'OSA'});
      assert.ok(focused && scrolled);
      assert.equal(view[0] + view[2] / 2, g.TD.OSA.x);
      assert.equal(view[1] + view[3] / 2, g.TD.OSA.y);
      assert.equal(panel.innerHTML, html);
      tab.click('goto', {id: 'constructor'}); // no lookup of inherited or unknown IDs
      assert.equal(view[0] + view[2] / 2, g.TD.OSA.x);
      assert.deepEqual(copy(tab.game.S), copy(st));
      // A newer save prepends another dispatch and changes who holds Osaka. Keep
      // the old list open and its original target; don't use the row index or owner.
      panel.querySelectorAll = q => (q === 'details.log-sites[open]' ? [box] : []);
      const next = copy(st);
      next.rev++;
      next.terr.OSA.o = 'reich';
      next.log.unshift({t: now + 90000, vis: 'all', kind: 'front', sites: {JPN: 'TOK'}, msg: 'Another turn.'});
      relay.message('state', next);
      assert.match(panel.innerHTML, new RegExp(`data-report="${report}" open`));
      assert.ok(links(panel.innerHTML).some(([id, label]) => id === 'OSA' && label === 'Japan'));
      assert.ok(!links(panel.innerHTML).some(([id]) => id === 'TOK'));
      tab.click('tab', {k: 'orders'});
      assert.match(panel.innerHTML, /class="tname">Osaka/);
      assert.deepEqual(copy(tab.game.S), next);
      checkReadOnly(tab);
    }
  });
