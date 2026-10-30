# Open Defense Fortress (English summary)

**A fixed-tower tower-defense roguelike. 100% offline, zero runtime dependencies.**

[Español](README.md) · [Web demo](https://faint-desert-zjv5.here.now/) · [Design](docs/DESIGN.md) · [Credits](docs/CREDITS.md) · [Contributing (ES)](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

[![CI](https://github.com/Javierkaiser/open-defense-fortress/actions/workflows/ci.yml/badge.svg)](https://github.com/Javierkaiser/open-defense-fortress/actions/workflows/ci.yml)

Defend a volcanic base from falling meteors, rock/virus swarms, spores, crystals and family tanks.
Towers fire automatically: you manage the run economy, time speed, the Ultimate
and the upgrade cards offered on level-up. Every run is a roguelike.

## Highlights

- 50-stage campaign, endless mode (51+), survival (infinite waves), daily
  challenge and the Heat/Protocol modifiers.
- 8 towers + 3 drones, each with a signature mechanic (suppression, melt, judgment, ion, crater, rail, cut, ignition, venom and bubble), 84 cards, 7 elite affixes, 5 visual themes.
- No ads, no purchases, no accounts, no telemetry.
- Canvas 2D + DOM/CSS + ES modules; no build step, no server, no network calls.
- 974 Node tests.

## Run it

```bash
# Node 22+
node scripts/serve.mjs 8080
# open http://localhost:8080

# tests (974) + static checks
node --test "tests/test-*.mjs"
node .github/scripts/ci-checks.mjs
```

CI runs the suite on Linux, macOS and Windows with Node 22 and 24
(`.github/workflows/ci.yml`); every PR must pass that matrix.

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

The Capacitor 8 Android base lives in `mobile/`. A manual GitHub Actions
workflow (“Android CI (debug)”) builds a debug APK; no keystore or Play upload
yet. It keeps the same web codebase and adds native back, pause/audio,
keep-awake, safe areas and a credits/licenses screen. See
[docs/ANDROID.md](docs/ANDROID.md). Play Store link pending.

## License

Code: [MIT](LICENSE) — the `LICENSE` file contains only the canonical MIT text.
Assets keep their own licenses (CC0, CC BY 3.0, OFL 1.1); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[docs/CREDITS.md](docs/CREDITS.md). The Ultimate icon is by **Lorc**
(game-icons.net), CC BY 3.0, recolored.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (Spanish) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Issues and PRs are welcome **in English
or Spanish**. The project is deliberately zero-dependency: no npm packages in the
runtime, no build step. UI changes need a screenshot; logic changes need tests.

Security issues: please use GitHub's private advisory reporting
(<https://github.com/Javierkaiser/open-defense-fortress/security/advisories/new>),
not a public issue.
