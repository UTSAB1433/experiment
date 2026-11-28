# Lands at the Ends of Time

A multiplayer strategy game on one shared map. In a new campaign, the Reich starts in **Berlin**, Black Dawn starts in **Nigeria**, and the other 199 provinces are neutral. Orders take effect when the room confirms them. There is no **End turn** button.

## Start a game with a friend

1. **Host:** Open **New Mastery room**, sign in or sign up, and choose the faction you want to lead. In **Campaign lobby**, press **Copy invite link** and send it to the other player.
2. **Guest:** Open the link, or paste it into **Room code or invite link**. Sign in with **your own** account and choose the other faction. If you both picked the same side, an unappointed guest Soldier can use **Picked the wrong side?** before launch.
3. **Host:** To let your opponent command attacks, use **Appoint** beside their name. Joining alone makes them a Soldier, not a commander. Once each side has a player, press **Start campaign**.

**Joining an existing game?** Use the invite from the player who sees the right map. It identifies the room *and* its data source. If the game says **Syncing** or **Offline**, wait for **Live** or reconnect; don't create a replacement room to recover your troops. The same browser remembers your sign-in until you sign out or clear its storage. Use a game-only password.

## Make your first move

Open **Orders** in the **Command desk**. The first card gives you a starting action for your actual role:

| Your post | Try this |
| --- | --- |
| Leader | **Open Berlin orders** or **Open Nigeria orders** → **Attack from here**. Pick a connected target and preview the force and oil cost before launching. Use **Council** to appoint teammates; only chiefs can recruit. |
| Chief of staff | Open a friendly province → **Recruit here** to add troops to that garrison. |
| Soldier | **Open field duty** → **Scavenge +5 Steel**. It costs no command points. All three duties share a personal cooldown. You can also scout foreign provinces. |
| Diplomat | **Open diplomacy** to offer a trade or ceasefire. To annex by treaty, select a neighboring neutral province with 12 defenders or fewer. |

**Resources belong to the faction; command points (CP) belong to the player.** Inspecting the map and previewing an order are free. On a phone, use **Tactical map** and **Command desk** to jump between them. To find a place by name, open the Orders **Directory**. **Locate** shows the selected province on the map.

**Winning:** Secure the enemy homeland and take the opposing faction’s last province, or hold **60% of all victory points for 45 minutes**. Taking a capital alone does not take its country. Use **World front → Country control** to see which states remain. Independent armies can fight back while a player is active.

Earlier saved campaigns keep their own map, logins and victory rules. For those differences, backup guidance and how to run the checks, see [TESTING.md](TESTING.md).

## Running it yourself

The whole game is one static file, `index.html`.

- **Play:** open `index.html` in a browser, or serve the folder (`npm run serve`, or any static host). Sign-in and the room relay need `https:` or `localhost`; opening the file directly from disk will not let you sign in.
- **Check it:** Node 22 or newer, then `npm test` (or `node --test`) from the repository root. No dependencies are installed or fetched; the suite runs the real engine in a sandbox with fake brokers, storage and clock.

## Leaving and coming back over several days

This is a campaign you play across sessions, so here is exactly what is — and is not — guaranteed.

- **Orders are durable.** Every confirmed order is stored as a retained record on the public relay (or your own Firebase database) under the room's own address, and mirrored into this browser. Both players can close the browser and come back later.
- **Your own copy exists too.** The room keeps a rolling autosave in this browser and can export the whole campaign as JSON (**Room → Copy save JSON** or **Download backup**). Export after a big session.
- **What a free public relay does not promise:** that it keeps a retained record forever, and that nobody else can write to the room. Use a unique room code, a game-only password, and your own Firebase database if you want the campaign to be permanent and access-controlled.
- **A long pause is not a windfall.** Income stops accruing after two hours away; the rest of the gap is simply not banked, so nobody returns to an absurd stockpile. Command points stay personal and hard-capped at 20.
- **If the room looks empty**, your save was probably not lost. The app shows the last revision it confirmed on that device and offers the cached copy, and it keeps trying the other public relays instead of waiting on one dead host.
