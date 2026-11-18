// node --test — run the real inline app; no network, credentials, or production rooms.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const app = new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1], {filename: 'index.html'});
const room = 'sync-test',
  key = 'eot-live-state:' + room;
const prefix = 'lands-eot/v1/' + room + '/';
const RULES = 'mastery-1',
  masterWire = room + ':' + RULES,
  masterKey = key + ':' + RULES + '|mqtt';
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
  identity,
  fb,
  fetch,
  claude,
  WebSocket,
  EventSource,
  timers,
  random,
  rules,
  via,
  storedFb,
  script = app
} = {}) {
  const sockets = [],
    channels = [],
    nodes = new Map(),
    events = new Map();
  const wire = rules ? room + ':' + rules : room,
    cacheKey = rules
      ? 'eot-live-state:' + wire + '|' + (claude ? 'shared' : fb ? 'https://example.test' : 'mqtt')
      : key;
  const storage = new Map(
    cached === undefined ? [] : [[cacheKey, typeof cached === 'string' ? cached : JSON.stringify(cached)]]
  );
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
  const window = {claude, addEventListener() {}, removeEventListener() {}};
  const document = {
    querySelector: $,
    querySelectorAll: () => [],
    documentElement: element(),
    createElement: element,
    addEventListener: (e, f) => events.set(e, f)
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
      if (!this.noEcho && buf[0] >> 4 === 3) {
        const [msg] = publications({sent: [buf]});
        if (
          msg.topic.endsWith(':mastery-1/lock') ||
          (msg.topic.endsWith(':mastery-1/state') && !this.dropStateEcho)
        )
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
      this.receive(publication('lands-eot/v1/' + wire + '/' + sub, data));
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
    'https://example.test/?room=' +
      room +
      (fb ? '&fb=https://example.test' : '') +
      (rules ? '&rules=' + rules : '') +
      (via ? '&via=' + via : '')
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
    click: (act, data = {}) => events.get('click')({target: {closest: () => ({dataset: {act, ...data}})}}),
    change: (chg, value) => events.get('change')({target: {closest: () => ({dataset: {chg}, value})}})
  };
}
const {game: factory} = launch({timers: {setTimeout() {}, setInterval() {}}, random: () => 0.5});
function saved(rev) {
  const st = factory.newGame(now - 60000);
  st.v = 6;
  st.rev = rev;
  st.players.Veteran = {team: 'dawn', role: 'soldier', title: 'Saved post #' + rev, cd: 1234};
  st.teams.dawn.res.gold = 200 + rev;
  return st;
}
const masterySaved = rev => Object.assign(saved(rev), {ruleset: RULES});
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
function purchaseRoom(st, team, role = 'chief') {
  const identity = {name: 'Test chief', ph: 'fixture-only'};
  st.players[identity.name] = {team, role, pw: identity.ph, title: 'Test', cd: 0};
  const tab = launch({cached: st, identity, rules: st.ruleset}),
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
  const [relay, b, c] = tab.sockets;
  relay.subscribe();
  b.onerror();
  c.onerror();
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
  saved,
  masterySaved,
  checkReadOnly,
  enlist,
  purchaseRoom
};
