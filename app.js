// CSUN Map Challenge game logic

const MAP_CENTER = { lat: 34.2390, lng: -118.5285 }; // slightly lower to keep full campus in view
const DEBUG_SHOW_POLYGONS = false; //set to true to keep answer boxes visible for debugging
const DEBUG_POLY_STYLE = 
{
  strokeWeight: 1,
  strokeColor: '#94a3b8',
  strokeOpacity: 0.9,
  fillColor: '#155fb9ff',
  fillOpacity: 0.12
};

const MAP_STYLES = 
[
  { elementType: 'labels', stylers: [{ visibility: 'off' }] }, //street names, place names, etc
  { featureType: 'poi', stylers: [{ visibility: 'off' }] } //stores, parking lotts, etc
];

const STORAGE_KEY = 'csun-map-quiz-best-ms';

// Campus areas defined as polygons. Coordinates are approximate and intended for gameplay.
const LOCATIONS = 
[
  {
    name: 'University Library',
    prompt: 'Find the University Library.',
    polygon: [
      { lat: 34.24045, lng: -118.53005 }, // top-left edge of library footprint
      { lat: 34.24045, lng: -118.52860 }, // top-right edge
      { lat: 34.23950, lng: -118.52860 }, // bottom-right edge
      { lat: 34.23950, lng: -118.53005 }  // bottom-left edge
    ]
  },
  {
    name: 'Jacaranda Hall (Engineering)',
    prompt: 'Find Jacaranda Hall.',
    polygon: [
      { lat: 34.24220, lng: -118.52955 }, // top-left corner of hall
      { lat: 34.24220, lng: -118.52780 }, // top-right corner
      { lat: 34.24100, lng: -118.52780 }, // bottom-right corner
      { lat: 34.24100, lng: -118.52955 }  // bottom-left corner
    ]
  },
  {
    name: 'Student Recreation Center',
    prompt: 'Find the Student Recreation Center.',
    polygon: [
      { lat: 34.24065, lng: -118.52515 }, // top-left edge of SRC
      { lat: 34.24065, lng: -118.52470 }, // top-right edge
      { lat: 34.23930, lng: -118.52470 }, // bottom-right edge
      { lat: 34.23930, lng: -118.52515 }  // bottom-left edge
    ]
  },
  {
    name: 'Manzanita Hall',
    prompt: 'Find Manzanita Hall.',
    polygon: [
      { lat: 34.23785, lng: -118.53150 }, // top-left corner of Manzanita
      { lat: 34.23785, lng: -118.53090 }, // top-right corner
      { lat: 34.23735, lng: -118.53090 }, // bottom-right corner
      { lat: 34.23735, lng: -118.53150 }  // bottom-left corner
    ]
  },
  {
    name: 'Chapperall Hall',
    prompt: 'Find Chapperall Hall.',
    polygon: [
      { lat: 34.23865, lng: -118.52720 }, // top-left edge of square
      { lat: 34.23865, lng: -118.52670 }, // top-right edge
      { lat: 34.23785, lng: -118.52670 }, // bottom-right edge
      { lat: 34.23785, lng: -118.52720 }  // bottom-left edge
    ]
  }
];

const TOTAL_ROUNDS = LOCATIONS.length;

let map;
let polygonLayers = [];
let shuffledOrder = [];
let currentRound = 0;
let score = 0;
let guessMarker;
let lockInput = false;
let timerId;
let startMs;

// DOM helpers
const els = 
{
  promptText: document.getElementById('prompt-text'),
  promptCount: document.getElementById('prompt-count'),
  score: document.getElementById('score'),
  timer: document.getElementById('timer'),
  best: document.getElementById('best-time'),
  toast: document.getElementById('toast'),
  restart: document.getElementById('restart')
};

function initMap() 
{
  map = new google.maps.Map(document.getElementById('map'), {
    center: MAP_CENTER,
    zoom: 17,
    styles: MAP_STYLES,
    disableDefaultUI: true,
    // Map movement controls — flip these to enable/disable interaction:
    draggable: false,              // set to true to allow dragging/panning
    scrollwheel: false,            // set to true to allow wheel zoom
    disableDoubleClickZoom: true,  // set to false to allow double-click zoom
    keyboardShortcuts: false,      // set to true to allow arrow keys +/-
    gestureHandling: 'none',       // options: 'none' (locked), 'cooperative', 'greedy'
    mapTypeId: 'roadmap'
  });

  polygonLayers = LOCATIONS.map(({ polygon }) => new google.maps.Polygon({
    paths: polygon,
    strokeWeight: 2,
    strokeColor: '#22d3ee',
    strokeOpacity: 0.6,
    fillOpacity: 0
  }));

  if (DEBUG_SHOW_POLYGONS) 
    {
    // Keep the correct boxes visible on load for debugging clarity.
    polygonLayers.forEach((poly) => {
      poly.setOptions(DEBUG_POLY_STYLE);
      poly.setMap(map);
    });
  }

  map.addListener('dblclick', handleGuess);
  els.restart.addEventListener('click', startGame);

  // Enable right-click drag panning (while normal drag stays disabled)
  enableRightClickDrag(map);

  hydrateBestTime();
  startGame();
}

function startGame() 
{
  score = 0;
  currentRound = 0;
  lockInput = false;
  shuffledOrder = shuffle([...LOCATIONS.keys()]);
  clearVisuals();
  startTimer();
  updateScoreboard();
  presentPrompt();
  showToast('Game reset. Find the first location!', false);
}

function presentPrompt() 
{
  if (currentRound >= TOTAL_ROUNDS) {
    endGame();
    return;
  }

  const loc = LOCATIONS[shuffledOrder[currentRound]];
  els.promptText.textContent = loc.prompt;
  els.promptCount.textContent = `${currentRound + 1} / ${TOTAL_ROUNDS}`;
}

function handleGuess(event) 
{
  if (lockInput || currentRound >= TOTAL_ROUNDS) return;

  lockInput = true;
  const locIndex = shuffledOrder[currentRound];
  const polygon = polygonLayers[locIndex];
  const isInside = google.maps.geometry.poly.containsLocation(event.latLng, polygon);

  paintPolygon(polygon, isInside ? '#16a34a' : '#ef4444');
  dropMarker(event.latLng, isInside);

  if (isInside) 
    {
        score += 1;
        showToast(`Correct! ${LOCATIONS[locIndex].name} highlighted.`, true);
    } 
  else 
    {
        showToast(`Not quite. ${LOCATIONS[locIndex].name} is in red.`, false);
    }

  currentRound += 1;
  updateScoreboard();

  if (currentRound >= TOTAL_ROUNDS) 
    {
        endGame();
        return;
    }

  setTimeout(() => 
    {
    clearVisuals();
    lockInput = false;
    presentPrompt();
    }, 1200);
}

// Right-click drag to pan implementation
function enableRightClickDrag(mapInstance) 
{
  const mapDiv = mapInstance.getDiv();
  // Prevent default context menu so right drag feels natural
  mapDiv.addEventListener('contextmenu', (e) => e.preventDefault());

  // Lightweight overlay to obtain projection for pixel<->latLng conversions
  const overlay = new google.maps.OverlayView();
  overlay.onAdd = function () {};
  overlay.draw = function () {};
  overlay.onRemove = function () {};
  overlay.setMap(mapInstance);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startCenterPx = null;

  function getProjectionSafe() 
  {
    try 
    {
      return overlay.getProjection();
    } 

    catch 
    {
      return null;
    }
  }

  mapDiv.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return; // only right mouse button
    const proj = getProjectionSafe();
    if (!proj) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const center = mapInstance.getCenter();
    const centerPx = proj.fromLatLngToDivPixel(center);
    startCenterPx = { x: centerPx.x, y: centerPx.y };
    // Prevent text selection
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => 
    {
        if (!dragging) return;
        const proj = getProjectionSafe();
        if (!proj || !startCenterPx) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newPx = new google.maps.Point(startCenterPx.x - dx, startCenterPx.y - dy);
        const newCenter = proj.fromDivPixelToLatLng(newPx);
        if (newCenter) mapInstance.setCenter(newCenter);
  });

  window.addEventListener('mouseup', () => 
    {
        dragging = false;
        startCenterPx = null;
    });
}

function paintPolygon(polygon, color) 
{
  polygon.setOptions({
    strokeColor: color,
    strokeOpacity: 0.9,
    fillColor: color,
    fillOpacity: 0.25,
    map
  });
}

function dropMarker(position, positive) 
{
  if (guessMarker) guessMarker.setMap(null);

  guessMarker = new google.maps.Marker({
    position,
    map,
    icon: 
    {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: positive ? '#16a34a' : '#ef4444',
      fillOpacity: 0.9,
      strokeWeight: 2,
      strokeColor: '#0b1221'
    }
  });
}

function clearVisuals() 
{
  if (DEBUG_SHOW_POLYGONS) 
    {
      polygonLayers.forEach((poly) => poly.setOptions({ ...DEBUG_POLY_STYLE, map }));
    } 
  else 
    {
       polygonLayers.forEach((poly) => poly.setMap(null));
    }
  if (guessMarker) guessMarker.setMap(null);
}

function endGame() 
{
  stopTimer();
  const elapsed = Date.now() - startMs;
  const best = getBestMs();

  // Only save best time if player got a perfect score
  if (score === TOTAL_ROUNDS && (!best || elapsed < best)) 
    {
        localStorage.setItem(STORAGE_KEY, String(elapsed));
        hydrateBestTime();
    }

  els.promptText.textContent = 'Round complete! Hit restart to try again.';
  els.promptCount.textContent = `${TOTAL_ROUNDS} / ${TOTAL_ROUNDS}`;

  showToast(`Game over. You scored ${score} of ${TOTAL_ROUNDS}.`, score >= 4);
  lockInput = true;
}

function updateScoreboard() {
  els.score.textContent = score;
  els.timer.textContent = formatMs(startMs ? Date.now() - startMs : 0);
  els.best.textContent = formatBest(getBestMs());
}

function startTimer() 
{
  stopTimer();
  startMs = Date.now();
  timerId = setInterval(() => 
    {
        els.timer.textContent = formatMs(Date.now() - startMs);
    }, 200);
}

function stopTimer() 
{
  if (timerId)
    {
        clearInterval(timerId);
        timerId = undefined;
    }
}

function formatMs(ms) 
{
  const safeMs = Number.isFinite(ms) ? ms : 0;
  const totalSeconds = Math.max(0, Math.floor(safeMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatBest(ms) 
{
  return ms ? formatMs(ms) : '--';
}

function shuffle(array) 
{
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function showToast(message, positive) 
{
  const toast = els.toast;
  toast.textContent = message;
  toast.classList.remove('toast--positive', 'toast--negative');
  toast.classList.add('toast--show');
  toast.classList.add(positive ? 'toast--positive' : 'toast--negative');
  setTimeout(() => toast.classList.remove('toast--show'), 1600);
}

function hydrateBestTime() 
{
  els.best.textContent = formatBest(getBestMs());
}

function getBestMs() 
{
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) : undefined;
}

window.initMap = initMap;
