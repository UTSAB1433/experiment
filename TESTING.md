# Testing the war room without touching live campaigns

## What must stay true

Classic still uses the existing v6 save and room addresses. To play with mastery, a leader or chief opens **Research → Troop mastery → Continue from Classic**, checks the source revision, and starts the separate session. **Share the Mastery invite with both factions.** Officers, troops, resources and research come from that snapshot; subsequent moves do not cross between the games. If a Mastery session already exists, it wins over the proposed starting snapshot. Opening an invite must never create a save.

- Mastery invites pin the backend. A browser cache is a read-only preview, not authority to initialize, buy a rank, or roll back a higher server revision.
- In a live order, the displayed rank and per-resource prices are limits. Recheck them, permissions, prerequisites and available funds on the locked game. Accept a lower price; reject a higher one without spending. Recruitment quotes cover the **whole batch**.
- A real save on the wrong rules, an unreadable record and an unconfirmed empty room are **not** permission to initialize. Importing an older backup must not replace a newer campaign. No `GAME_V` bump or automatic reset.

## Independent countries (Classic and Mastery)

No new room, save version or migration is needed. After deploying, **refresh the game on both sides**. Open **World front** to see the operation clock, country ranks, and the most recent dispatch. A fresh room still needs its first explicit player order; merely connecting, spectating or displaying a cached board never creates a game.

- The 112 initially independent provinces belong to 70 countries. A country only operates from land it still holds. One operation can send **one** expedition over an existing link to a player province (not a faction HQ). Sea sorties need a fleet. When possible the turns alternate between targeting the two factions. The units come out of the source garrison; casualties, retreat and occupation use the normal battle resolver. A successful expedition leaves survivors holding the land for that particular country.
- Each operation replenishes missing formations **in installments**, not to full health. Each surviving country gains one drill (two if either faction holds eight originally independent provinces or has level III+ doctrine/mastery); the raider gains one extra. Four drills raise a rank, to a maximum of V. Ranks increase the reinforcement budget and unit mix. Major powers start at rank II and rebuild faster. The USSR builds armor, the USA air wings, Japan and the UK fleets, and China artillery. These are real v6 unit counts, not invisible multipliers that disagree with old combat previews.
- **One signed-in player from each faction** must be in the same live campaign. Any role counts; a spectator, an open join screen, the saved officer list or two tabs from one faction do not. Clients check in every 5 seconds. After at least 90 seconds of joint presence, a Reich client needs a **new** matching reply from Dawn, then the room lock, the same live revision/roster and a still-valid lease. A missing reply cannot authorize a turn. A disconnect, expired signals (18s), victory or room switch pauses the front. Rejoining after a gap starts a new interval; no missed attacks, replacements or upgrades are banked. The ordinary HUD/income clock never calls the simulation.
- MQTT signals are non-retained and must arrive on the selected broker, not BroadcastChannel. All updated MQTT clients now share the same ordered, echoed lock and confirmed state publication so that player orders and autonomous turns can coexist in Classic too. Firebase uses two small `/muster/{reich,dawn}` slots **beside** each room's state and lock, and conditional game writes. The shared DB uses `muster-reich`/`muster-dawn` in the same collection as that game's state/lock. With custom access rules, signed-in players need to read and write the signal slots. Missing access or a stale/absent state fails closed. No heartbeat is stored in the game save, and no password or password verifier is transmitted in signals.
- This is cooperative presence between game clients, not server-side player authentication. An older client can see and fight the persisted armies but cannot vouch for either faction. Sleeping/throttled tabs and devices with badly mismatched clocks may pause play rather than simulate unconfirmed turns. MQTT is not a transactional store.

## Black Dawn appointments

**Council → Black Dawn hierarchy** opens the faction charter. Its eight named appointments are linked to the existing posts; the unspecified sixth seat (VI) is not an extra login. The charter is separate from the roster of players enrolled in a particular room. Official titles replace the old starter labels on screen, alongside any custom room titles. Game roles still determine order permissions. No player keys, password salts, v6 saves or World front state are migrated.

`node --test test/dawn-charter.test.cjs` checks both room modes, the order of authority, sign-in keys, custom titles, similarly named enlistees, and a post removed in a higher revision. The optional mixed-build browser run below also opens the charter from the full roster and returns by keyboard at phone width.

## Core suite (no dependencies or network)

From the repository root, on Node 22 or 24:

```sh
node --test
node --test --test-concurrency=1
git diff --check
```

`test-support/war-room.cjs` runs the application's actual inline script in a VM with disposable storage, sockets, a DOM fixture and controllable time. Tests exercise both factions, all 73 formations and their four tracks, 8,760 batch-price combinations, fixed-roll battles, stale quotes, permissions, duplicate orders, and malformed or late saves. The rollout tests cover missing lock/save echoes, backend switches, imports, resets, Firebase pruning/ETags/stream races, and shared-DB state and lock paths. The Firebase and shared-DB adapters in these tests use fixtures, **not hosted services**.

`test/independent-armies.test.cjs` checks all home assignments, rank and garrison caps, real casualties, recovery, annexation, amphibious and occupied-province behavior, and 1,000 reproducible operations. `test/independent-presence.test.cjs` drives signed-in clients through the actual MQTT, Firebase and shared DB paths, including disappearing players, two same-faction devices, stale/retained responses, disappearing saves, late higher revisions, conflicts and racing player orders.

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

The browser run also starts an independent-front campaign with two Reich devices and one Dawn device. Chromium clocks advance while real MQTT packets, lock echoes and retained saves travel normally. The test checks exactly one operation, a frozen save when Dawn leaves, one fresh interval on return, the dispatch and a mobile jump to Japan, plus axe and responsive-width checks. To run **just** this part with the optional browser dependencies above (no legacy HTML needed):

```sh
EOT_ONLY_FRONT=1 LD_LIBRARY_PATH="$work/libs/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" node tools/mixed-room-smoke.cjs
```
