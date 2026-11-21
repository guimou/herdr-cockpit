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

`<id>-<state>.png`, lowercase, in `mods/cockpit/crew/`. `<id>` is the crew member's `portrait` in `fleet.js`. States: `base`, `working`, `thinking`, `hailing`, `subagents`, `ci`, `done`, `asleep`.
Example: `vega-base.png`, `vega-hailing.png`.

Only `base` is required. The mod shows a state's portrait when its file exists and the base one otherwise (standing by always shows the base), so variants can be added one at a time. Same size and crop as the base, or the face jumps at the cut. Run `tools/install.sh` after adding files; the mod notices new ones within a minute.

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

The reference is the base portrait itself, not the chat it came from. Open a new chat for each crew member, attach `mods/cockpit/crew/<id>-base.png`, and send:

```
This image is the reference: a photorealistic still of a character on a starship bridge. Generate a new image of exactly the same character: same face, same skin, same hair, same outfit, same lighting, same out-of-focus background, same tight head-and-shoulders framing, same 4:5 portrait format.
Change only the expression and the direction of the head and eyes:
[one line from the list below]
Keep every detail of the reference that is not the expression: the rank bars on the collar (same number, same side, same color), the trim and seams of the outfit, any equipment on the shoulders or chest, scars, skin markings, ridges, quills, antennas and lens glow. If the head turns, these stay where they are on the reference.
Keep the head the same size and in the same place in the frame. Do not zoom out, do not show the chest or the hands. No insignia, badges, emblems or logos anywhere. No text, no frame, no watermark.
```

- Working: head clearly lowered, eyes down on a console just below the frame, concentrated.
- Thinking: eyes turned far up and to one side, away from the camera, brow furrowed, lips pressed together.
- Hailing: looking straight into the camera, eyebrows raised, mouth slightly open, about to speak.
- Subagents: chin clearly raised, head tilted back a little, eyes following something overhead and to one side.
- CI: head turned a quarter to one side, eyes fixed on a display off-screen, waiting.
- Done: looking into the camera, relaxed, a satisfied smile.
- Asleep: eyes closed, head tilted slightly to one side.

For a robot or a character without a readable face, describe the same intent through the head angle, the lens or the eyes (a dimmed or shuttered lens for asleep, a brighter one for hailing).

Attach the base with every request, including in a chat that already has it: otherwise the model works from its own last image, and the small changes add up from pose to pose. One chat per crew member is fine as long as each request carries the base; start a new chat if a pose leaks into the next one. Generate "asleep" last, since it changes the lighting. The poses only move the face, because the frame is a tight bust: a hand or a lean makes the model zoom out, and then the head jumps when the picture is swapped.

### What the first set taught us (Vega, 2026-11-20)

- The face, hair, scar, framing and background held across all seven poses, with the base attached to every request.
- Small outfit details did not: the rank bars disappeared in four poses out of seven. Hence the "keep every detail" paragraph. Name the character's own details in it when they are unusual.
- Poses asked for with "slightly" came out close to the base (thinking, subagents, CI). The lines above now ask for more; an exaggerated request comes back moderate.
- "The lighting dimmer" for asleep was ignored, and is not needed: the mod dims an asleep portrait itself.
- Compare each result with the base before going on: same head size and place, same details. A result that is off is cheaper to ask again at once than to notice at the end.

### Saving the results

Gemini only downloads JPG, 928 x 1152, a little wider than 4:5. Save each one as `mods/cockpit/crew/<id>-<state>.jpg`, then convert them to PNG at the base's size (400 x 500) and set the originals aside:

```sh
cd mods/cockpit/crew && mkdir -p ../../../logs/crew-originals
for f in *.jpg; do
  ffmpeg -v error -y -i "$f" -vf "crop=ih*4/5:ih,scale=400:500:flags=lanczos" -pix_fmt rgb24 "${f%.jpg}.png" && mv "$f" ../../../logs/crew-originals/
done
```

## Recruiting a new crew member

1. Pick the ship's accent color (reuse it for every crew member of that ship).
2. Write a character block: species (human, alien or robot), two or three distinctive visual traits, outfit, rank bars (two for a captain, one for a lieutenant), accent color, default expression.
3. Generate the base portrait, save it as `<id>-base.png`, then generate the "hailing" variant from it first to check the face stays consistent.
4. Generate the remaining states and save them with the naming above.

Names, species and looks of the four characters above can be changed freely.
