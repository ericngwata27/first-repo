// Copies the libraries, fonts, globe pictures and map data the site uses
// from node_modules into the site's own folders, so the site loads
// NOTHING from other servers (no Google Fonts, no unpkg, no jsDelivr).
// Visitors' IP addresses then only reach GitHub Pages (and Supabase
// when they sign in).
//
// Run it after changing a version in package.json:
//   npm install
//   npm run vendor
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const NM = "node_modules/";

// [from (inside node_modules), to (inside the site)]
const FILES = [
  // The 3D globe
  ["globe.gl/dist/globe.gl.min.js", "vendor/globe.gl/globe.gl.min.js"],
  ["globe.gl/LICENSE", "vendor/globe.gl/LICENSE"],
  ["globe.gl/example/datasets/ne_110m_admin_0_countries.geojson", "vendor/globe.gl/countries.geojson"],

  // three.js (for the Earth's look and the Glow switch)
  ["three/build/three.module.min.js", "vendor/three/build/three.module.min.js"],
  ["three/build/three.core.min.js", "vendor/three/build/three.core.min.js"],
  ["three/examples/jsm/postprocessing/UnrealBloomPass.js", "vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js"],
  ["three/examples/jsm/postprocessing/Pass.js", "vendor/three/examples/jsm/postprocessing/Pass.js"],
  ["three/examples/jsm/shaders/CopyShader.js", "vendor/three/examples/jsm/shaders/CopyShader.js"],
  ["three/examples/jsm/shaders/LuminosityHighPassShader.js", "vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js"],
  ["three/LICENSE", "vendor/three/LICENSE"],

  // The Earth pictures (NASA imagery, shipped with three-globe)
  ["three-globe/example/img/earth-night.jpg", "textures/earth-night.jpg"],
  ["three-globe/example/img/earth-blue-marble.jpg", "textures/earth-blue-marble.jpg"],
  ["three-globe/example/img/earth-water.png", "textures/earth-water.png"],
  ["three-globe/example/img/earth-topology.png", "textures/earth-topology.png"],

  // Icons
  ["lucide/dist/umd/lucide.min.js", "vendor/lucide/lucide.min.js"],
  ["lucide/LICENSE", "vendor/lucide/LICENSE"],

  // Accounts (Supabase)
  ["@supabase/supabase-js/dist/umd/supabase.js", "vendor/supabase/supabase.js"],
  ["@supabase/supabase-js/LICENSE", "vendor/supabase/LICENSE"],

  // Fonts (the same open-source fonts Google Fonts serves)
  ["@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2", "fonts/manrope-latin.woff2"],
  ["@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2", "fonts/manrope-latin-ext.woff2"],
  ["@fontsource-variable/manrope/LICENSE", "fonts/LICENSE-manrope.txt"],
  ["@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2", "fonts/figtree-latin.woff2"],
  ["@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2", "fonts/figtree-latin-ext.woff2"],
  ["@fontsource-variable/figtree/LICENSE", "fonts/LICENSE-figtree.txt"],
];

await rm("vendor", { recursive: true, force: true });
for (const [from, to] of FILES) {
  await mkdir(dirname(to), { recursive: true });
  await cp(NM + from, to);
  console.log("copied", to);
}
