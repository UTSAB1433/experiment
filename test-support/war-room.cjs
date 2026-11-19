// node --test — run the real inline app; no network, credentials, or production rooms.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const app = new vm.Script(inline, {filename: 'index.html'});
// Read engine internals in disposable VMs without publishing a manual AI-turn button/API.
const inspect = names =>
  new vm.Script(inline.replace('window.__eot = {', `window.__eot = {${names.join(',')},`));
const room = 'sync-test',
  RULES = 'mastery-1',
  masterWire = room + ':' + RULES,
  key = 'eot-live-state:' + masterWire,
  masterKey = key + '|mqtt|emqx',
  prefix = 'lands-eot/v1/' + masterWire + '/';
const ceiling = {man: 10000, gold: 10000, steel: 10000, oil: 10000};
const flush = () => new Promise(resolve => setImmediate(resolve));
// Advance the virtual clock in sub-lease steps, allowing the subscription warmup,
// broker echo and their promise continuations to run in their actual order.
async function finishOrder(t, promise) {
  let done = false;
  Promise.resolve(promise).then(
    () => (done = true),
    () => (done = true)
  );
  for (let i = 0; i < 80; i++) {
    await flush();
    if (done) return promise;
    t.mock.timers.tick(75);
  }
  assert.fail('Order did not settle within six simulated seconds.');
}
const now = Date.UTC(2026, 0, 1);
const mockTime = t => t.mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date'], now});

function publication(topic, value, raw = false) {
  const topicBytes = Buffer.from(topic),
    length = Buffer.alloc(2);
  length.writeUInt16BE(topicBytes.length);
  const body = Buffer.concat([length, topicBytes, Buffer.from(raw ? value : JSON.stringify(value))]);
  const size = [];
  let n = body.length;
  do {
    size.push((n % 128) + (n >= 128 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n);
  return Buffer.concat([Buffer.from([0x31, ...size]), body]);
}
function publications(socket) {
  return socket.sent
    .filter(b => b[0] >> 4 === 3)
    .map(b => {
      let i = 1;
      while (b[i++] & 128) {} // Skip MQTT remaining-length field.
      const end = i + 2 + b.readUInt16BE(i);
      return {
        topic: b.toString('utf8', i + 2, end),
        data: JSON.parse(b.toString('utf8', end)),
        retain: !!(b[0] & 1)
      };
    });
}
function launch({
  cached,
  storage = new Map(),
  url,
  identity,
  fb,
  fetch,
  claude,
  WebSocket,
  EventSource,
  timers,
  random,
  rules = RULES,
  via,
  relay,
  storedFb,
  script = app
} = {}) {
  const sockets = [],
    channels = [],
    nodes = new Map(),
    events = new Map(),
    windowEvents = new Map();
  const wire = rules ? room + ':' + rules : room,
    cacheKey = rules
      ? 'eot-live-state:' + wire + '|' + (claude ? 'shared' : fb ? 'https://fixture.firebaseio.com' : 'mqtt')
      : key;
  if (cached !== undefined)
    storage.set(cacheKey, typeof cached === 'string' ? cached : JSON.stringify(cached));
  if (storedFb) storage.set('eot-fb:' + room, storedFb);
  if (identity) {
    storage.set('eot-me', identity.name);
    storage.set('eot-ph', identity.ph);
  }
  function element() {
    return {
      querySelectorAll: () => [],
      innerHTML: '',
      children: [],
      classList: {toggle() {}},
      focus() {},
      style: {setProperty() {}},
      setAttribute() {},
      addEventListener() {},
      appendChild(el) {
        this.children.push(el);
        el.parent = this;
      },
      get firstChild() {
        return this.children[0];
      },
      remove() {
        if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      },
      contains() {
        return false;
      }
    };
  }
  function $(s) {
    if (!nodes.has(s)) nodes.set(s, element());
    return nodes.get(s);
  }
  function listen(map, type, fn, options) {
    if (!map.has(type)) map.set(type, []);
    map.get(type)[options?.capture ? 'unshift' : 'push'](fn);
  }
  function dispatch(map, type, e = {}) {
    let result;
    for (const fn of map.get(type) || []) result = fn(e) ?? result;
    return result;
  }
  const window = {
    claude,
    addEventListener: (t, f, o) => listen(windowEvents, t, f, o),
    removeEventListener: (t, f) =>
      windowEvents.set(
        t,
        (windowEvents.get(t) || []).filter(fn => fn !== f)
      )
  };
  const document = {
    querySelector: $,
    querySelectorAll: () => [],
    documentElement: element(),
    createElement: element,
    addEventListener: (t, f, o) => listen(events, t, f, o)
  };
  class Socket {
    constructor(url, protocol) {
      this.url = url;
      this.protocol = protocol;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(bytes) {
      assert.equal(this.readyState, 1);
      const buf = Buffer.from(bytes);
      this.sent.push(buf);
      if (buf[0] === 0xc0 && !this.dropPong) this.receive([0xd0, 0]);
      if (!this.noEcho && buf[0] >> 4 === 3) {
        const [msg] = publications({sent: [buf]});
        if (msg.topic.endsWith('/sync')) this.prefix = msg.topic.slice(0, -4);
        if (msg.topic.endsWith('/lock') || (msg.topic.endsWith('/state') && !this.dropStateEcho))
          setTimeout(() => this.receive(publication(msg.topic, msg.data)), 12);
      }
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    open() {
      this.readyState = 1;
      this.onopen();
    }
    receive(bytes) {
      this.onmessage?.({data: Uint8Array.from(bytes).buffer});
    }
    subscribe() {
      this.open();
      this.receive([0x20, 2, 0, 0]);
      this.receive([0x90, 3, 0, 1, 0]);
    }
    message(sub, data) {
      this.receive(publication((this.prefix || 'lands-eot/v1/' + wire + '/') + sub, data));
    }
  }
  class Channel {
    constructor(name) {
      this.name = name;
      this.sent = [];
      channels.push(this);
    }
    postMessage(msg) {
      assert.ok(!this.closed);
      this.sent.push(msg);
    }
    close() {
      this.closed = true;
    }
  }
  const location = new URL(
    url ??
      'https://example.test/?room=' +
        room +
        (fb ? '&fb=https://fixture.firebaseio.com' : '') +
        (rules ? '&rules=' + rules : '') +
        (via ? '&via=' + via : '') +
        (relay ? '&relay=' + relay : '')
  );
  script.runInNewContext({
    document,
    window,
    location,
    history: {
      replaceState(a, b, url) {
        location.href = url;
      }
    },
    URL,
    URLSearchParams,
    WebSocket: WebSocket || Socket,
    BroadcastChannel: Channel,
    EventSource,
    fetch:
      fetch ||
      (() => {
        throw Error('Unexpected fetch');
      }),
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: k => storage.delete(k)
    },
    ...(random && {Math: Object.assign(Object.create(Math), {random})}),
    crypto: require('node:crypto').webcrypto,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...timers
  });
  return {
    game: window.__eot,
    sockets,
    channels,
    $,
    storage,
    document,
    location,
    dispatch: (type, e) => dispatch(events, type, e),
    dispatchWindow: (type, e) => dispatch(windowEvents, type, e),
    click: (act, data = {}) =>
      dispatch(events, 'click', {target: {closest: () => ({dataset: {act, ...data}})}}),
    change: (chg, value) => dispatch(events, 'change', {target: {closest: () => ({dataset: {chg}, value})}})
  };
}
const {game: factory} = launch({timers: {setTimeout() {}, setInterval() {}}, random: () => 0.5});
function saved(rev) {
  const st = factory.newGame(now - 60000);
  st.rev = rev;
  st.players.Veteran = {team: 'dawn', role: 'soldier', title: 'Saved post #' + rev, cd: 1234, cp: 10};
  st.teams.dawn.res.gold = 200 + rev;
  return st;
}
const masterySaved = saved;
function legacySaved(rev) {
  const st = saved(rev);
  st.v = 6;
  delete st.players.Dhruv;
  // The v6 HQ-specific starting formations and fort were in Bucharest, not Nigeria.
  for (const id of ['BUC', 'NIG']) {
    st.terr[id].f = id === 'BUC' ? 1 : 0;
    for (const u of ['bd_mant', 'bd_rave']) st.terr[id].u[u] = id === 'BUC' ? 2 : 1;
    for (const u of ['bd_obsv', 'bd_whis', 'bd_fact']) {
      if (id === 'BUC') st.terr[id].u[u] = 1;
      else delete st.terr[id].u[u];
    }
  }
  return st;
}
function checkReadOnly({sockets, channels}) {
  const pubs = sockets.flatMap(publications);
  assert.ok(!pubs.some(p => p.retain || p.topic.endsWith('/state')), 'no state was published to a broker');
  assert.ok(
    !channels.flatMap(c => c.sent).some(p => p.sub === 'state'),
    'no state was broadcast to other tabs'
  );
}
const enlist = {name: 'New player', team: 'dawn', pw: 'a'.repeat(64)};

// The VM DOM normally just records innerHTML. Expose the rendered panel's price tags
// as elements so the app's real clock can change their disabled state and cost color.
function purchaseRoom(st, team, role = 'chief', cp = 10) {
  const identity = {name: 'Test chief', ph: 'fixture-only'};
  const holders = Object.values(st.players).filter(p => p.team === team && p.role === role);
  if ((role === 'leader' && holders.length) || (role === 'chief' && holders.length >= 4))
    holders[0].role = 'soldier';
  st.players[identity.name] = {team, role, pw: identity.ph, title: 'Test', cd: 0, cp};
  const tab = launch({cached: st, identity, rules: st.ruleset, relay: 'emqx'}),
    panel = tab.$('#panel');
  let html, elements;
  function controls() {
    if (html !== panel.innerHTML) {
      html = panel.innerHTML;
      elements = Array.from(html.matchAll(/<(button|span)\b([^>]*)>/g), ([tag, type, attrs]) => ({
        tagName: type.toUpperCase(),
        disabled: /\sdisabled\b/.test(tag),
        classList: {
          toggle(k, on) {
            this[k] = on;
          }
        },
        dataset: Object.fromEntries(
          Array.from(attrs.matchAll(/\sdata-(\w+)(?:="([^"]*)")?/g), ([, k, v]) => [k, v ?? ''])
        )
      }));
    }
    return elements;
  }
  panel.querySelectorAll = tab.document.querySelectorAll = sel =>
    sel === '[data-price]' ? controls().filter(el => 'price' in el.dataset) : [];
  const [relay] = tab.sockets;
  relay.subscribe();
  relay.message('state', st);
  return {tab, controls, relay};
}

module.exports = {
  room,
  key,
  prefix,
  RULES,
  masterWire,
  masterKey,
  ceiling,
  flush,
  finishOrder,
  now,
  mockTime,
  publication,
  publications,
  launch,
  factory,
  inspect,
  saved,
  masterySaved,
  legacySaved,
  checkReadOnly,
  enlist,
  purchaseRoom
};
