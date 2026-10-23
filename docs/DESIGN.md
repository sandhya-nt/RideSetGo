# RideSetGo Design System

## Palette (CSS variables in src/index.css)
--bg #FAF7F2 (warm cream) --surface #FFFFFF --surface-soft #F3EEE6 --text #2B2623 --text-muted #7A7068 --border #EAE3D9 --primary #E60023 --primary-soft #FFE3E7
Accents: sage #A8B89A, blush #F2C9C4, sand #E8D8BE, sky #BFD7E3, lavender #D6CDEA. Success #5E9B6E, Warning #E3A857, Danger #D6455D.

## Fonts
Headings: DM Serif Display. Body/UI: Inter/Poppins (Google Fonts).

## Spacing & shape
Scale 4/8/12/16/24/32/48. Cards radius 16-24px, buttons/pills 999px. Shadows soft (0 8px 24px rgba(43,38,35,0.06)).

## Components
.btn-primary .btn-secondary .btn-ghost .btn-danger .card .card-hover .input-field .label .pill .skeleton

## Dark mode
Toggle adds `.dark` to <html>, persisted in localStorage key `rs-theme`.

## Adding a page
Use card containers, input-field, btn-primary. Avoid hard-coded colors; use Tailwind tokens (rsgo-*, orange-*, success/warning/error).
