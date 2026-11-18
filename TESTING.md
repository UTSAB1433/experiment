# Testing troop mastery without touching a live room

## What must stay true

Classic still uses the existing v6 save and room addresses. To play with mastery, a leader or chief opens **Research → Troop mastery → Continue from Classic**, checks the source revision, and starts the separate session. **Share the Mastery invite with both factions.** Officers, troops, resources and research come from that snapshot; subsequent moves do not cross between the games. If a Mastery session already exists, it wins over the proposed starting snapshot. Opening an invite must never create a save.

- Mastery invites pin the backend. A browser cache is a read-only preview, not authority to initialize, buy a rank, or roll back a higher server revision.
- In a live order, the displayed rank and per-resource prices are limits. Recheck them, permissions, prerequisites and available funds on the locked game. Accept a lower price; reject a higher one without spending. Recruitment quotes cover the **whole batch**.
- A real save on the wrong rules, an unreadable record and an unconfirmed empty room are **not** permission to initialize. Importing an older backup must not replace a newer campaign. No `GAME_V` bump or automatic reset.

## Core suite (no dependencies or network)

From the repository root, on Node 22 or 24:

```sh
node --test
node --test --test-concurrency=1
git diff --check
```

`test-support/war-room.cjs` runs the application's actual inline script in a VM with disposable storage, sockets, a DOM fixture and controllable time. Tests exercise both factions, all 73 formations and their four tracks, 8,760 batch-price combinations, fixed-roll battles, stale quotes, permissions, duplicate orders, and malformed or late saves. The rollout tests cover missing lock/save echoes, backend switches, imports, resets, Firebase pruning/ETags/stream races, and shared-DB state and lock paths. The Firebase and shared-DB adapters in these tests use fixtures, **not hosted services**.

## Compare against the pre-mastery engine

Use a temporary directory outside the checkout. The reference is the actual parent build of this feature, not an expected-value formula copied from the new code.

```sh
work=$(mktemp -d)
export EOT_CLASSIC_HTML="$work/classic.html"
git show b1df2301c7d5cea978ec721357f9c317dfd4d741:index.html > "$EOT_CLASSIC_HTML"
node tools/rules-parity.cjs
# Optional longer run with a different, reproducible scenario sequence:
EOT_PARITY_SEED=4135 EOT_PARITY_BATTLES=10000 node tools/rules-parity.cjs
```

This checks the initial save, all legitimate map connections, 1,460 recruitment attempts (including caps), 168 doctrine purchases and 1,200 reproducible land/sea battles, including subsequent income and victory checks. The v6 save has **one** `PER` province (Lima); removing its duplicate map node/self-route must not rename it or change the existing economy and score weights.

## Mixed-build browser test (optional, Linux x86-64)

With the same `work` and `EOT_CLASSIC_HTML` as above:

```sh
npm install --prefix "$work" --no-audit --no-fund \
  playwright-core@1.55.0 @sparticuz/chromium@140.0.0 \
  aedes@0.51.3 ws@8.18.3 axe-core@4.10.3
export NODE_PATH="$work/node_modules"
# Minimal Linux runners may lack Chromium's NSS/NSPR libraries.
mkdir -p "$work/libs"
node -e 'process.stdout.write(require("node:zlib").brotliDecompressSync(require("node:fs").readFileSync(process.argv[1])))' \
  "$NODE_PATH/@sparticuz/chromium/bin/al2023.tar.br" | tar -xf - -C "$work/libs"
LD_LIBRARY_PATH="$work/libs/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" node tools/mixed-room-smoke.cjs
```

The script starts an ephemeral loopback HTTP server and **three separate real MQTT/WebSocket brokers**. Synthetic officers use the original Classic HTML and the current build in Chromium. App sockets are redirected to the local brokers; external requests are blocked. No public room code, login or Firebase URL is needed.

The test checks that identical combat rolls produce different outcomes **only in the intended room**; reconnects an old client via the new invite; races two tabs for the same rank; and races two independent browser contexts, including an emulated phone with a 160 ms uplink delay, for different ranks. It checks retained revisions, rank changes and debits. It also visits every dossier, runs full-page axe checks with Research open for both factions, exercises keyboard and touch navigation, checks 320–1440 px panel widths, and buys a discounted batch on mobile.

These are regression checks, not a guarantee against all failures of public brokers. Mastery uses a broker-echoed cooperative lease and confirms state publications; MQTT is not a transactional database. For server-side conditional writes, the Firebase path uses ETags. Browser automation here covers Chromium, not every browser or assistive technology.
