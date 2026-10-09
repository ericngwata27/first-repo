// =========================================================
// PLANMYFUTURE: globe.js
// The 3D globe and finding a place's coordinates.
//
// Sections: 5. The 3D globe, 6. Finding a location's coordinates
// (The site's JavaScript is split into files that load in this order:
//  store.js, helpers.js, dates.js, globe.js, autofill.js, universities.js,
//  profile.js, auth.js, sync.js, main.js, timeline.js. The section numbers run across all of them.)
// =========================================================

// =========================================================
// 5. THE 3D GLOBE (using the Globe.gl library)
//
// A dark, minimal, slowly spinning globe with glowing dots for your
// universities. The night side shows city lights, the side where the sun
// is up right now is gently lifted, with a soft line between them, a faint
// ocean shine and a blue glow around the edge (see "The Earth's look" below).
// Dot colors (same as the legend):
//   gold = your first choice (star it on its details card)
//   red  = your date is under 15 days away, or overdue (see getMyDate)
//   blue = everything else
// Click a dot to fly to it and open its details card.
//
// The gear button opens the settings (saved in this browser):
//   Spin, Borders, Arcs from home, Glow
// =========================================================

let globe = null;

// Where the globe pictures and country shapes come from (exact versions,
// so an update to the libraries can't change the site by surprise)
const GLOBE_FILES = {
  // NASA pictures, 4096 x 2048 pixels: they load quickly, so the globe appears fast
  night: "https://unpkg.com/three-globe@2.45.2/example/img/earth-night.jpg",
  day: "https://unpkg.com/three-globe@2.45.2/example/img/earth-blue-marble.jpg",
  water: "https://unpkg.com/three-globe@2.45.2/example/img/earth-water.png",   // white = ocean (for the shine)
  bumps: "https://unpkg.com/three-globe@2.45.2/example/img/earth-topology.png",
  // Sharper 8192 x 4096 versions, kept in this website's "textures" folder.
  // When they're there, they replace the 4K ones once downloaded.
  // If they're missing, the 4K ones simply stay.
  day8k: "textures/earth-day-8k.jpg",
  night8k: "textures/earth-night-8k.jpg",
  borders: "https://unpkg.com/globe.gl@2.46.2/example/datasets/ne_110m_admin_0_countries.geojson",
};

// How close you can zoom in, as a height above the globe (1 = one globe
// radius). The pictures only have so much detail, so we stop before they blur.
const ZOOM_LIMITS = {
  standard: 0.9,   // with the 4K pictures
  sharp: 0.5,      // with the 8K pictures
};
let globeIsSharp = false;   // true once the 8K pictures are showing
const GLOBE_RADIUS = 100;   // Globe.gl's globe is 100 units wide (from the center)

// How high the camera stops when it flies to a university: close enough
// to see the country, far enough that it stays sharp
function focusAltitude() {
  return globeIsSharp ? 0.8 : 1.15;
}

const PIN_COLORS = {
  firstChoice: "#f5c542",   // gold
  urgent: "#f3646b",        // red (same red as the rest of the site)
  normal: "#38bdf8",        // bright blue
};

// People who ask their device for less motion get a still globe by default
const PREFERS_LESS_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The globe's settings. Missing ones get these defaults.
function getGlobeSettings() {
  const saved = state.settings.globe;
  return {
    spin: typeof saved.spin === "boolean" ? saved.spin : !PREFERS_LESS_MOTION,
    borders: saved.borders === true,
    arcs: saved.arcs === true,
    glow: saved.glow === true,               // cinematic bloom: off unless you turn it on (it's heavy on phones)
  };
}

// Letters like < and & must be escaped before going into HTML
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

// A university -> one dot on the globe. Universities without a
// map position are skipped.
function toGlobePoint(uni) {
  if (!Number.isFinite(uni.lat) || !Number.isFinite(uni.lng)) return null;
  const myDate = getMyDate(uni);
  return {
    id: uni.id,
    name: uni.name,
    lat: uni.lat,
    lng: uni.lng,
    isFirstChoice: Boolean(uni.firstChoice),
    isUrgent: getMyDateStatus(myDate).level === "urgent",
    isSelected: uni.id === selectedId,
    myDate: describeMyDate(myDate),
    place: uni.city + ", " + uni.country,
  };
}

function pinColor(point) {
  if (point.isFirstChoice) return PIN_COLORS.firstChoice;
  if (point.isUrgent) return PIN_COLORS.urgent;
  return PIN_COLORS.normal;
}

// One glowing dot. It's a normal web button, so it stays sharp at any
// zoom, glows and pulses with CSS (style.css section 6), and opens the
// details card when clicked. Its label shows on hover, and always when selected.
function makeGlobePin(point) {
  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "globe-pin" + (point.isSelected ? " is-selected" : "");
  pin.style.setProperty("--pin-color", pinColor(point));
  pin.setAttribute("aria-label", point.name + ", " + point.place + ". " + (point.myDate.main || "No date yet"));
  pin.innerHTML =
    '<span class="globe-pin-pulse"></span><span class="globe-pin-core"></span>' +
    '<span class="globe-pin-label">' +
      "<strong>" + (point.isFirstChoice ? "&#9733; " : "") + escapeHtml(point.name) + "</strong>" +
      "<span>" + escapeHtml(point.myDate.main || point.place) + "</span>" +
      (point.myDate.sub ? "<span>" + escapeHtml(point.myDate.sub) + "</span>" : "") +
    "</span>";
  pin.addEventListener("click", function (event) {
    event.stopPropagation();
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: focusAltitude() }, 1500);
    selectUniversity(point.id, false);       // opens the same details card as before
  });
  return pin;
}

const globeBox = document.getElementById("globe");

// Show a message in the globe's place (no internet, or no 3D support)
function showGlobeMessage(text) {
  globeBox.append(makeElement("p", "muted globe-message", text));
}

if (typeof Globe === "undefined") {
  // Globe.gl loads from the internet. If you're offline, show a message instead.
  showGlobeMessage("The globe needs an internet connection to load.");
} else {
  try {
    globe = Globe({ animateIn: true })(globeBox)
      .backgroundColor("rgba(0,0,0,0)")          // no starfield: the dark gradient behind shows through
      .globeImageUrl(GLOBE_FILES.night)          // shown until the day/night look below is ready
      .bumpImageUrl(GLOBE_FILES.bumps)
      .showAtmosphere(true)
      .atmosphereColor("#3a8bff")
      .atmosphereAltitude(0.14)                  // a thin, crisp halo (the edge glow does the rest)
      .onGlobeReady(function () { globeBox.classList.add("is-ready"); })   // fade in
      // The glowing dots
      .htmlElementsData([])
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlAltitude(0.01)
      .htmlElement(makeGlobePin)
      .htmlTransitionDuration(0)
      // Soft rings spreading out from the selected university
      .ringColor(function (point) {
        const color = pinColor(point);
        return function (t) { return color + Math.round((1 - t) * 200).toString(16).padStart(2, "0"); };
      })
      .ringMaxRadius(4)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1400)
      .ringAltitude(0.005)
      // Arcs from your home country
      .arcColor(function () { return ["rgba(56, 189, 248, 0.15)", "rgba(56, 189, 248, 0.9)"]; })
      .arcStroke(0.35)
      .arcAltitudeAutoScale(0.35)
      .arcDashLength(0.5)
      .arcDashGap(0.25)
      .arcDashAnimateTime(4000)
      // Country borders (only drawn when the setting is on)
      .polygonCapColor(function () { return "rgba(0, 0, 0, 0)"; })
      .polygonSideColor(function () { return "rgba(0, 0, 0, 0)"; })
      .polygonStrokeColor(function () { return "rgba(147, 166, 255, 0.35)"; })
      .polygonAltitude(0.003);

    // Smooth, slow movement
    const controls = globe.controls();
    controls.autoRotateSpeed = 0.2;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting: a soft fill light plus a "sun" from the top left, for depth
    globe.lights().forEach(function (light) {
      if (light.isAmbientLight) light.intensity = 1.1;
      if (light.isDirectionalLight) {
        light.intensity = 2.4;
        light.position.set(-1, 1, 1.2);
      }
    });
    const material = globe.globeMaterial();
    material.bumpScale = 6;
    material.shininess = 12;

    // Sharp on retina screens, but not more than needed (saves battery)
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    setZoomLimit();
    globe.pointOfView({ lat: 30, lng: 10, altitude: 2.3 });

    // Fade in even if the "ready" signal never comes (for example a slow picture)
    setTimeout(function () { globeBox.classList.add("is-ready"); }, 4000);
  } catch (error) {
    // Happens on devices that can't draw 3D graphics (no WebGL)
    globe = null;
    globeBox.innerHTML = "";
    showGlobeMessage("Your browser can't show the 3D globe. Your universities are still in the list below.");
  }
}

// Keep the globe the same size as its box (window resizes, phones turning)
if (globe && "ResizeObserver" in window) {
  new ResizeObserver(function () {
    if (globeBox.clientWidth > 0) globe.width(globeBox.clientWidth).height(globeBox.clientHeight);
  }).observe(globeBox);
}

// ----- Zoom limit -----
function setZoomLimit() {
  if (!globe) return;
  const limit = globeIsSharp ? ZOOM_LIMITS.sharp : ZOOM_LIMITS.standard;
  globe.controls().minDistance = GLOBE_RADIUS * (1 + limit);
}

// ----- The Earth's look (a "shader": a small program the graphics card runs) -----
// One dark, minimal look. For every point on the globe it mixes:
//   dim daylight     where the sun is up right now: faded, cool and dark,
//                    so the globe stays dark overall
//   city lights      on the night side, with a soft line between the two
//   ocean shine      a faint highlight where sunlight meets the water
//   edge glow        a blue rim, brighter towards the edge of the globe
// It needs three.js (loaded from the import map in index.html). If that
// can't load, the globe keeps its plain night picture.
const EARTH_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAGMENT_SHADER = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;

  void main() {
    vec3 normal = normalize(vNormalWorld);
    vec3 toCamera = normalize(cameraPosition - vPositionWorld);
    vec3 sun = normalize(sunDirection);

    // Day and night, with a soft line between them
    float sunAmount = dot(normal, sun);
    float dayAmount = smoothstep(-0.12, 0.22, sunAmount);
    // Daylight, but dark and minimal: faded towards grey, cooled towards blue, dimmed
    vec3 dayPicture = texture2D(dayMap, vUv).rgb;
    float grey = dot(dayPicture, vec3(0.299, 0.587, 0.114));
    vec3 day = mix(vec3(grey), dayPicture, 0.4) * vec3(0.68, 0.8, 1.0)
             * (0.12 + 0.22 * clamp(sunAmount, 0.0, 1.0));
    vec3 night = texture2D(nightMap, vUv).rgb * 1.35 + vec3(0.004, 0.008, 0.02);
    vec3 color = mix(night, day, dayAmount);

    // Ocean shine
    float water = texture2D(waterMap, vUv).r;
    vec3 halfway = normalize(sun + toCamera);
    float shine = pow(max(dot(normal, halfway), 0.0), 220.0) * water * dayAmount;
    color += shine * vec3(0.4, 0.6, 1.0) * 0.12;

    // Edge glow
    float rim = pow(1.0 - max(dot(normal, toCamera), 0.0), 4.0);
    color += rim * vec3(0.16, 0.42, 1.0) * 0.4;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

let earthMaterial = null;   // the shader, once it's ready

// Where the sun is overhead right now (roughly: good to within a degree)
function sunPosition(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const lat = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  let lng = (12 - hours) * 15;
  if (lng < -180) lng += 360;
  return { lat: lat, lng: lng };
}

function updateSun() {
  if (!earthMaterial) return;
  const sun = sunPosition(new Date());
  const point = globe.getCoords(sun.lat, sun.lng);
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  earthMaterial.uniforms.sunDirection.value.set(point.x / length, point.y / length, point.z / length);
}

function setupEarthLook() {
  import("three").then(function (THREE) {
    const renderer = globe.renderer();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    // Load a picture as a texture, with the settings that keep it crisp
    function loadTexture(url, isColor) {
      return new Promise(function (resolve, reject) {
        loader.load(url, function (texture) {
          if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();   // sharp at the edges of the globe too
          resolve(texture);
        }, undefined, reject);
      });
    }

    // 1. The 4K pictures first, so the new look appears quickly
    return Promise.all([loadTexture(GLOBE_FILES.day, true), loadTexture(GLOBE_FILES.night, true), loadTexture(GLOBE_FILES.water, false)])
      .then(function (textures) {
        earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            dayMap: { value: textures[0] },
            nightMap: { value: textures[1] },
            waterMap: { value: textures[2] },
            sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          },
          vertexShader: EARTH_VERTEX_SHADER,
          fragmentShader: EARTH_FRAGMENT_SHADER,
        });
        globe.globeMaterial(earthMaterial);
        updateSun();
        setInterval(updateSun, 60000);   // the sun moves: update once a minute

        // 2. Then the 8K pictures, if they're on the website and this device can handle them
        // (Only on a real web address: a page opened straight from a file can't load them.)
        if (renderer.capabilities.maxTextureSize < 8192 || !/^https?:$/.test(location.protocol)) return;
        return Promise.all([loadTexture(GLOBE_FILES.day8k, true), loadTexture(GLOBE_FILES.night8k, true)])
          .then(function (sharp) {
            earthMaterial.uniforms.dayMap.value.dispose();
            earthMaterial.uniforms.nightMap.value.dispose();
            earthMaterial.uniforms.dayMap.value = sharp[0];
            earthMaterial.uniforms.nightMap.value = sharp[1];
            globeIsSharp = true;
            setZoomLimit();
          })
          .catch(function () { /* no 8K pictures on the website yet: the 4K ones stay */ });
      });
  }).catch(function () { /* three.js couldn't load: the plain night picture stays */ });
}

if (globe) setupEarthLook();

// ----- Glow (bloom) -----
// A soft cinematic glow on the brightest parts (city lights, the atmosphere).
// It needs a few extra three.js files, loaded only the first time it's on.
let bloomPass = null;
let bloomLoading = false;
function setGlow(on) {
  if (!globe) return;
  const composer = globe.postProcessingComposer();
  if (!on) {
    if (bloomPass) bloomPass.enabled = false;
    return;
  }
  if (bloomPass) {
    bloomPass.enabled = true;
    return;
  }
  if (bloomLoading) return;
  bloomLoading = true;
  // "three" and "three/addons/" come from the import map in index.html
  Promise.all([import("three"), import("three/addons/postprocessing/UnrealBloomPass.js")])
    .then(function (modules) {
      bloomPass = new modules[1].UnrealBloomPass(
        new modules[0].Vector2(globeBox.clientWidth, globeBox.clientHeight),
        0.45,    // strength: a soft glow, not a haze
        0.3,     // radius
        0.9);    // only the brightest parts glow (city lights, the atmosphere's rim)
      composer.addPass(bloomPass);
      bloomPass.enabled = getGlobeSettings().glow;
    })
    .catch(function () { /* no glow this time: the globe works fine without it */ })
    .finally(function () { bloomLoading = false; });
}

// Turn the settings into globe settings
let borderShapes = null;   // the country shapes, downloaded the first time Borders is turned on
function applyGlobeSettings() {
  if (!globe) return;
  const settings = getGlobeSettings();

  // Spin, but not while a university's details are open
  globe.controls().autoRotate = settings.spin && selectedId === null;
  setGlow(settings.glow);

  if (!settings.borders) {
    globe.polygonsData([]);
  } else if (borderShapes) {
    globe.polygonsData(borderShapes);
  } else {
    fetch(GLOBE_FILES.borders)
      .then(function (response) { return response.json(); })
      .then(function (data) {
        borderShapes = data.features;
        if (getGlobeSettings().borders) globe.polygonsData(borderShapes);
      })
      .catch(function () { /* no borders this time; the setting can be tried again */ });
  }

  drawArcs();
}

// Where your home country is, found once with the map search (section 6)
// and remembered. Returns null until it's known.
let homeLookupRunning = false;
function getHomePlace(callback) {
  const country = getAcademicProfile().countryOfResidence;
  if (!country) return callback(null);

  const saved = state.settings.homePlace;
  if (saved && saved.country === country) return callback(saved);

  if (homeLookupRunning) return callback(null);
  homeLookupRunning = true;
  fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(country))
    .then(function (response) { return response.json(); })
    .then(function (results) {
      if (!results[0]) return callback(null);
      const place = { country: country, lat: Number(results[0].lat), lng: Number(results[0].lon) };
      state.settings.homePlace = place;
      save("homePlace");
      callback(place);
    })
    .catch(function () { callback(null); })
    .finally(function () { homeLookupRunning = false; });
}

// Arcs from your home country (Profile tab) to each university
let globePoints = [];
function drawArcs() {
  if (!globe) return;
  if (!getGlobeSettings().arcs) {
    globe.arcsData([]);
    return;
  }
  getHomePlace(function (home) {
    if (!home || !getGlobeSettings().arcs) {
      globe.arcsData([]);
      return;
    }
    globe.arcsData(globePoints.map(function (point) {
      return { startLat: home.lat, startLng: home.lng, endLat: point.lat, endLng: point.lng };
    }));
  });
}

// Draw all the dots again from the universities list
function drawPins() {
  if (!globe) return;
  globePoints = state.universities.map(toGlobePoint).filter(Boolean);
  globe.htmlElementsData(globePoints);
  globe.ringsData(globePoints.filter(function (point) { return point.isSelected; }));
  applyGlobeSettings();
}

// Turn the globe so the dots are in view
function zoomToAllPins() {
  if (!globe || globePoints.length === 0) return;

  // Point at the middle of all the dots
  let x = 0, y = 0, z = 0;
  globePoints.forEach(function (point) {
    const lat = point.lat * Math.PI / 180, lng = point.lng * Math.PI / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });
  const lng = Math.atan2(y, x) * 180 / Math.PI;
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
  globe.pointOfView({ lat: lat, lng: lng, altitude: globePoints.length === 1 ? 1.2 : 1.8 }, 1600);
}

// ----- The gear button and its settings -----
const globeSettingsButton = document.getElementById("globe-settings-button");
const globeSettingsMenu = document.getElementById("globe-settings");

function setSettingsOpen(open) {
  globeSettingsMenu.hidden = !open;
  globeSettingsButton.setAttribute("aria-expanded", String(open));
}

globeSettingsButton.disabled = !globe;
globeSettingsButton.addEventListener("click", function (event) {
  event.stopPropagation();
  setSettingsOpen(globeSettingsMenu.hidden);
});
// Clicking anywhere else (or pressing Escape) closes it
document.addEventListener("click", function (event) {
  if (!globeSettingsMenu.hidden && !globeSettingsMenu.contains(event.target)) setSettingsOpen(false);
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !globeSettingsMenu.hidden) setSettingsOpen(false);
});

// Tick the switches to match the saved settings (called at startup)
function showGlobeSettings() {
  document.querySelectorAll("[data-globe-setting]").forEach(function (box) {
    box.checked = getGlobeSettings()[box.dataset.globeSetting];
  });
}

document.querySelectorAll("[data-globe-setting]").forEach(function (box) {
  box.addEventListener("change", function () {
    const settings = getGlobeSettings();
    settings[box.dataset.globeSetting] = box.checked;
    state.settings.globe = settings;
    save("globeSettings");
    applyGlobeSettings();
    if (box.dataset.globeSetting === "arcs" && box.checked && !getAcademicProfile().countryOfResidence) {
      showToast("Add your country of residence on the Profile tab to see arcs from home.", "circle-alert");
    }
  });
});


// =========================================================
// 6. FINDING A LOCATION'S COORDINATES ("geocoding")
// The map needs numbers (latitude and longitude), not words.
// A free OpenStreetMap service called Nominatim converts them.
// =========================================================

async function searchLocation(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);
  const response = await fetch(url);
  const results = await response.json();

  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

async function findCoordinates(name, city, country) {
  // Try the university itself first, so the pin lands on the campus...
  const exact = await searchLocation(name + ", " + city + ", " + country);
  if (exact) return exact;

  // ...otherwise use the city
  return await searchLocation(city + ", " + country);
}
