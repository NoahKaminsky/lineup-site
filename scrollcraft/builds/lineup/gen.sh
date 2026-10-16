PRE="Editorial interior photography for a premium grooming and beauty studio, shot on a medium-format digital camera with a 45mm lens at eye height. Bright natural daylight from large windows on the left, one soft key, huge white bounce, gentle soft contact shadows. High-key, low contrast. Colour grade of warm white, pale gray concrete, deep black leather and brushed chrome; no saturated colour anywhere. Fine film grain, real material texture, slight imperfections. Photographic realism. NOT 3D render, NOT CGI, NOT illustration, no people, no text, no logos, no plastic sheen."
K=~/.claude/skills/scroll-craft/scripts/kie.mjs
ROOM="Scene: an architectural photograph of a bare, unfurnished room seen straight on. A long seamless warm-white plaster back wall. A pale polished concrete floor meets the wall in one clean straight horizontal line. Soft window light and window-frame shadows fall across the wall from the left, fading to the right. The room contains absolutely nothing: no furniture, no chairs, no stools, no tables, no mirrors, no plants, no objects of any kind. Bare wall and bare floor only."
OBJ="Isolated product photograph, front three-quarter view at eye height, the whole object fully in frame, centred, with generous empty margin on every side. It stands on a pure white seamless floor against a pure white seamless background, with one soft contact shadow directly beneath it. Nothing else in the frame."
node $K still "$PRE

$ROOM The floor line sits about 22 percent up from the bottom of the frame. Large empty wall across the whole upper three quarters of the frame." out/plate-16x9.png --ar 16:9 > out/log-plate.txt 2>&1 &
node $K still "$PRE

$ROOM Portrait framing. The floor line sits about 30 percent up from the bottom of the frame. Large empty wall across the whole upper two thirds of the frame." out/plate-9x16.png --ar 9:16 > out/log-plate-m.txt 2>&1 &
node $K still "$PRE

$OBJ Subject: a classic heavy hydraulic barber chair with black leather upholstery, a padded headrest, black leather armrests, a brushed chrome footrest and a round brushed chrome base." out/st-barber.png --ar 3:4 > out/log-1.txt 2>&1 &
node $K still "$PRE

$OBJ Subject: a modern salon hair styling chair with a black leather seat and rounded back, slim armrests, on a round brushed chrome hydraulic base." out/st-styling.png --ar 3:4 > out/log-2.txt 2>&1 &
node $K still "$PRE

$OBJ Subject: a minimal manicure station: a slim matte black table with a white top, a small chrome nail lamp, a neat row of clear and nude nail polish bottles, and a low black leather client stool beside it." out/st-nail.png --ar 3:4 > out/log-3.txt 2>&1 &
node $K still "$PRE

$OBJ Subject: an eyelash extension treatment bed: a long black leather daybed on brushed chrome legs with a folded white towel at the head end, and a slim chrome ring light on a stand beside the head." out/st-lash.png --ar 3:4 > out/log-4.txt 2>&1 &
wait
tail -n1 out/log-*.txt
