// Optional end-to-end test; see TESTING.md. Three real loopback MQTT/WebSocket relays,
// two browser identities, two app builds. No production URL, account or broker access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const {once} = require('node:events');
const {join} = require('node:path');
const {WebSocketServer, createWebSocketStream} = require('ws');
const aedes = require('aedes');
const {chromium} = require('playwright-core');
const binary = require('@sparticuz/chromium');
const {factory} = require('../test-support/war-room.cjs');
const html = fs.readFileSync(join(__dirname, '../index.html'));
if (!process.env.EOT_ONLY_FRONT && !process.env.EOT_CLASSIC_HTML)
  throw Error('Set EOT_CLASSIC_HTML to index.html from before troop mastery.');
const legacy = process.env.EOT_ONLY_FRONT ? null : fs.readFileSync(process.env.EOT_CLASSIC_HTML);
const room = 'mixed-test',
  prefix = 'lands-eot/v1/' + room,
  classic = prefix + '/state',
  mastery = prefix + ':mastery-1/state';
const brokers = [aedes(), aedes(), aedes()],
  ws = new WebSocketServer({noServer: true}),
  latest = new Map(),
  writes = [];
const server = http.createServer((req, res) => {
  res.writeHead(200, {'content-type': 'text/html', 'cache-control': 'no-store'});
  res.end(req.url.startsWith('/classic.html') ? legacy : html);
});
server.on('upgrade', (req, socket, head) => {
  const m = req.url.match(/^\/relay\/([012])$/);
  if (!m) return socket.destroy();
  ws.handleUpgrade(req, socket, head, client => brokers[+m[1]].handle(createWebSocketStream(client)));
});
for (const b of brokers)
  b.on('publish', (packet, client) => {
    if (!packet.topic.endsWith('/state')) return;
    const value = JSON.parse(packet.payload);
    latest.set(packet.topic, value);
    if (client) writes.push({topic: packet.topic, rev: value.rev});
  });
const to = 'LOR',
  from = factory.ADJ[to].find(n => !n.sea).id;
function fixture() {
  const st = factory.newGame(Date.now());
  st.rev = 80;
  for (const team of ['reich', 'dawn']) {
    st.players['Fixture ' + team] = {team, role: 'chief', pw: 'fixture-only', cd: 0, title: 'E2E'};
    for (const r in st.teams[team].res) st.teams[team].res[r] = 5000;
  }
  st.terr[from] = {o: 'reich', u: {inf: 14}, f: 0, st: 'bunker'};
  st.terr[to] = {o: 'dawn', u: {bd_init: 10}, f: 0, st: 'bunker'};
  return st;
}
const publish = (topic, st, broker = brokers[0]) =>
  new Promise((resolve, reject) =>
    broker.publish({topic, payload: Buffer.from(JSON.stringify(st)), qos: 0, retain: true}, e =>
      e ? reject(e) : resolve()
    )
  );
const selector = (act, extra = '') => `[data-act="${act}"]${extra}`;
const click = (p, act, extra = '') => p.locator(selector(act, extra)).first().click();
const live = p =>
  p.waitForFunction(() => window.__eot?.S && document.querySelector('#me').textContent.includes('Live'));
const rev = (p, n) => p.waitForFunction(n => window.__eot?.S?.rev === n, n);
const research = async p => {
  await click(p, 'tab', '[data-k="tech"]');
  await click(p, 'researchbranch', '[data-k="mastery"]');
};
const battle = p =>
  p.evaluate(
    async ({from, to}) => {
      const random = Math.random;
      Math.random = () => 0.5;
      try {
        await window.__eot.act('attack', {from, to, grp: {inf: 14}, tactic: 'frontal'});
      } finally {
        Math.random = random;
      }
      return window.__eot.S.terr[to].o;
    },
    {from, to}
  );
(async () => {
  let browser;
  try {
    await publish(classic, fixture());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({
      executablePath: await binary.executablePath(),
      args: binary.args.filter(
        a => !['--single-process', '--disable-web-security', '--disable-site-isolation-trials'].includes(a)
      )
    });
    const errors = [];
    async function context(team, mobile = false) {
      const ctx = await browser.newContext(
        mobile
          ? {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2}
          : {viewport: {width: 1440, height: 900}}
      );
      ctx.setDefaultTimeout(9000);
      await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
      await ctx.addInitScript(
        ({team, origin}) => {
          if (window.top !== window || location.origin !== origin) return; // axe also creates empty audit frames.
          const Native = WebSocket,
            names = ['broker.emqx.io', 'broker.hivemq.com', 'test.mosquitto.org'];
          window.WebSocket = class extends Native {
            constructor(url, protocol) {
              const i = names.indexOf(new URL(url).hostname);
              if (i < 0) throw Error('Unexpected socket');
              super(origin.replace('http:', 'ws:') + '/relay/' + i, protocol);
            }
            send(data) {
              if (window.__relayDelay)
                setTimeout(() => {
                  if (this.readyState === 1) super.send(data);
                }, window.__relayDelay);
              else super.send(data);
            }
          };
          localStorage.setItem('eot-me', 'Fixture ' + team);
          localStorage.setItem('eot-ph', 'fixture-only');
        },
        {team, origin}
      );
      ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      return ctx;
    }
    const worldFront = () =>
      require('./front-room-check.cjs')({origin, context, brokers, fixture, publish, latest, writes, live});
    if (process.env.EOT_ONLY_FRONT) {
      await worldFront();
      assert.deepEqual(errors, []);
      return;
    }
    const a = await context('dawn'),
      b = await context('reich'),
      dawn = await a.newPage(),
      old = await b.newPage();
    const url = origin + '/index.html?room=' + room;
    await Promise.all([dawn.goto(url), old.goto(url.replace('index.html', 'classic.html'))]);
    await Promise.all([live(dawn), live(old)]);
    assert.match(await dawn.locator('#me').textContent(), /Fixture dawn/);
    assert.match(await old.locator('#me').textContent(), /Fixture reich/);
    // Long officer lists must not flex-shrink the Council view switch out of reach.
    await click(dawn, 'tab', '[data-k="council"]');
    await click(dawn, 'councilview', '[data-k="hierarchy"]');
    assert.equal(await dawn.locator('.charter-seats li h4').count(), 8);
    assert.match(await dawn.locator('.charter-authority').textContent(), /equal deputy status/);
    await dawn.setViewportSize({width: 320, height: 844});
    assert.ok(await dawn.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await dawn.getByRole('button', {name: 'Posts & field duty'}).focus();
    await dawn.keyboard.press('Enter');
    assert.equal(await dawn.locator('.council-roster').count(), 2);
    await dawn.setViewportSize({width: 1440, height: 900});
    assert.equal(writes.length, 0);
    await research(dawn);
    await click(dawn, 'preparemastery');
    await dawn.waitForSelector('[data-act="startmastery"]');
    assert.equal(writes.length, 0);
    await click(dawn, 'startmastery');
    await rev(dawn, 81);
    await click(dawn, 'room');
    const invite = await dawn.locator('#roomlink').inputValue();
    assert.equal(new URL(invite).searchParams.get('rules'), 'mastery-1');
    await click(dawn, 'closem');
    const updated = await b.newPage();
    await updated.goto(invite);
    await live(updated);
    await rev(updated, 81);
    for (let rank = 1; rank <= 5; rank++) {
      await click(dawn, 'mastery', `[data-u="bd_init"][data-skill="def"][data-rank="${rank}"]`);
      await rev(dawn, 81 + rank);
    }
    await rev(updated, 86);
    assert.equal(latest.get(classic).teams.dawn.mastery, undefined);
    assert.equal(await battle(old), 'reich');
    await rev(old, 81);
    await rev(updated, 86);
    assert.equal(latest.get(mastery).terr[to].o, 'dawn');
    assert.equal(await battle(updated), 'dawn');
    await rev(dawn, 87);
    assert.equal(latest.get(classic).terr[to].o, 'reich');
    assert.equal(latest.get(mastery).terr[to].o, 'dawn');
    // A pre-deployment tab following the new invite still cannot address a mastery topic.
    const oldWrites = writes.length;
    await old.goto(invite.replace('index.html', 'classic.html'));
    await live(old);
    await rev(old, 81);
    await click(old, 'room');
    await old.locator('details summary').click();
    await click(old, 'reconnect');
    await live(old);
    await rev(old, 81);
    assert.equal(await old.evaluate(() => window.__eot.S.terr.LOR.o), 'reich');
    assert.equal(writes.length, oldWrites);
    console.log(
      'PASS: unchanged legacy tab, matching-roll combat, and reconnect via a Mastery invite; Classic cannot touch Mastery.'
    );
    const peer = await a.newPage();
    await peer.goto(invite);
    await live(peer);
    await research(peer);
    const before = writes.length;
    const send = p =>
      p.evaluate(() => {
        const d = document.querySelector('[data-act="mastery"][data-skill="atk"]').dataset;
        return window.__eot.act('mastery', {
          unit: d.u,
          rank: 1,
          skill: 'atk',
          quote: {gold: +d.gold, steel: +d.steel}
        });
      });
    await Promise.all([send(peer), send(dawn)]);
    await rev(dawn, 88);
    await rev(peer, 88);
    assert.equal(writes.length - before, 1);
    assert.equal(latest.get(mastery).teams.dawn.mastery.bd_init.atk, 1);
    await peer.reload();
    await live(peer);
    await rev(peer, 88);
    assert.equal(writes.length - before, 1);
    console.log('PASS: simultaneous orders in two tabs charged exactly once; reload did not write.');
    for (const [page, count] of [
      [dawn, 34],
      [updated, 39]
    ]) {
      await research(page);
      const visited = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('#mastery-unit option'), o => o.value);
        for (const id of ids) {
          const el = document.querySelector('#mastery-unit');
          el.value = id;
          el.dispatchEvent(new Event('change', {bubbles: true}));
          if (
            document.querySelectorAll('.mastery-card').length !== 4 ||
            /NaN|undefined/.test(document.querySelector('#panel').textContent)
          )
            throw Error('Bad dossier ' + id);
        }
        return ids.length;
      });
      assert.equal(visited, count);
      await page.locator('#mastery-unit').selectOption({index: 0});
      await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
      const issues = await page.evaluate(async () =>
        (
          await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})
        ).violations.map(v => ({id: v.id, elements: v.nodes.map(n => n.target)}))
      );
      assert.deepEqual(issues, []);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({width, height: 844});
        assert.ok(
          await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
          'panel overflow at ' + width
        );
      }
    }
    await dawn.setViewportSize({width: 320, height: 700});
    await click(dawn, 'tab', '[data-k="troops"]');
    await click(dawn, 'showmastery', '[data-u="bd_whis"]');
    assert.equal(await dawn.locator('#mastery-unit').inputValue(), 'bd_whis');
    assert.equal(await dawn.evaluate(() => document.activeElement.id), 'mastery-unit');
    await dawn.keyboard.press('ArrowDown');
    assert.equal(await dawn.locator('#mastery-unit').inputValue(), 'bd_arch');
    await dawn.locator('#mastery-unit').selectOption('bd_whis');
    for (const [i, skill] of ['atk', 'def', 'talent'].entries()) {
      await click(dawn, 'mastery', `[data-u="bd_whis"][data-skill="${skill}"][data-rank="1"]`);
      await rev(dawn, 89 + i);
    }
    await dawn.locator('#map .node[data-id="BUC"]').focus();
    await dawn.keyboard.press('Enter');
    assert.equal(await dawn.evaluate(() => document.activeElement.dataset.id), 'BUC');
    for (const section of ['orders', 'troops']) {
      await click(dawn, 'tab', `[data-k="${section}"]`);
      const batch = dawn.locator('[data-act="recruit"][data-u="bd_whis"][data-n="5"]');
      assert.match(await batch.textContent(), /19 man · 24 gold/);
      assert.ok(await batch.isEnabled());
      assert.ok(
        await dawn.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1),
        section + ' overflow at 320px'
      );
    }
    await click(dawn, 'recruit', '[data-u="bd_whis"][data-n="5"]');
    await rev(dawn, 92);
    assert.equal(latest.get(mastery).terr.BUC.u.bd_whis, 6);
    assert.equal(latest.get(classic).rev, 81);
    console.log(
      'PASS: all 73 dossiers, full-page Research axe checks, keyboard map/roster selection, 320–1440px layouts and a discounted mobile batch.'
    );
    // Two independently logged-in devices (no shared BroadcastChannel). A round trip
    // longer than the old 70 ms lock delay must not let either purchase erase the other.
    const separate = await context('dawn', true),
      phone = await separate.newPage();
    await phone.goto(invite);
    await live(phone);
    await phone.locator(selector('tab', '[data-k="tech"]')).tap();
    await phone.locator(selector('researchbranch', '[data-k="mastery"]')).tap();
    await research(dawn);
    for (const page of [dawn, phone]) {
      await page.locator('#mastery-unit').selectOption('bd_init');
      await page.evaluate(() => (window.__relayDelay = 160));
    }
    await new Promise(r => setTimeout(r, 1700)); // Let the previous writer’s 1.5 s lease expire.
    const raceAt = writes.length,
      balance = structuredClone(latest.get(mastery));
    const train = (page, skill) =>
      page.evaluate(skill => {
        const d = document.querySelector(
          `[data-act="mastery"][data-u="bd_init"][data-skill="${skill}"]`
        ).dataset;
        const quote = Object.fromEntries(['gold', 'steel', 'oil'].filter(r => d[r]).map(r => [r, +d[r]]));
        return window.__eot.act('mastery', {unit: d.u, rank: +d.rank, skill, quote});
      }, skill);
    await Promise.all([train(dawn, 'vit'), train(phone, 'atk')]);
    await new Promise(r => setTimeout(r, 350));
    assert.deepEqual(
      writes.slice(raceAt).map(w => w.rev),
      [93, 94],
      'independent concurrent spends must get distinct revisions'
    );
    assert.equal(latest.get(mastery).teams.dawn.mastery.bd_init.vit, 1);
    assert.equal(latest.get(mastery).teams.dawn.mastery.bd_init.atk, 2);
    const end = latest.get(mastery);
    factory.tick(balance, end.t);
    const aCost = factory.masteryCost(balance, 'dawn', 'bd_init', 2),
      vCost = factory.masteryCost(balance, 'dawn', 'bd_init', 1);
    for (const [r, amount] of Object.entries(balance.teams.dawn.res))
      assert.ok(Math.abs(end.teams.dawn.res[r] - amount + (aCost[r] || 0) + (vCost[r] || 0)) < 1e-6);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: both independent-device orders survived a 160 ms uplink delay (distinct revisions and both debits).'
    );
    await Promise.all([a, b, separate].map(ctx => ctx.close()));
    await worldFront();
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    for (const c of ws.clients) c.terminate();
    ws.close();
    server.close();
    await Promise.all(brokers.map(b => new Promise(resolve => b.close(resolve))));
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
