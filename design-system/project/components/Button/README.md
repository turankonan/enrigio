# Button

The primary action control; variants default (primary green), secondary, outline, ghost, link and destructive, in sizes sm/default/lg/icon. Static rendition hand-styled from `packages/ui/src/components/button.tsx` — the real component is shadcn's Button consumed as `@workspace/ui/components/button`.

- One primary button per view; everything else is secondary, outline or ghost.
- Primary is the action green — in dark mode its text is ink, never white (contrast rule).
- Icon buttons use Phosphor icons at 16px with an accessible label.
- Consumers provide the click handler and content; disabled state covers pending work.
