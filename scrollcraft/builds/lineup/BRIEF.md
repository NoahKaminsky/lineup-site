# LineUp landing — BRIEF

Interviewed 2026-10-16. Verbatim answers are quoted. Q4, Q5 and Q7 were left to
Claude ("idk you figure that one out"), so those are marked **Authored**.
Standing constraints come from earlier sessions (memory: landing-not-templated).

## Interview

1. **Vibe / references.** "make it themed to the things of lineup like salons,
   barbershops etc." Standing: Geist only, black / white / gray, light sections,
   restraint. Rejected before: serif display, gold/orange accent, emerald, dark
   full sections, ticker, floating chips, swashes, arrow-in-circle buttons.
2. **Journey.** "i like the order you have, fix the app tour it seems very messy."
   Order holds: hero → app tour → for clients → for pros → founders → close.
3. **Energy.** "it should feel intense on the first part where it introduces what
   lineup is because it needs to be engaging and captivating like apples products
   when they reveal new ones." Intense open, calmer middle, quiet founders, firm close.
4. **Feeling + one moment.** *Authored.* See curve and peak below.
5. **Something no site does.** "idk you figure that one out but there is not
   LineUp so this is the firxt of itskind." *Authored:* see signature move.
6. **Range.** "can stay on the minimilast end but i want it to be pretty cool still."
   Premium-minimal, with the reveal doing the "cool".
7. **One world or scenes?** *Authored:* distinct scenes. The order is fixed
   sections, and the only true "place" is the hero.
8. **Assets.** "lets generate it to start." Generate photoreal via kie.ai. Real
   app screenshots (`public/images/app-screenshots/`) stay the only UI imagery:
   no generated UI, ever.

**Audience.** "id say more so pros but you also need clients to provide business
to pros." Pros primary, clients essential. **One action:** `Join LineUp`.

**What the visitor must believe by the end (authored from the above):** on
LineUp, clients post what they want and local pros come to them. Neither side
has to chase the other.

## World

High-key editorial, photographic. A real-feeling working studio in daylight:
white walls, pale concrete, black leather and chrome. Black / white / gray by
nature, so the photography *is* the brand palette. No props with colour.

Style preamble (verbatim in every prompt):

> Editorial interior photography for a premium grooming and beauty studio,
> shot on a medium-format digital camera with a 45mm lens at eye height.
> Bright natural daylight from large windows on the left, one soft key, huge
> white bounce, gentle soft contact shadows. High-key, low contrast. Colour
> grade of warm white, pale gray concrete, deep black leather and brushed
> chrome; no saturated colour anywhere. Fine film grain, real material
> texture, slight imperfections. Photographic realism. NOT 3D render, NOT
> CGI, NOT illustration, no people, no text, no logos, no plastic sheen.

## Journey (beats)

1. Reveal — what LineUp is, at product-launch volume.
2. Proof — the real app, step by step, cleanly.
3. Client side — post once, offers come to you.
4. Pro side — the request lands with you; why pros join.
5. Who — two founders, Winnipeg.
6. Commitment — Join LineUp.

## Feeling curve

```
0  Anticipation  a near-empty white frame, one word: "LineUp." Authored silence.
1  Awe (PEAK)    the word parts, the camera pulls back through the studio, the
                 stations line up (barber chair, styling chair, nail table, lash
                 bed), and a phone rises between them, already live
2  Clarity       one phone, held still, the real app steps through four moments
3  Agency        the visitor builds a request; example offers line up beside it
4  Recognition   (pros) that same request lands on a pro's phone: "that's my client"
5  Trust         two names, a city, plain sentences, nothing moving
6  Resolve       the studio again, one chair turned toward the visitor, one button
```

Adjacent pairs differ. 0 is the authored silence before 1 (tell the harness:
the first ~0.4vh of the hero is intentionally sparse).

## The peak

> "the word LineUp split open and the camera pulled back through a whole studio,
> every chair lined up, and then the phone rose up right in the middle."

Lives in act 1 (hero). Gets the generated asset budget and the longest span.

## Signature move

**The request crosses the page.** In the client act the visitor composes a real
request (service, where, when). That exact request becomes a physical card that
leaves the client act and, as the visitor scrolls into the pro act, lands on the
pro's phone as an incoming request with a "new" ping. The thing LineUp does
(client posts, pro receives) is performed by the visitor's own scroll. Example
offers and prices are labelled as examples.

## Tell-someone

> "It's the site where you post a request as a client, keep scrolling, and it
> shows up on the barber's phone as a pro."

## Grammar

**Two-sided relay** (new). The page has two halves (client side, pro side) and one
object carried across the line between them.

- **Nav:** wordmark, a two-state side indicator (`Clients · Pros`) that flips as
  the visitor crosses the handoff and jumps to either side, `Join LineUp`.
  Not a section list.
- **Hero:** layered photographic reveal (not a scrub video).
- **Sequence:** reveal → pinned proof → composer → receiver → quiet → close.
- **Close:** the handoff completes ("Booked"), back in the studio; one CTA.
- **Bans:** section numbers / counters, chapter readouts, card grids, pan rails
  (the old messy tour), spotlight, magnetic buttons, more than one scrub,
  dark full-bleed sections, scroll cues.

Why not the eight: filmic one-shot is closest to "Apple reveal" but forbids the
tool-like composer that carries the signature; split stage bans full-bleed before
the resolve (kills the reveal); live surface bans photography; editorial and
poster starve the "intense" open; gallery and cutlist fit a range or energy brand,
not a two-sided handoff; continuous world needs a geography this story lacks.

## Fingerprint gate

Registry empty (first build). Passes trivially. Row appended after ship.

## Shipped (2026-10-16)

- Lives in the Next.js app: `app/components/landing/` rendered from `app/page.tsx`.
  GSAP ScrollTrigger (already in the project) drives the motion instead of the
  scrollcraft vanilla engine.
- Assets (`public/images/landing/`): studio-wide/tall plates + four station
  cutouts, white-normalised and composited with mix-blend-multiply.
  Sources in `out/`. ~110 kie.ai credits incl. two rerolls.
- User feedback applied: no trade labels under the stations (they exclude other
  professions); tour copy generalised to "beauty and grooming professionals".
- Clips (kling, scrubbed): hero-light (desktop only, driven by the hero pin progress) and close-turn (chair swivels to face you; mobile encode too). Reduced motion shows the last frame.
- Not verified: reduced-motion render, a real phone, clip smoothness by eye (browser pane was hidden; playhead mapping verified numerically).
