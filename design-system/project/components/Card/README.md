# Card

The metric and content surface of the dashboard — stat tiles, chart containers, list panels. Static rendition hand-styled from `packages/ui/src/components/card.tsx` (shadcn Card via `@workspace/ui/components/card`).

- Cards use `card` + 1px `border` + `radius-lg` + `space-6` padding; no shadows.
- Metric values are Geist Mono with tabular numerals; labels and hints are 12px `muted-foreground`.
- Consumers provide header/content/footer slots; keep sibling cards on the same grid with equal padding.
