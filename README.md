# Spider-Man: The Pixel Trilogy

All three Raimi films, retold from memory as a 10-minute pixel-art movie. Subtitles only, no audio.
Unofficial fan parody, not affiliated with Sony or Marvel.

## Watch

Open `index.html` in a browser. Space plays and pauses, the arrow keys skip 10 seconds, N and P jump between scenes, and F goes fullscreen.

## Visuals

There are 53 scenes. Each one has hand-coded procedural pixel art, so the movie works with nothing else installed.

You can optionally swap in OpenAI-generated stills:

```bash
OPENAI_API_KEY=... node generate-visuals.mjs            # renders frames/NN.png for each missing scene
node generate-visuals.mjs --dry-run                     # preview the prompts without calling the API
OPENAI_IMAGE_QUALITY=medium node generate-visuals.mjs --only 3,15 --force
```

When `frames/NN.png` exists, `index.html` shows that image for the scene, downscaled to 320×180 so it reads as pixel art, with a slow pan. Any scene without an image keeps the procedural art. The script reads the scene list straight out of `index.html`. It swaps character names for plain descriptions, because image models often refuse trademarked names. Any scene that is still refused is skipped.
