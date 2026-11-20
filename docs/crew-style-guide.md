# Crew style guide and recruiting template

Portraits are generated with an image model (Gemini) and placed in the comm-feed frames of the Herdr mockups. Claude cannot generate photographic or painted images; it writes the prompts, crops the results and places them.

## Decision (2026-11-19)

The look is **photographic**: cinematic, realistic stills, as if taken from a live-action sci-fi series. A painted style was the first plan; the first Gemini batch came out photographic and that look was kept.

## Rules for every portrait

- Photorealistic cinematic still, realistic skin and materials, soft film lighting with a rim light.
- Original characters only, not based on any existing game, film, series or person.
- No insignia, badges, emblems or logos on the uniform. The first batch came out with a chest badge resembling the Star Trek insignia; it was cropped out of the mockups and must not appear in future portraits.
- Tight bust shot: head and shoulders fill the frame, centered, facing the viewer as if on a video call from a starship. The first batch was wide scene shots, which leaves the face small and soft once cropped.
- Background: starship bridge, out of focus, lit in the ship's accent color. The same color appears as trim on the uniform.
- Portrait orientation, 4:5. No text, frame or watermark.
- Do not bake in scanlines or a lo-fi filter: the comm-feed frame adds those.

## Current crew portraits

The four first-batch source images (wide shots, 16:9) are kept in the Claude project files, not in this repository. The mockups use head-and-shoulders crops of them.

| Crew | Ship | Source file |
| --- | --- | --- |
| Vega, human captain | Emauria | `1795146431619.jpg` |
| Orrin, alien lieutenant | Emauria | `1795146491503.jpg` |
| Brass, robot captain | ccbox | `1795146557119.jpg` |
| Nyx, alien captain | Demo lab | `1795146551133.jpg` |

## File naming

`<name>-<state>.jpg` or `.png`, lowercase. States: `base`, `working`, `thinking`, `hailing`, `drones`, `ci`, `done`, `asleep`.
Example: `vega-base.jpg`, `vega-hailing.jpg`.

## Ship colors

| Ship | Accent |
| --- | --- |
| Emauria | cyan #4CC9F0 |
| ccbox | amber #F5A623 |
| Demo lab (sample project) | violet #B69CFF |

Pick a new accent for each new ship that differs from the others in lightness as well as hue.

## Portrait prompt

Paste the shared style block followed by one character block as a single message.

### Shared style block

```
Photorealistic cinematic still from a live-action science fiction series: realistic skin and materials, soft film lighting with a rim light, shallow depth of field. Original character, not based on any existing game, film, series or person.
Framing: tight bust shot, head and shoulders filling the frame, centered, facing the viewer as if on a video call from a starship.
Background: starship bridge, out of focus, lit by instrument glow in the accent color given below. The same accent color appears as trim on the uniform.
No insignia, badges, emblems or logos anywhere on the uniform.
Portrait orientation, 4:5 aspect ratio. No text, no frame, no watermark.
```

### Vega, captain of the Emauria

```
Character: a human starship captain in her forties, calm and sharp-eyed, short dark hair with a streak of grey, a thin scar through one eyebrow. Dark fitted flight jacket with a high collar and two rank bars. Accent color: cyan (#4CC9F0). Expression: focused and composed.
```

### Orrin, lieutenant of the Emauria

```
Character: a tall, slender alien lieutenant with smooth blue-grey skin, large dark reflective eyes, no hair, and subtle ridges along the temples. Gentle, attentive manner. Dark fitted uniform with a high collar and one rank bar. Accent color: cyan (#4CC9F0). Expression: curious and alert.
```

### Brass, captain of the ccbox

```
Character: a weathered robot captain with a boxy brushed-metal head, a single large glowing optical lens, visible bolts, scuffs and a short antenna. Sturdy and dependable. A worn officer's coat draped over metal shoulders. Accent color: amber (#F5A623), also the color of the lens glow. Posture: steady, slightly tilted head.
```

### Nyx, captain of the Demo lab

```
Character: an alien captain with an angular, narrow face, pale lavender skin, a crest of short dark quills in place of hair, and bright narrow eyes. Quick and inventive. Light asymmetrical flight suit with a raised collar. Accent color: violet (#B69CFF). Expression: a slight confident smile.
```

## State variants

Once a base portrait is approved, stay in the same chat so the model keeps the reference, and send:

```
Same character, same outfit, same framing, same lighting and background as the image above. Change only the pose and expression:
[one line from the list below]
```

- Working: looking down at a console just below the frame, concentrated.
- Thinking: gaze up and to the side, hand near the chin.
- Hailing: looking straight at the viewer, leaning in, about to speak.
- Drones (on subagents): looking up and slightly aside, watching something overhead.
- CI: glancing sideways at an off-screen display, waiting.
- Done: leaning back, relaxed, satisfied.
- Asleep: eyes closed, head tilted, bridge lights dimmed.

## Recruiting a new crew member

1. Pick the ship's accent color (reuse it for every crew member of that ship).
2. Write a character block: species (human, alien or robot), two or three distinctive visual traits, outfit, rank bars (two for a captain, one for a lieutenant), accent color, default expression.
3. Generate the base portrait, then the "hailing" variant first to check the face stays consistent.
4. Generate the remaining states and save them with the naming above.

Names, species and looks of the four characters above can be changed freely.
