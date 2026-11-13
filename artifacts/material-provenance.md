# Ash Exchange surface textures

OpenAI ImageGen generated the original albedo atlas for Cinderline on November 11, 2026. The source image was 1254 × 1254 pixels. The game ships four texture sets derived from its quadrants.

| Atlas region | Runtime surface |
| --- | --- |
| Upper left | Mineral cement and the ochre and blue plaster variants |
| Upper right | Wet asphalt |
| Lower left | Oxidized corrugated steel |
| Lower right | Soot-darkened brick |

The bake cropped each quadrant, blended the opposing edges for tiling and adjusted diffuse gain for the game lighting. Tangent normals came from luminance gradients with a low-frequency bias removed. The roughness maps use local luminance variation and, on the steel, the color difference between rust and faded paint. Three.js samples the 512-pixel albedos in sRGB and reads the 384-pixel normals and 256-pixel roughness maps as linear data. The WebP files ship with the game and use the same origin. Each set keeps its original procedural material as a fallback if its images cannot load.

## ImageGen prompt

> Create a square 2-by-2 PBR material albedo atlas for an original realistic 3D game set in a decommissioned industrial heat exchange. Exactly four square panels occupying the four equal quadrants, flush edge-to-edge with no gaps and no borders. Hard exact transitions only at 50% width and 50% height. Top left: neutral medium gray weathered mineral cement plaster with small brownish weathered pits and very subtle stains, flat continuous surface. Top right: dark graphite wet asphalt with tiny pale pebbles, extremely detailed slightly uneven aggregate, restrained matte variation. Bottom left: faded desaturated petrol blue and brown oxidized corrugated steel with straight vertical ribs all the same width and with paint worn off along some ridges. Bottom right: dark sooty reddish brown industrial brick in running bond, very fine neutral charcoal mortar, plausible irregular brick colors. Strictly orthographic straight-on PBR diffuse reference photo scan, no camera perspective, no illumination gradient, no cast shadows, no hard glare, no logos, no text, no objects, no frames. Each tile should look like a real material at a roughly two-meter surface scale. Subtle texture and realistic high-frequency imperfections, no large stylized spots. Consistent soft diffuse studio lighting and dark industrial palette.
