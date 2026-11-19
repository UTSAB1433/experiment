# Testing the war room without touching live campaigns

## One playable campaign: Mastery

The game continues the **existing Mastery room**, using its original `room:mastery-1` addresses for state, locks, muster and backups. There is no Classic campaign selector or handoff. Neither a visit nor an upgrade reads, merges, replaces or deletes the archived Classic campaign. Doctrine and formation mastery are two research branches **in the same war**.

### Starting a new room

**Room → New Mastery room** starts each faction with its capital alone: **Berlin** for the Reich and **Nigeria** for Black Dawn. All 147 provinces are on the map. The other 145 start neutral with local defenders, not leftover player formations. The HQ garrisons, opening stockpiles, doctrines and personal CP are unchanged. Expand from your HQ along the existing map lines.

Joining a saved room always loads its actual borders and garrisons. No migration is needed. New saves remember the capital-only opening; older saves without that marker keep their historical layout even if the leader explicitly resets the map.

### Updating an existing room (no reset)

1. Refresh the app on all devices. Open the group's Mastery invite and wait for **Live · #revision**. For a valued save, use **Room → Backup → Export confirmed save** before giving orders.
2. A confirmed v6 Mastery save shows a preview of the updated map and roster. Choose a post and **Apply update now**, or issue a normal player order. The client rereads the authoritative save under the room lock, converts a copy, rechecks permissions and only persists a successful order. Browsing, failed orders, AFK timers and World front check-ins do not perform the upgrade.
3. The confirmed update advances the revision and writes **v7** in the same room. Old v6 clients cannot play the new record. The device keeps a separate, best-effort **Export pre-update backup** when it sees the transition. Later captures, appointments and removals do not rerun the conversion. A known v7 campaign will not accept a v6 downgrade.

**HQ and roster:** Nigeria is Black Dawn's headquarters; Bucharest remains a national capital. Fresh games move the HQ fort and special starting units to Nigeria. Existing Dawn garrisons and forts are not regenerated. If Nigeria was occupied, the old garrison withdraws to friendly territory (Berlin first for Reich; a holding of the same country for an independent army). If there is no safe destination, the save retains the force in `hqReserve`. The handover itself is not a Reich victory and doesn't erase a completed game's outcome. Subsequent player capture of the enemy HQ wins normally.

Dhruv starts as a **Reich soldier**. Only the password verifier is stored. An older, unrelated account named Dhruv keeps its login, faction and titles; the new post appears as **Dhruv (Reich)**, or a numbered variant if necessary. A post removed after the update stays removed.

### Command appointments

- The faction leader can appoint up to **four chiefs of staff** in **Council → Posts & field duty**. Only chiefs recruit, in **any faction-owned province**. Open **Recruit here** below the province’s orders, or use the full **Troops** roster. Both count each deployed formation once per saved province, including at Lima. The leader can order attacks but is not a fifth recruiter.
- **Six non-leader attack seats plus the leader.** Each chief automatically occupies one seat. The leader can assign or release the remaining seats without changing a soldier's or diplomat's other duties. Promoting an attack-seat holder to chief uses the same seat, not two. Demoting a chief releases it. In an already over-cap v6 roster, original office holders take precedence, then account-key order; extra office holders keep their accounts, titles and CP as soldiers.
- Every player attack crosses **one map line** from a friendly garrison to an enemy or neutral province. This applies equally to leaders, chiefs and appointed attackers. Start at either end: the picker lists only connected targets or connected friendly garrisons with troops. Dashed sea links also require a group that can cross, just as for friendly moves. Range, crossing ability, personal CP, oil, ceasefires, unit availability and tactics are checked on the locked state before an attack takes effect. A ceasefire removes opposing-faction options, not neutral targets. Move and attack previews explain an illegal crossing before confirmation. Peaceful annexation and independent operations keep their own rules.

## Re-entering the same campaign

On the device showing the right army, wait for **Live**, then use **Room → Copy link**. Compare room, source, revision and faction; the factions do not share stockpiles, and unscouted enemy garrisons are rounded.

- A bare visit resumes the last confirmed room, or opens the default Mastery room if none was remembered. Untagged bookmarks resolve to Mastery, not a second playable war. An old Classic revision or MQTT pin is **not** a Mastery revision or pin. An exact Mastery invite pins its own backend (including the Firebase root or relay) and minimum revision.
- No balances or markers appear on cold load until the backend confirms its own record. On disconnect the last confirmed map becomes read-only; offline projections stop. Backups and peer announcements can block a stale read, but cannot supply a board or authorize an order. Only a **confirmed empty** room without evidence of a previous save gets a labeled starting map, persisted on the first explicit order.
- Public MQTT brokers are independent, not replicas. With an old unpinned link, differing copies or an incomplete choice of saved relays require a selection. Ask an active player for the exact invite rather than picking the largest revision. A peer response is not a retained save, and absence on an unreachable relay is not an empty campaign.
- If the selected source is missing, behind, or disagrees with its backup at the same revision, don't reset or import to make the numbers agree. Check the invite with the other player. **Room → Backup** can export available copies separately. Pre-update local backups are left in place; there is no automatic merge or cross-room restore. For a valuable campaign, keep a separate export: public relays and browser storage are not guaranteed backups.

`node --test test/room-sync.test.cjs` exercises those paths with independent profiles and clocks, distinct oil and garrisons, old bookmarks, partial reads, offline locks and a room switch during a pending write. The browser check below repeats re-entry on real loopback brokers.

## Personal command points

Each post starts a new war with **10 CP**, regains **1 CP every 30 seconds** of elapsed game time and can hold **20 CP**. This includes offline posts. Neither faction nor formations change the rate. Orders spend the issuing post’s points; two devices signed into the same post use the same balance. Manpower, steel, oil and gold remain faction resources. A successful honeytrap or decapitation takes up to 2 or 6 whole CP, respectively, from **one** randomly chosen opposing post with points to lose.

The upgrade settles time already owed under v6 at the old rate and old ownership. Each post missing a personal balance inherits its faction's last saved balance; a genuine zero or fraction survives. From the cutover onward the new 30-second rate applies. HUD projections do not write. New posts start with their own 10 CP. The World front clock below does not change CP income.

## Independent countries

Use the updated room on each participating device. Open **World front** for the operation clock, occupied national capitals, country ranks and latest dispatch. A new room still needs its first explicit player order: opening an invite, spectating or displaying a cache never creates a campaign.

- **Load-sensitive interval:** normally **90 seconds**, rising to **180 seconds** for a busy room. A 15-second counting window with four successful player orders, a lock/read taking at least 1.2 seconds, or a turn simulation taking at least 150 ms records a temporary backoff on the existing write. Quiet restores normal pace. A failed/expired background lock or slow confirmation also backs off the attempting device. No extra load-monitor requests, missed-turn replay or change to the five-second authority heartbeat.
- **One active post, either faction:** after a full interval of confirmed activity in a saved live campaign, any signed-in role can run a turn. All 70 independent countries train once per operation. Each country replenishes garrisons only in its current holdings, in installments. In capital-start rooms, formerly occupied home provinces such as Paris and New Delhi start with their countries; neutral provinces with no World front country have local defenders instead. Four drills raise a rank, up to V. Training doubles if either faction holds eight provinces that started neutral in that room’s layout or has level III+ doctrine/mastery; a country gains another drill for fighting. Major powers start at II and rebuild faster (Soviet armor, American air, Japanese and British fleets, Chinese artillery).
- **Capital recovery:** a country can challenge whoever holds its home capital, including a rival independent or an occupier on the starting map. It uses its own neighboring army if possible, with a home guard and a fleet for a sea route. If no expedition can reach the capital, local resistance recruits `1 + floor(rank / 2)` infantry per active turn, even if the country has no land. At `4 + 2 × rank` it can fight. The same battle resolver handles defense, losses and occupation: a failed uprising keeps only its survivors in reserve; a successful one leaves its survivors in the capital. Berlin and Nigeria are never independent objectives.
- **Other raids still need both factions.** At most one battle happens per operation. Ready capital recoveries rotate between countries; if regular border raids are also eligible, alternate operations are available for them. Ordinary expeditions take troops from a connected garrison and alternate defending player factions when possible. Their stricter two-way check still requires a full paired interval and a fresh, post-deadline Dawn reply to a Reich challenge. Multiple clients share the same turn, not one turn per device.
- **AFK after five minutes without input.** The HUD shows the countdown. Pointer, touch, keyboard, click, wheel or form input on *this device* restarts it; a heartbeat, incoming game state or HUD repaint does not. An AFK player stays signed in and can watch, but does not count. The last eligible player going AFK, leaving or disconnecting pauses independent turns. Returning after a gap starts a fresh interval; no missed upgrades, reserves or battles are banked. No AFK clock or presence record goes in the save. This does not change normal resource income.
- **Live authority:** eligible clients check in every five seconds. MQTT requires this tab's current non-retained echo on the selected, state-confirmed broker (never BroadcastChannel); document stores require a successful live muster read. Check-ins expire after 18 seconds. Before a turn the client also needs the room lock, the same confirmed campaign/revision/origin/turn, valid credentials on the locked roster, an unexpired lease and an active local deadline. Victory, stale cache, incompatible rules and missing saves fail closed. A verified pair gets a short opportunity to run its raid before a solo writer proceeds. The normal income/HUD clock does not run the simulation.
- Firebase uses `/muster/{reich,dawn}` beside state/lock and conditional state writes. The shared DB uses `muster-reich`/`muster-dawn` in the game's collection. With custom permissions, allow players to read and write the signal slots. MQTT uses the broker-echoed cooperative lease and confirmed state publication. Presence is cooperative, **not** server-side authentication; signals carry no passwords or verifiers. Older builds do not implement personal CP, AFK or the updated muster; use the current build throughout the room. Sleeping tabs and badly mismatched clocks may pause rather than simulate unconfirmed turns. MQTT is not transactional.

## Log → map

Tap an underlined country or province in **Log** to select the recorded event site and bring the map into view, without leaving the timeline or issuing an order. A country named in a battle report leads to the battlefield, not its home capital; a named expedition origin or troop-movement endpoint leads to that province. In new worldwide upkeep reports, expand **Countries active this turn** to jump to a representative site per affected country: the recruiting resistance first, otherwise a reinforced garrison or the country's training location. These sites are recorded at the time of the turn, not reconstructed from current borders.

Existing v6 saves need no reset. Older battles and recognizable place-specific orders remain navigable; old worldwide totals have no historical list of sites. Non-geographic entries stay plain text, and the Log still filters private events by faction. `node --test test/log-map.test.cjs` covers positional names, legacy entries, and read-only navigation. The optional World front browser check below also taps a country in a battle and keyboard-activates a country in a worldwide report on a phone-sized map.

## Black Dawn appointments

**Council → Black Dawn hierarchy** opens the faction charter. Its eight named appointments are linked to the existing posts; the unspecified sixth seat (VI) is not an extra login. The charter is separate from the roster of players enrolled in a particular room. Official titles replace the old starter labels on screen, alongside any custom room titles. Game roles still determine order permissions. Dawn office labels do not rename accounts, change password salts or confer extra attack seats.

`node --test test/dawn-charter.test.cjs` checks the order of authority, sign-in keys, custom titles, similarly named enlistees, and a post removed in a higher revision. The optional mixed-build browser run below also opens the charter from the full roster and returns by keyboard at phone width.

## Core suite (no dependencies or network)

From the repository root, on Node 22 or 24:

```sh
node --test
node --test --test-concurrency=1
git diff --check
```

`test-support/war-room.cjs` runs the application's actual inline script in a VM with disposable storage, sockets, a DOM fixture and controllable time. Tests exercise both factions, all 73 formations and their four tracks, 8,760 batch-price combinations, fixed-roll battles, stale quotes, permissions, duplicate orders, and malformed or late saves. `test/unified-campaign.test.cjs` covers captured HQs, unit conservation, saved progress, Dhruv name collisions, chief and attack limits, stale appointments, and player attacks over direct land and sea links. Disconnected orders must not change the save or spend CP or oil. The rollout tests cover missing lock/save echoes, backend switches, imports, resets, conditional upgrades with Firebase pruning/ETags/stream races, and shared-DB state and lock paths. The Firebase and shared-DB adapters in these tests use fixtures, **not hosted services**.

`test/independent-armies.test.cjs` checks home assignments, rank and garrison caps, real losses and annexation, expedition and local-resistance liberations, and 1,000 seeded operations. `test/independent-presence.test.cjs` drives the MQTT, Firebase and shared DB paths: solo play on either side, same-faction duplicates, AFK expiry and input, wake after sleep, stale/retained signals, disappearing saves, lease expiry, conflicts, racing player orders, slow locks, four-order bursts and recovery to the normal interval.

## Compare against the pre-mastery engine

Use a temporary directory outside the checkout. The reference is the historic game engine, not an expected-value formula copied from the new code. If a reference commit is missing from a shallow clone, fetch that commit by SHA first.

```sh
work=$(mktemp -d)
export EOT_CLASSIC_HTML="$work/classic.html"
git show b1df2301c7d5cea978ec721357f9c317dfd4d741:index.html > "$EOT_CLASSIC_HTML"
node tools/rules-parity.cjs
# Optional longer run with a different, reproducible scenario sequence:
EOT_PARITY_SEED=4135 EOT_PARITY_BATTLES=10000 node tools/rules-parity.cjs
```

This checks the retained historical starting layout, accounting for the new version, HQ, post and personal CP, all legitimate map connections, 1,460 recruitment attempts (including caps), 168 doctrine purchases and 1,200 reproducible land/sea battles, including subsequent faction income, 30-second personal CP accrual and victory checks. Parity battles exclude the two provinces with intentionally changed HQ outcomes; the unified campaign tests exercise those separately. The v6 save has **one** `PER` province (Lima); removing its duplicate map node/self-route must not rename it or change the existing economy and score weights.

## Mixed-build browser test (optional, Linux x86-64)

With the same temporary `work` directory as above:

```sh
export EOT_V6_HTML="$work/previous.html"
git show 6604204e01b68238901b06bf1fa149aa11c83919:index.html > "$EOT_V6_HTML"
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

The script starts an ephemeral loopback HTTP server and **three separate real MQTT/WebSocket brokers**. Synthetic officers use the previous v6 Mastery build and the current build in Chromium. App sockets are redirected to the local brokers; external requests are blocked. No public room code, login or Firebase URL is needed.

Set `EOT_ONLY_INTERFACE=1` to run the current-build interface scenario without legacy HTML. Three profiles check every directory entry and region preset, mobile Orders versus Troops, two capped recruits at Lima, sign-in during a teammate’s order, masked enlistment, trade field labels/drafts, keyboard containment and return from Room, blocked versus legal crossings and Dawn’s actual treaty penalty. `node --test test/campaign-interface.test.cjs` also covers treaty expiry with an attack already open, stale quotes and faction-specific doctrine unlocks.

The re-entry scenario gives Classic, Mastery and a divergent relay different oil and garrisons. A phone leaves; its teammate recruits while it's gone. On a bare revisit, the phone must show **no stock or troops** while the broker's state delivery is suppressed, then the correct HUD and map in Orders on reconnect. The run checks all three retained records: only the teammate's deliberate recruitment changed one. It then creates a new room on the phone, checks the two HQs before any write, enlists a post and rejoins on desktop to verify the same starting board without touching the previous save. Use `EOT_ONLY_REENTRY=1` to run just this scenario without legacy HTML.

The full run checks an occupied-Nigeria v6 upgrade while an old client is still connected: neither the old tab nor a reconnect can overwrite v7. On a phone, a leader grants and revokes a seat while Dhruv signs in with a **synthetic fixture credential**, finds Tokyo out of reach, captures neighboring Copenhagen from Berlin, and recruits there only after promotion to chief. `EOT_ONLY_COMMAND=1` runs this scenario without a reference HTML file. The suite also exercises concurrent purchases (including a 160 ms uplink delay), all 73 dossiers, full-page axe checks, keyboard/touch controls and 320–1440 px layouts.

These are regression checks, not a guarantee against all failures of public brokers. Mastery uses a broker-echoed cooperative lease and confirms state publications; MQTT is not a transactional database. For server-side conditional writes, the Firebase path uses ETags. Browser automation here covers Chromium, not every browser or assistive technology.

The browser run also starts an independent-front campaign with two Reich devices and one Dawn device. Chromium clocks advance while real MQTT packets, lock echoes and retained saves travel normally. The test checks a single liberation of Moscow across all three devices, continued training with only Dawn present, a frozen front after AFK, then exactly one fresh operation after keyboard return. It also checks the dispatch, a mobile jump to Japan, axe and responsive widths. To run **just** this part with the optional browser dependencies above (no legacy HTML needed):

```sh
EOT_ONLY_FRONT=1 LD_LIBRARY_PATH="$work/libs/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" node tools/mixed-room-smoke.cjs
```
