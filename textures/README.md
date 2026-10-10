# Globe pictures

The 4096 × 2048 NASA pictures the globe uses (`earth-night.jpg`,
`earth-blue-marble.jpg`, `earth-water.png`, `earth-topology.png`) are in this
folder, copied by `npm run vendor`, so visitors' browsers don't fetch them
from another server.

## Sharper 8K pictures (optional)

The 3D globe looks sharpest with two 8192 × 4096 pictures in this folder:

- `earth-day-8k.jpg`: the Earth in daylight
- `earth-night-8k.jpg`: the Earth at night (city lights)

If they're here, the globe swaps to them after loading (and lets you zoom in
closer). If they're missing, it keeps using the 4096 × 2048 pictures
above, so nothing breaks.

Keep each file under about 10 MB so the globe still loads quickly on phones.

## Where to get them

Solar System Scope offers NASA-based Earth maps at exactly the right size,
free under the CC BY 4.0 licence (credit required):
https://www.solarsystemscope.com/textures/

1. Download **8K Earth Day Map** and **8K Earth Night Map**.
2. Rename them to `earth-day-8k.jpg` and `earth-night-8k.jpg`.
3. On GitHub, open this `textures` folder, choose **Add file → Upload files**,
   and upload both.
4. Add "Earth textures: Solar System Scope (CC BY 4.0)" to the footer
   credit in index.html.
