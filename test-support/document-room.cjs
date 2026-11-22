// Document-backend and file-input fixtures; no hosted services.
const {room, masterWire} = require('./war-room.cjs');
// A minimal RTDB emulator: null/empty children are pruned and compare-and-set uses an ETag.
function prune(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.length ? Array.from(v, prune) : null;
  const out = Object.fromEntries(
    Object.entries(v)
      .map(([k, x]) => [k, prune(x)])
      .filter(([, x]) => x != null)
  );
  return Object.keys(out).length ? out : null;
}
function firebase(st, conflict = null) {
  const classic = '/eot-rooms/' + room + '/state.json',
    target = '/eot-rooms/' + encodeURIComponent(masterWire) + '/state.json';
  const records = new Map([[classic, prune(st)]]),
    calls = [];
  let contended = conflict;
  const fetch = async (url, o = {}) => {
    const k = new URL(url).pathname,
      record = records.get(k) || null,
      tag = record ? '"' + record.rev + '"' : '"null_etag"';
    calls.push({k, ...o});
    if (o.method === 'PUT') {
      if (k === target && contended) {
        contended = false;
        records.set(k, prune(conflict));
        return {ok: false, status: 412};
      }
      if (o.headers?.['if-match'] && o.headers['if-match'] !== tag) return {ok: false, status: 412};
      records.set(k, prune(JSON.parse(o.body)));
    }
    return {ok: true, json: async () => structuredClone(record), headers: {get: () => tag}};
  };
  return {fetch, classic, target, records, calls};
}
function filePicker(tab) {
  const create = tab.document.createElement;
  let input;
  tab.document.createElement = tag => {
    const el = create(tag);
    if (tag === 'input')
      el.click = () => {
        input = el;
      };
    return el;
  };
  return data => {
    input = null;
    tab.click('importstate');
    if (!input) return null;
    input.files = [{text: async () => JSON.stringify(data)}];
    return input.onchange();
  };
}

function shared(st) {
  const target = `game-${masterWire}/state`,
    records = new Map([[target, structuredClone(st)]]),
    writes = [];
  const snap = k => ({exists: records.has(k), data: () => structuredClone(records.get(k))});
  const claude = {
    use: async () => ({
      doc: k => ({
        acquire: async () => ({acquired: true}),
        get: async () => snap(k),
        set: async v => {
          records.set(k, structuredClone(v));
          writes.push(k);
        },
        onSnapshot: cb => cb(snap(k))
      })
    })
  };
  return {target, records, writes, claude};
}
module.exports = {prune, firebase, shared, filePicker};
