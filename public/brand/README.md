# InSight AI Brand Assets

These are approved public exports of the official InSight AI identity. The private high-resolution source remains in the company asset vault and local `.company/assets/` mirror.

## Core exports

- `insight-ai-mark.png`: transparent standalone eye/check mark.
- `insight-ai-wordmark.png`: navy/teal wordmark for light surfaces.
- `insight-ai-wordmark-on-dark.png`: white/teal wordmark for dark surfaces.
- `insight-ai-lockup.png`: stacked official lockup for light surfaces.
- `insight-ai-horizontal.png`: horizontal lockup for light surfaces.
- `insight-ai-horizontal-on-dark.png`: horizontal lockup for dark surfaces.
- `email-header.png`: white-canvas header prepared for transactional email.

## Generated campaign exports

The `marketing/` directory contains a square social profile image, social banner, launch graphic, investor-cover base, and Apple startup image. The `social/` directory contains Open Graph and Twitter/X preview cards.

Do not stretch, rotate, recolor, outline, add effects, or rearrange the mark. Use light-surface assets on white or very pale neutral backgrounds and `-on-dark` assets on navy or dark photographic backgrounds. Keep clear space equal to the central check-mark stroke width around the visible artwork.

## Regeneration

Run `npm run brand:assets` from the repository root. The script reads the approved private master from `.company/assets/ChatGPT Image Jul 19, 2026, 12_08_27 AM.png` and deterministically regenerates every export, favicon, app icon, and social image.

The generated files are production assets. Do not hand-edit them; update the generator or approved master and regenerate instead.