# Testing the war room without touching live campaigns

## What must stay true

Classic still uses the existing v6 save and room addresses. To play with mastery, a leader or chief opens **Research → Troop mastery → Continue from Classic**, checks the source revision, and starts the separate session. **Share the Mastery invite with both factions.** Officers, troops, resources and research come from that snapshot; subsequent moves do not cross between the games. If a Mastery session already exists, it wins over the proposed starting snapshot. Opening an invite must never create a save.

- Both Classic and Mastery invites identify the data source and a minimum revision. A browser backup is not a starting board. Re-entering or reconnecting never publishes a cached save.
- In a live order, the displayed rank and per-resource prices are limits. Recheck them, permissions, prerequisites and available funds on the locked game. Accept a lower price; reject a higher one without spending. Recruitment quotes cover the **whole batch**.
- A real save on the wrong rules, an unreadable record and an unconfirmed empty room are **not** permission to initialize. Importing an older backup must not replace a newer campaign. No `GAME_V` bump or automatic reset.

## Re-entering the same campaign

On the device showing the right army, refresh to the current build, wait for **Live · #revision**, then use the room button → **Copy link**. Open that exact link on the other devices. Compare the campaign (Classic or Mastery), room, data source and revision. Compare oil **within the same faction**; the sides have separate stockpiles. Normal passive income continues from the confirmed save's timestamp. The map still rounds unscouted enemy garrisons.

- Returning to the site without an invite resumes this browser’s last confirmed campaign. With no history it asks which campaign to open. An old room-code bookmark that could mean Classic or the user's Mastery session asks instead of guessing. You can open the other campaign directly from the room button without entering Research. This only changes the view, not either save.
- A cold load shows no balances or troop markers until the chosen room confirms its own record. If a connection drops while playing, the last confirmed map is read-only, income projection stops, and the client checks **the same source** again. A higher revision in a link or backup is a **floor**, never a request to restore old numbers. A freshly confirmed empty Classic room shows a labeled starting map; it still takes an explicit player order to persist it.
- Public MQTT brokers are independent, not replicas. With an old unpinned link, differing copies or an incomplete choice of saved relays require a selection. Ask an active player for the exact invite rather than picking the largest revision. A peer response is not a retained save, and absence on an unreachable relay is not an empty campaign.
- If the selected source is missing, behind, or disagrees with its backup at the same revision, don't reset or import to make the numbers agree. Check the invite with the other player. **Room → Backup** can export available copies separately. Pre-update local backups are left in place; there is no automatic merge or cross-room restore. For a valuable campaign, keep a separate export: public relays and browser storage are not guaranteed backups.

`node --test test/room-sync.test.cjs` exercises those paths with independent profiles and clocks, distinct oil and garrisons, old bookmarks, partial reads, offline locks and a room switch during a pending write. The browser check below repeats re-entry on real loopback brokers.

## Personal command points (Classic and Mastery)

Each post starts a new war with **10 CP**, regains **1 CP every 20 seconds** of elapsed game time and can hold **20 CP**. This includes offline posts. Neither faction nor formations change the rate. Orders spend the issuing post’s points; two devices signed into the same post use the same balance. Manpower, steel, oil and gold remain faction resources. A successful honeytrap or decapitation takes up to 2 or 6 whole CP, respectively, from **one** randomly chosen opposing post with points to lose.

Refresh the game on all devices before issuing orders. Existing v6 rooms and backups do not need a reset: each post without a personal balance inherits its faction’s saved CP at the save’s timestamp. The HUD and order controls project the balance without writing; the next accepted save stores personal balances instead of faction CP. New enlistees start at 10, and continuing from Classic to Mastery carries balances forward.

`node --test test/personal-cp.test.cjs` checks the refill boundary, cap, every CP cost, independent teammates, same-post devices, read-only HUD updates and legacy saves. The 90-second World front clock below is separate.

## Independent countries (Classic and Mastery)

No new room, save version or migration is needed. Refresh the game on each participating device. Open **World front** for the operation clock, occupied national capitals, country ranks and latest dispatch. A new room still needs its first explicit player order: opening an invite, spectating or displaying a cache never creates a campaign.

- **One active post, either faction:** after 90 seconds of confirmed activity in a saved live campaign, any signed-in role can run a turn. All 70 independent countries train once per operation. The 112 initially independent provinces and later conquests replenish only their current country's garrisons, in installments. Four drills raise a rank, up to V. Training doubles if either faction holds eight originally independent provinces or has level III+ doctrine/mastery; a country gains another drill for fighting. Major powers start at II and rebuild faster (Soviet armor, American air, Japanese and British fleets, Chinese artillery).
- **Capital recovery:** a country can challenge whoever holds its home capital, including a rival independent or an occupier on the starting map. It uses its own neighboring army if possible, with a home guard and a fleet for a sea route. If no expedition can reach the capital, local resistance recruits `1 + floor(rank / 2)` infantry per active turn, even if the country has no land. At `4 + 2 × rank` it can fight. The same battle resolver handles defense, losses and occupation: a failed uprising keeps only its survivors in reserve; a successful one leaves its survivors in the capital. Berlin and Bucharest are never independent objectives.
- **Other raids still need both factions.** At most one battle happens per operation. Ready capital recoveries rotate between countries; if regular border raids are also eligible, alternate operations are available for them. Ordinary expeditions take troops from a connected garrison and alternate defending player factions when possible. Their stricter two-way check still requires a full paired interval and a fresh, post-deadline Dawn reply to a Reich challenge. Multiple clients share the same turn, not one turn per device.
- **AFK after five minutes without input.** The HUD shows the countdown. Pointer, touch, keyboard, click, wheel or form input on *this device* restarts it; a heartbeat, incoming game state or HUD repaint does not. An AFK player stays signed in and can watch, but does not count. The last eligible player going AFK, leaving or disconnecting pauses independent turns. Returning after a gap starts a fresh interval; no missed upgrades, reserves or battles are banked. No AFK clock or presence record goes in the save. This does not change normal resource income.
- **Live authority:** eligible clients check in every five seconds. MQTT requires this tab's current non-retained echo on the selected, state-confirmed broker (never BroadcastChannel); document stores require a successful live muster read. Check-ins expire after 18 seconds. Before a turn the client also needs the room lock, the same confirmed campaign/revision/origin/turn, valid credentials on the locked roster, an unexpired lease and an active local deadline. Victory, stale cache, incompatible rules and missing saves fail closed. A verified pair gets a short opportunity to run its raid before a solo writer proceeds. The normal income/HUD clock does not run the simulation.
- Firebase uses `/muster/{reich,dawn}` beside state/lock and conditional state writes. The shared DB uses `muster-reich`/`muster-dawn` in the game's collection. With custom permissions, allow players to read and write the signal slots. MQTT uses the broker-echoed cooperative lease and confirmed state publication. Presence is cooperative, **not** server-side authentication; signals carry no passwords or verifiers. Older builds do not implement personal CP, AFK or the updated muster; use the current build throughout the room. Sleeping tabs and badly mismatched clocks may pause rather than simulate unconfirmed turns. MQTT is not transactional.

## Log → map

Tap an underlined country or province in **Log** to select the recorded event site and bring the map into view, without leaving the timeline or issuing an order. A country named in a battle report leads to the battlefield, not its home capital; a named expedition origin or troop-movement endpoint leads to that province. In new worldwide upkeep reports, expand **Countries active this turn** to jump to a representative site per affected country: the recruiting resistance first, otherwise a reinforced garrison or the country's training location. These sites are recorded at the time of the turn, not reconstructed from current borders.

Existing v6 saves need no reset. Older battles and recognizable place-specific orders remain navigable; old worldwide totals have no historical list of sites. Non-geographic entries stay plain text, and the Log still filters private events by faction. `node --test test/log-map.test.cjs` covers both room types, positional names, legacy entries, and read-only navigation. The optional World front browser check below also taps a country in a battle and keyboard-activates a country in a worldwide report on a phone-sized map.

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

`test/independent-armies.test.cjs` checks home assignments, rank and garrison caps, real losses and annexation, expedition and local-resistance liberations, and 1,000 seeded operations. `test/independent-presence.test.cjs` drives the MQTT, Firebase and shared DB paths: solo play on either side, same-faction duplicates, AFK expiry and input, wake after sleep, stale/retained signals, disappearing saves, lease expiry, conflicts, and racing player orders.

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

This checks the initial save (with only the CP representation changed), all legitimate map connections, 1,460 recruitment attempts (including caps), 168 doctrine purchases and 1,200 reproducible land/sea battles, including subsequent faction income, the new personal CP accrual and victory checks. The v6 save has **one** `PER` province (Lima); removing its duplicate map node/self-route must not rename it or change the existing economy and score weights.

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

The re-entry scenario gives Classic, Mastery and a divergent relay different oil and garrisons. A phone leaves; its teammate recruits while it's gone. On a bare revisit, the phone must show **no stock or troops** while the broker's state delivery is suppressed, then the correct HUD and map in Orders on reconnect. The run checks all three retained records: only the teammate's deliberate recruitment changed one. Use `EOT_ONLY_REENTRY=1` to run just this scenario without legacy HTML.

The test also checks that identical combat rolls produce different outcomes **only in the intended room**; reconnects an old client via the new invite; races two tabs for the same rank; and races two independent browser contexts, including an emulated phone with a 160 ms uplink delay, for different ranks. It checks retained revisions, rank changes and debits. It also visits every dossier, runs full-page axe checks with Research open for both factions, exercises keyboard and touch navigation, checks 320–1440 px panel widths, and buys a discounted batch on mobile.

These are regression checks, not a guarantee against all failures of public brokers. Mastery uses a broker-echoed cooperative lease and confirms state publications; MQTT is not a transactional database. For server-side conditional writes, the Firebase path uses ETags. Browser automation here covers Chromium, not every browser or assistive technology.

The browser run also starts an independent-front campaign with two Reich devices and one Dawn device. Chromium clocks advance while real MQTT packets, lock echoes and retained saves travel normally. The test checks a single liberation of Moscow across all three devices, continued training with only Dawn present, a frozen front after AFK, then exactly one fresh operation after keyboard return. It also checks the dispatch, a mobile jump to Japan, axe and responsive widths. To run **just** this part with the optional browser dependencies above (no legacy HTML needed):

```sh
EOT_ONLY_FRONT=1 LD_LIBRARY_PATH="$work/libs/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" node tools/mixed-room-smoke.cjs
```
