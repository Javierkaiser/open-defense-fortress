# Open Defense Fortress (English summary)

**A fixed-tower tower-defense roguelike. 100% offline, zero runtime dependencies.**

[Español](README.md) · [Web demo](https://faint-desert-zjv5.here.now/) · [Design](docs/DESIGN.md) · [Credits](docs/CREDITS.md)

Defend a volcanic base from falling meteors, spores, crystals and blobs.
Towers fire automatically: you manage the run economy, time speed, the Ultimate
and the upgrade cards offered on level-up. Every run is a roguelike.

## Highlights

- 50-stage campaign, endless mode (51+), survival (infinite waves), daily
  challenge and the Heat/Protocol modifiers.
- 8 towers + 3 drones, 48 cards, 7 elite affixes, 5 visual themes.
- No ads, no purchases, no accounts, no telemetry.
- Canvas 2D + DOM/CSS + ES modules; no build step, no server, no network calls.
- 837 Node tests.

## Run it

```bash
# Node 22+
node scripts/serve.mjs 8080
# open http://localhost:8080

# tests
node --test tests/
```

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Play / navigate | `Enter` | Tap |
| Pause | `P` / `Esc` | HUD button |
| Speed ×1 / ×1.5 / ×2 | `1` `2` `3` | HUD `x1` button |
| Ultimate | `Space` | Round button |
| Black Hole | `B` | `◉` button |
| Combo List | `U` | Cards button |
| Music | `M` | Music button |

## Android

Capacitor 8 + GitHub Actions packaging is planned. The Android app will be
offline and will keep the same web codebase. Play Store link pending.

## License

Code: [MIT](LICENSE). Assets keep their own licenses (CC0, CC BY 3.0, OFL 1.1);
see [docs/CREDITS.md](docs/CREDITS.md). The Ultimate icon is by **Lorc**
(game-icons.net), CC BY 3.0, recolored.
