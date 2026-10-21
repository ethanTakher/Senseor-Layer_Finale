// piece.js: Canopy Run, a camera-driven drone navigation game.
// This file reads only window.sense. It never reads the camera or landmarks.
// Stillness reduces drift; nearness adds throttle. Trees and buildings are hazards.

const canvas = document.querySelector('#piece');
const ctx = canvas.getContext('2d');

let width = 1;
let height = 1;
let pixelRatio = 1;
function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}
addEventListener('resize', resize);
resize();

const COLORS = {
  background: '#111d1b',
  groundA: '#263a31',
  groundB: '#2a4035',
  groundC: '#30463a',
  road: '#35413d',
  roadLine: '#66756b',
  building: '#78827b',
  buildingTop: '#a2aaa0',
  treeA: '#315d43',
  treeB: '#3d704a',
  treeC: '#548253',
  ink: '#f1f3e9',
  muted: '#a5b5a9',
  mint: '#76f0bf',
  amber: '#ffca70',
  danger: '#ff6d67',
};

const TILE = 128;
const clamp = value => Math.min(1, Math.max(0, value));
const clampX = value => Math.max(22, Math.min(width - 22, value));

// Deterministic map patterns keep buildings/trees in place as the map scrolls.
function rand(row, col, seed = 0) {
  const value = Math.sin(row * 127.1 + col * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function routeX(world) {
  const center = width * 0.5
    + Math.sin(world * 0.0018 + 0.4) * width * 0.105
    + Math.sin(world * 0.00063 + 1.2) * width * 0.055;
  return Math.max(width * 0.22, Math.min(width * 0.78, center));
}

let worldY = 0;
let nextHazardWorld = 215;
let nextHazardId = 0;
let hazards = [];
let integrity = 3;
let collisions = 0;
let rebootUntil = 0;
let impactUntil = 0;
let lastFrame = performance.now();
let elapsed = 0;
let lastState = '';
let stateEnteredAt = performance.now();

function resetRun(now) {
  worldY = 0;
  nextHazardWorld = 215;
  nextHazardId = 0;
  hazards = [];
  integrity = 3;
  collisions = 0;
  rebootUntil = 0;
  impactUntil = 0;
  elapsed = 0;
  lastFrame = now;
}

function addHazard(world, side, offset, type, size) {
  hazards.push({
    id: nextHazardId++,
    worldY: world,
    side,
    offset,
    type,
    size,
    hit: false,
    cleared: false,
  });
}

function ensureHazards() {
  const horizon = worldY + height * 1.5 + 600;
  while (nextHazardWorld < horizon) {
    const id = nextHazardId;
    const side = rand(id, 2, 9) < 0.5 ? -1 : 1;
    const firstType = rand(id, 3, 7) < 0.56 ? 'tree' : 'building';
    const firstSize = firstType === 'tree' ? 18 + rand(id, 4, 2) * 7 : 23 + rand(id, 4, 5) * 9;
    addHazard(nextHazardWorld, side, 0.14 + rand(id, 5, 4) * 0.15, firstType, firstSize);

    // Some rows have a second obstacle on the far side, leaving a route between them.
    if (rand(id, 6, 8) > 0.47) {
      const otherType = rand(id, 8, 2) < 0.54 ? 'tree' : 'building';
      const otherSize = otherType === 'tree' ? 16 + rand(id, 9, 1) * 7 : 20 + rand(id, 9, 3) * 8;
      addHazard(nextHazardWorld + 12, -side, 0.17 + rand(id, 10, 4) * 0.17, otherType, otherSize);
    }
    nextHazardWorld += 145 + rand(id, 11, 3) * 70;
  }
  hazards = hazards.filter(hazard => worldY - hazard.worldY < 100 && !hazard.cleared);
}

function hazardX(hazard) {
  return clampX(routeX(hazard.worldY) + hazard.side * width * hazard.offset);
}

function roundedRect(x, y, w, h, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawMap(droneY) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const firstRow = Math.floor((worldY - (height - droneY)) / TILE) - 1;
  const lastRow = Math.floor((worldY + droneY) / TILE) + 1;
  const columns = Math.ceil(width / TILE) + 1;

  // First draw roads behind all the city/woodland blocks.
  ctx.fillStyle = COLORS.road;
  for (let row = firstRow; row <= lastRow; row++) {
    const screenY = droneY - (row * TILE - worldY);
    ctx.fillRect(0, screenY - 8, width, 16);
    ctx.strokeStyle = 'rgba(206, 215, 197, 0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([9, 12]);
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let col = 0; col <= columns; col++) {
    const roadX = col * TILE;
    ctx.fillRect(roadX - 8, 0, 16, height);
    ctx.strokeStyle = 'rgba(206, 215, 197, 0.18)';
    ctx.setLineDash([9, 12]);
    ctx.beginPath();
    ctx.moveTo(roadX, 0);
    ctx.lineTo(roadX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Build a dense, repeatable aerial map of parks, trees, and small buildings.
  for (let row = firstRow; row <= lastRow; row++) {
    const cellY = droneY - (row * TILE - worldY);
    if (cellY > height + TILE || cellY < -TILE) continue;
    for (let col = 0; col < columns; col++) {
      const x = col * TILE + 10;
      const y = cellY + 10;
      const cellW = TILE - 20;
      const cellH = TILE - 20;
      const p = rand(row, col, 1);
      ctx.fillStyle = p < 0.5 ? COLORS.groundA : (p < 0.78 ? COLORS.groundB : COLORS.groundC);
      ctx.fillRect(x, y, cellW, cellH);

      if (p < 0.31) {
        // Buildings: offset roof, footprint shadow, roof equipment and windows.
        const bw = 38 + rand(row, col, 2) * 39;
        const bh = 35 + rand(row, col, 3) * 40;
        const bx = x + 8 + rand(row, col, 4) * Math.max(1, cellW - bw - 16);
        const by = y + 8 + rand(row, col, 5) * Math.max(1, cellH - bh - 16);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(bx + 5, by + 6, bw, bh);
        ctx.fillStyle = COLORS.building;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = COLORS.buildingTop;
        ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
        ctx.fillStyle = 'rgba(43, 65, 59, 0.65)';
        for (let wy = by + 9; wy < by + bh - 5; wy += 12) {
          ctx.fillRect(bx + 8, wy, Math.max(4, bw - 16), 3);
        }
        ctx.fillStyle = 'rgba(237, 237, 211, 0.25)';
        ctx.fillRect(bx + bw * 0.22, by + bh * 0.2, bw * 0.18, 5);
      } else {
        const treeCount = 3 + Math.floor(rand(row, col, 6) * 5);
        for (let i = 0; i < treeCount; i++) {
          const tx = x + 9 + rand(row * 7 + i, col, 7) * (cellW - 18);
          const ty = y + 9 + rand(row, col * 5 + i, 8) * (cellH - 18);
          const radius = 5 + rand(row + i, col, 9) * 6;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
          ctx.beginPath();
          ctx.arc(tx + 2, ty + 3, radius + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = [COLORS.treeA, COLORS.treeB, COLORS.treeC][Math.floor(rand(row + i, col, 10) * 3)];
          ctx.beginPath();
          ctx.arc(tx, ty, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(172, 209, 130, 0.16)';
          ctx.beginPath();
          ctx.arc(tx - radius * 0.25, ty - radius * 0.28, radius * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Faint sector labels make the map read like a survey-drone display.
  ctx.save();
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(231, 239, 219, 0.33)';
  for (let row = firstRow; row <= lastRow; row += 2) {
    const y = droneY - (row * TILE - worldY) + 25;
    if (y > 15 && y < height - 12) {
      ctx.fillText(`SECTOR ${String(Math.abs(row) % 90).padStart(2, '0')}`, 22, y);
    }
  }
  ctx.restore();
}

function drawRoute(droneY) {
  ctx.save();
  ctx.beginPath();
  let began = false;
  for (let y = -30; y <= height + 30; y += 9) {
    const world = worldY + (droneY - y);
    const x = routeX(world);
    if (!began) {
      ctx.moveTo(x, y);
      began = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = 'rgba(118, 240, 191, 0.24)';
  ctx.lineWidth = 17;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(118, 240, 191, 0.92)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 11]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawHazard(hazard, droneY, now) {
  if (hazard.hit) return;
  const delta = hazard.worldY - worldY;
  const y = droneY - delta;
  if (y < -90 || y > height + 90) return;
  const x = hazardX(hazard);
  const r = hazard.size;

  ctx.save();
  // Hazard ring is a map icon for things the drone must avoid.
  ctx.strokeStyle = 'rgba(255, 202, 112, 0.50)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r + 8, r * 0.74 + 7, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (hazard.type === 'tree') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 7, r * 0.9, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#274d37';
    ctx.beginPath(); ctx.arc(x - 5, y - 1, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#44794b';
    ctx.beginPath(); ctx.arc(x + 5, y - 3, r * 0.77, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#65975a';
    ctx.beginPath(); ctx.arc(x - 2, y - r * 0.35, r * 0.42, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(x - r + 5, y - r * 0.65 + 6, r * 2, r * 1.3);
    ctx.fillStyle = '#697773';
    ctx.fillRect(x - r, y - r * 0.65, r * 2, r * 1.3);
    ctx.fillStyle = '#a7b0a3';
    ctx.fillRect(x - r + 4, y - r * 0.65 + 4, r * 2 - 8, r * 1.3 - 8);
    ctx.fillStyle = '#53665d';
    for (let wx = x - r + 8; wx < x + r - 5; wx += 10) {
      ctx.fillRect(wx, y - 3, 4, 7);
    }
  }
  // Briefly flash a hit location so impacts read clearly.
  if (now < impactUntil && Math.abs(delta) < 70) {
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r + 14, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawDrone(x, y, still, state, now) {
  // Stylized top-down B-2 Spirit silhouette: broad flying wing, swept leading
  // edge, and the characteristic shallow serrations along the trailing edge.
  // It is drawn as an aircraft silhouette, not a quadcopter or rotor drone.
  const accent = state === 'turbulent' ? COLORS.danger : (state === 'boost' ? COLORS.amber : '#b8c9c8');
  const size = Math.max(1, Math.min(width, height) * 0.022);
  const pulse = 1 + Math.sin(now * 0.006) * 0.025;
  const scaleY = 0.92;

  // Stillness affects the small banking angle as well as lateral drift.
  const bank = (0.5 - still) * 0.10;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bank);
  ctx.scale(pulse, pulse * scaleY);

  // Soft navigation glow around the aircraft.
  ctx.shadowColor = accent;
  ctx.shadowBlur = 15;
  ctx.fillStyle = 'rgba(9, 13, 16, 0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.62);             // nose
  ctx.lineTo(-size * 0.48, -size * 1.40);
  ctx.lineTo(-size * 2.85, -size * 0.38);
  ctx.lineTo(-size * 3.38, size * 0.32);  // left wingtip
  ctx.lineTo(-size * 2.66, size * 0.18);
  ctx.lineTo(-size * 2.28, size * 0.57);
  ctx.lineTo(-size * 1.86, size * 0.34);
  ctx.lineTo(-size * 1.43, size * 0.69);
  ctx.lineTo(-size * 1.03, size * 0.45);
  ctx.lineTo(-size * 0.62, size * 0.70);
  ctx.lineTo(-size * 0.26, size * 0.49);
  ctx.lineTo(0, size * 0.54);
  ctx.lineTo(size * 0.26, size * 0.49);
  ctx.lineTo(size * 0.62, size * 0.70);
  ctx.lineTo(size * 1.03, size * 0.45);
  ctx.lineTo(size * 1.43, size * 0.69);
  ctx.lineTo(size * 1.86, size * 0.34);
  ctx.lineTo(size * 2.28, size * 0.57);
  ctx.lineTo(size * 2.66, size * 0.18);
  ctx.lineTo(size * 3.38, size * 0.32);   // right wingtip
  ctx.lineTo(size * 2.85, -size * 0.38);
  ctx.lineTo(size * 0.48, -size * 1.40);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();

  // Subtle center spine and angled panel lines to read as a flying wing.
  ctx.strokeStyle = 'rgba(205, 218, 218, 0.52)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.43);
  ctx.lineTo(0, size * 0.38);
  ctx.moveTo(-size * 0.50, -size * 1.31);
  ctx.lineTo(-size * 1.44, size * 0.34);
  ctx.moveTo(size * 0.50, -size * 1.31);
  ctx.lineTo(size * 1.44, size * 0.34);
  ctx.moveTo(-size * 2.63, -size * 0.25);
  ctx.lineTo(-size * 1.90, size * 0.16);
  ctx.moveTo(size * 2.63, -size * 0.25);
  ctx.lineTo(size * 1.90, size * 0.16);
  ctx.stroke();

  // Twin subdued exhaust/engine areas near the rear edge; no propellers.
  ctx.fillStyle = 'rgba(125, 145, 151, 0.78)';
  roundedRect(-size * 0.40, size * 0.18, size * 0.25, size * 0.20, 2, 'rgba(125,145,151,0.55)');
  roundedRect(size * 0.15, size * 0.18, size * 0.25, size * 0.20, 2, 'rgba(125,145,151,0.55)');

  // The navigation marker is brighter when the pilot holds steady.
  ctx.globalAlpha = 0.45 + still * 0.5;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -size * 0.84, Math.max(1.2, size * 0.075), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSpeedStreaks(speed, now) {
  // The motion effect ramps in only at higher throttle, making the difference
  // between a crawl and a close-in high-speed run unmistakable.
  const intensity = clamp((speed - 35) / 850);
  if (intensity <= 0) return;
  const count = Math.floor(3 + intensity * 52);
  const flow = (now * (0.06 + intensity * 2.4)) % (height + 120);
  ctx.save();
  ctx.lineWidth = 1 + intensity * 1.2;
  ctx.strokeStyle = `rgba(224, 237, 230, ${0.08 + intensity * 0.24})`;
  for (let i = 0; i < count; i++) {
    const x = rand(i, Math.floor(now / 120), 21) * width;
    const y = (rand(i, 3, 22) * (height + 120) + flow) % (height + 120) - 60;
    const length = 5 + intensity * (25 + rand(i, 4, 23) * 90);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - intensity * 2, y + length);
    ctx.stroke();
  }
  ctx.restore();
}
function drawBar(x, y, w, value, color, label) {
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, x, y);
  roundedRect(x, y + 8, w, 5, 3, 'rgba(219,231,218,0.15)');
  roundedRect(x, y + 8, Math.max(2, w * clamp(value)), 5, 3, color);
}

function drawHud({ state, still, near, present, speed, droneX, droneY, now }) {
  // Top-left mission panel.
  roundedRect(14, 14, Math.min(276, width - 28), 112, 12, 'rgba(8,16,15,0.83)', 'rgba(198,224,204,0.20)');
  ctx.fillStyle = COLORS.mint;
  ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
  ctx.fillText('CANOPY RUN / B-2', 27, 36);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText('B-2 STEALTH FLIGHT / ROUTE CONTROL', 27, 51);
  const stateColor = state === 'turbulent' ? COLORS.danger : (state === 'boost' ? COLORS.amber : COLORS.mint);
  roundedRect(27, 61, 88, 19, 6, 'rgba(255,255,255,0.06)', `rgba(255,255,255,0.15)`);
  ctx.fillStyle = stateColor;
  ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
  ctx.fillText(String(state || 'nobody').toUpperCase(), 36, 74);
  drawBar(132, 69, 68, still, state === 'turbulent' ? COLORS.danger : COLORS.mint, 'STABILITY');
  drawBar(211, 69, 48, near, COLORS.amber, 'THROTTLE');

  // Top-right range and integrity panel.
  const panelW = 144;
  const panelX = width - panelW - 14;
  roundedRect(panelX, 14, panelW, 112, 12, 'rgba(8,16,15,0.83)', 'rgba(198,224,204,0.20)');
  ctx.fillStyle = COLORS.muted;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText('RANGE / KM', panelX + 13, 34);
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
  ctx.fillText((worldY / 1000).toFixed(2), panelX + 12, 57);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText(`SPEED ${Math.round(speed).toString().padStart(3, '0')}`, panelX + 13, 74);
  ctx.fillText('INTEGRITY', panelX + 13, 94);
  for (let i = 0; i < 3; i++) {
    roundedRect(panelX + 72 + i * 18, 85, 13, 11, 3, i < integrity ? (integrity === 1 ? COLORS.danger : COLORS.mint) : 'rgba(255,255,255,0.10)');
  }

  // Bottom instructions and tracking marks.
  roundedRect(14, height - 54, Math.min(420, width - 28), 40, 9, 'rgba(8,16,15,0.80)', 'rgba(198,224,204,0.18)');
  ctx.fillStyle = COLORS.ink;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillText('B-2 SPIRIT  /  HOLD A STEADY FLIGHT PATH', 26, height - 37);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText('LEAN CLOSER = HIGH THROTTLE  •  AVOID HAZARDS', 26, height - 23);

  // Small radar compass marks, not a camera preview.
  const cx = width - 38;
  const cy = height - 38;
  ctx.strokeStyle = 'rgba(215,233,218,0.48)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.moveTo(cx - 23, cy); ctx.lineTo(cx + 23, cy);
  ctx.moveTo(cx, cy - 23); ctx.lineTo(cx, cy + 23);
  ctx.stroke();
  ctx.fillStyle = COLORS.mint;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13); ctx.lineTo(cx - 4, cy + 5); ctx.lineTo(cx + 4, cy + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.font = '8px ui-monospace, Menlo, monospace';
  ctx.fillText('N', cx - 3, cy - 27);

  if (present < 0.25) {
    const headline = window.senseLive ? 'PILOT NOT IN FRAME' : 'PILOT LINK STANDBY';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `bold ${Math.min(22, Math.max(16, width * 0.035))}px ui-monospace, Menlo, monospace`;
    ctx.fillText(headline, width / 2, height * 0.30);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ui-monospace, Menlo, monospace';
    const hint = window.senseLive ? 'Move back into view to resume the flight.' : 'Start the camera, or move the pointer to test the fake sensor.';
    ctx.fillText(hint, width / 2, height * 0.30 + 24);
    ctx.fillStyle = 'rgba(241,243,233,0.66)';
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText('Stillness stabilizes the route. Nearness adds throttle.', width / 2, height * 0.30 + 46);
    ctx.textAlign = 'left';
  }

  if (now < impactUntil) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.danger;
    ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
    ctx.fillText('OBSTACLE CONTACT  /  ROUTE INTEGRITY -1', width / 2, height * 0.18);
    ctx.textAlign = 'left';
  }
  if (rebootUntil && now < rebootUntil) {
    ctx.fillStyle = 'rgba(6,12,12,0.62)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.danger;
    ctx.font = 'bold 24px ui-monospace, Menlo, monospace';
    ctx.fillText('DRONE LOST', width / 2, height * 0.44);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillText('Rebooting route computer…', width / 2, height * 0.44 + 27);
    ctx.textAlign = 'left';
  }
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  elapsed += dt;

  const sense = window.sense || { state: 'nobody', signals: { present: 0, still: 0, near: 0 }, since: now };
  const signal = sense.signals || {};
  const present = clamp(Number(signal.present) || 0);
  const still = clamp(Number(signal.still) || 0);
  const near = clamp(Number(signal.near) || 0);
  const state = sense.state || 'nobody';

  if (state !== lastState) {
    lastState = state;
    stateEnteredAt = now;
  }

  if (rebootUntil && now >= rebootUntil) resetRun(now);
  const active = present > 0.25 && !(rebootUntil && now < rebootUntil);
  // Deliberately extreme throttle range: far from camera = near-stationary crawl;
  // close = high-speed run. The cubic curve makes the difference dramatic.
  const throttle = Math.pow(near, 3.0);
  // Very broad response curve: far from the camera is a near-stationary crawl;
  // leaning close produces a sudden, unmistakable high-speed surge.
  const speed = active ? 4 + throttle * 1100 : 0;
  if (active) worldY += speed * dt;
  ensureHazards();

  const droneY = Math.max(150, Math.min(height - 105, height * 0.72));
  const wobble = (1 - still) * width * 0.19;
  const drift = active ? Math.sin(elapsed * 1.65) * wobble + Math.sin(elapsed * 3.2 + 0.7) * wobble * 0.24 : 0;
  const droneX = clampX(routeX(worldY) + drift);

  if (active && !(rebootUntil && now < rebootUntil)) {
    for (const hazard of hazards) {
      if (hazard.hit) continue;
      const distanceAhead = hazard.worldY - worldY;
      if (Math.abs(distanceAhead) <= hazard.size * 0.52 + 14) {
        if (Math.abs(hazardX(hazard) - droneX) < hazard.size * 0.82 + 15) {
          hazard.hit = true;
          collisions++;
          integrity = Math.max(0, integrity - 1);
          impactUntil = now + 650;
          if (integrity === 0) rebootUntil = now + 2600;
        } else if (distanceAhead < -hazard.size) {
          hazard.cleared = true;
        }
      }
    }
  }

  drawMap(droneY);
  drawRoute(droneY);
  drawSpeedStreaks(speed, now);
  for (const hazard of hazards) drawHazard(hazard, droneY, now);
  drawDrone(droneX, droneY, still, state, now);
  drawHud({ state, still, near, present, speed, droneX, droneY, now });

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame); 