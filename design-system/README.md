# Design system source

Source files for the AnswerEcho design-system artifact:
https://claude.ai/artifact/4tcdh5Ct1ot9CgnwnkBtVq

`project/` mirrors the artifact's files one-to-one — the brand book
(`project/README.md`), `tokens.json`, component previews, fonts, and the
artifact index (`design-system.json`, which records uploaded logo assets by
blob id).

## Keeping it current

Token values are generated, never edited by hand:

```sh
node design-system/generate-tokens.mjs           # regenerate project/tokens.json
node design-system/generate-tokens.mjs --check   # exit 1 if stale (CI-friendly)
```

The generator reads the app's real sources — `apps/web/src/styles.css` and
`packages/config/src/constants.ts` — so a theme or chart-palette change in the
app only needs a re-run. Usage notes live in the generator script.

Everything else (brand book, component previews, cover) is edited directly
under `project/`.

## Publishing

Publishing to the artifact goes through Claude Code: ask it to "republish the
design system from design-system/". There is no standalone publish CLI, so CI
can run `--check` to catch drift but cannot push updates itself.
