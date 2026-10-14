(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const ui = { questTitle: $('questTitle'), questText: $('questText'), progress: $('questProgressBar'), step: $('questStep'), fish: $('fishCount'), toast: $('toast'), dialogue: $('dialogue'), dialogueName: $('dialogueName'), dialogueText: $('dialogueText'), dialogueNext: $('dialogueNext'), sound: $('soundButton'), timer: $('runTimer'), rankingModal: $('rankingModal'), rankingList: $('rankingList'), victoryModal: $('victoryModal'), victoryTime: $('victoryTime'), victoryFish: $('victoryFish'), victoryShards: $('victoryShards') };
  const WORLD = { w: 1900, h: 1350 };
  const player = { x: 930, y: 690, radius: 13, speed: 205, facing: 'down', moving: false, walk: 0 };
  const camera = { x: 0, y: 0 };
  const luna = { x: 1130, y: 590, radius: 25 };
  const fox = { x: 1580, y: 520, radius: 23 };
  const fishSpot = { x: 690, y: 825, found: false };
  const moonstones = [{ x: 1640, y: 330, found: false }, { x: 420, y: 1110, found: false }, { x: 1510, y: 1010, found: false }];
  const hiddenFish = [];
  const secretChest = { x: 300, y: 1100, opened: false };
  const totalHiddenFish = 50;
  const SAVE_KEY = 'cats-journey-v2-save';
  const RANKING_KEY = 'cats-journey-v2-local-ranking';
  const PLAYER_NAME_KEY = 'cats-journey-v2-player-name';
  let playerName = 'Котик';
  let firebaseAuth = null;
  let firebaseDb = null;
  let firebaseUid = null;
  let firebaseReadyPromise = Promise.resolve(false);
  const keys = new Set(), touchDirs = new Set(), trees = [], plants = [], motes = [];
  let last = 0, questStage = 0, fishCount = 0, sideQuestStage = 0, moonstoneCount = 0, dialogueOpen = false, pendingAction = null, toastTime = 0, worldTime = 0, saveClock = 0, runStartedAt = 0, runElapsedMs = 0, completedMs = 0, recordSaved = false;
  let seed = 8317; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function buildWorld() {
    for (let i = 0; i < 105; i++) {
      const x = 35 + rand() * (WORLD.w - 70), y = 35 + rand() * (WORLD.h - 70);
      const central = x > 430 && x < 1450 && y > 390 && y < 1030;
      if (central && rand() < .8) continue;
      const size = 28 + rand() * 22; trees.push({ x, y, size, r: size * .53, v: rand() });
    }
    for (const [x, y, s] of [[850, 420, 1.1], [960, 390, 1.2], [1065, 415, 1], [1215, 445, 1.1], [1310, 510, 1.2], [1360, 640, 1.1], [1290, 830, 1.2], [1180, 900, 1.1], [1000, 925, 1.15], [820, 890, 1], [720, 790, 1], [710, 620, 1.2], [770, 500, 1]]) trees.push({ x, y, size: 52 * s, r: 27 * s, v: rand() });
    for (let i = trees.length - 1; i >= 0; i--)if (dist(trees[i], luna) < 62 || dist(trees[i], fishSpot) < 52 || dist(trees[i], player) < 60 || dist(trees[i], fox) < 78 || moonstones.some(m => dist(trees[i], m) < 60)) trees.splice(i, 1);
    for (let i = 0; i < 210; i++) { const x = 30 + rand() * (WORLD.w - 60), y = 30 + rand() * (WORLD.h - 60); plants.push({ x, y, type: rand() > .45 ? 'flower' : 'grass', v: rand() }); }
    for (let i = 0; i < 42; i++)motes.push({ x: rand() * WORLD.w, y: rand() * WORLD.h, p: rand() * 6.28, s: 1 + rand() * 1.7 });
    for (let i = 0; i < totalHiddenFish; i++) hiddenFish.push({ ...findSecretSpot(), found: false, phase: rand() * 6.28 });
    for (const shard of moonstones) { const safe = findSecretSpot(); shard.x = safe.x; shard.y = safe.y; }
    Object.assign(secretChest, findChestSpot());
  }
  function findSecretSpot() {
    for (let attempt = 0; attempt < 1500; attempt++) {
      const spot = { x: 65 + rand() * (WORLD.w - 130), y: 65 + rand() * (WORLD.h - 130) };
      if (dist(spot, player) < 130 || dist(spot, luna) < 115 || dist(spot, fox) < 115 || dist(spot, fishSpot) < 80) continue;
      if (moonstones.some(m => dist(spot, m) < 55)) continue;
      if (trees.some(t => Math.hypot(spot.x - t.x, spot.y - t.y) < t.r + 25)) continue;
      if (hiddenFish.some(f => dist(spot, f) < 48)) continue;
      return spot;
    }
    return { x: 80 + rand() * (WORLD.w - 160), y: 80 + rand() * (WORLD.h - 160) };
  }
  function findChestSpot() {
    for (let attempt = 0; attempt < 1200; attempt++) {
      const x = 390 + rand() * 1110;
      const y = 760 + Math.sin(x / 180) * 72 + Math.sin(x / 73) * 12 + (rand() - .5) * 26;
      const spot = { x, y };
      if (dist(spot, player) < 180 || dist(spot, luna) < 130 || dist(spot, fox) < 130) continue;
      if (trees.some(t => Math.hypot(spot.x - t.x, spot.y - t.y) < t.r + 32)) continue;
      if (hiddenFish.some(f => dist(spot, f) < 50)) continue;
      return spot;
    }
    return findSecretSpot();
  }
  function resize() { const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.floor(r.width * dpr)); canvas.height = Math.max(1, Math.floor(r.height * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener('resize', resize); resize(); buildWorld();
  function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function screen(x, y) { return { x: x - camera.x, y: y - camera.y }; }
  function drawGround() {
    ctx.fillStyle = '#49785a'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    for (let i = 0; i < 60; i++) { const x = (i * 317) % WORLD.w, y = (i * 191) % WORLD.h, g = ctx.createRadialGradient(x, y, 4, x, y, 115); g.addColorStop(0, 'rgba(190,218,139,.12)'); g.addColorStop(1, 'rgba(190,218,139,0)'); ctx.fillStyle = g; ctx.fillRect(x - 115, y - 115, 230, 230); }
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const x = 350 + i * 31, y = 760 + Math.sin(x / 180) * 72 + Math.sin(x / 73) * 12; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.lineCap = 'round'; ctx.lineWidth = 118; ctx.strokeStyle = '#b8a77c'; ctx.stroke(); ctx.lineWidth = 108; ctx.strokeStyle = '#d0bd8e'; ctx.stroke(); ctx.setLineDash([5, 12]); ctx.lineWidth = 2; ctx.strokeStyle = '#6e634333'; ctx.stroke(); ctx.setLineDash([]);
    ellipse(1490, 310, 160, 100, '#365e5b'); ellipse(1490, 303, 145, 87, '#5caaa0'); ellipse(1480, 292, 105, 50, '#76beb0'); ctx.strokeStyle = '#c5e6c155'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(1490, 303, 120, 62, -.1, 0, Math.PI * 2); ctx.stroke(); ellipse(980, 670, 360, 300, '#c7de931a');
  }
  function drawPlants() { for (const d of plants) { const p = screen(d.x, d.y); if (p.x < -15 || p.x > canvas.clientWidth + 15 || p.y < -15 || p.y > canvas.clientHeight + 15) continue; if (d.type === 'flower') { const colors = ['#f3d9a4', '#e6b7d5', '#d8e9b6', '#f4eee0']; ellipse(p.x, p.y, 2, 4, '#2d5a3e'); ellipse(p.x, p.y - 3, 3, 3, colors[Math.floor(d.v * 4)]); ellipse(p.x + 2, p.y - 2, 1.5, 1.5, '#f9edcb'); } else { ctx.strokeStyle = '#a9cf8b88'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p.x, p.y + 4); ctx.quadraticCurveTo(p.x - 4, p.y - 2, p.x - 2, p.y - 5); ctx.moveTo(p.x + 1, p.y + 4); ctx.quadraticCurveTo(p.x + 5, p.y, p.x + 4, p.y - 4); ctx.stroke(); } } }
  function drawTree(t) { const p = screen(t.x, t.y), s = t.size; if (p.x < -90 || p.x > canvas.clientWidth + 90 || p.y < -100 || p.y > canvas.clientHeight + 90) return; ellipse(p.x + 3, p.y + s * .28, s * .63, s * .25, '#112d1f44'); ctx.fillStyle = '#75583e'; rr(p.x - s * .15, p.y - s * .08, s * .3, s * .58, 7); ctx.fill(); ctx.fillStyle = '#98704b'; rr(p.x - s * .08, p.y - s * .02, s * .1, s * .45, 4); ctx.fill(); ellipse(p.x, p.y - s * .22, s * .55, s * .48, t.v > .5 ? '#2d6248' : '#32694b'); ellipse(p.x - s * .22, p.y - s * .15, s * .38, s * .34, '#3d7a52'); ellipse(p.x + s * .22, p.y - s * .2, s * .37, s * .34, '#39734e'); ellipse(p.x - s * .08, p.y - s * .34, s * .29, s * .26, '#4a8959'); ellipse(p.x + s * .15, p.y - s * .32, s * .25, s * .22, '#4d8d5e'); ellipse(p.x - s * .23, p.y - s * .22, s * .13, s * .09, '#83ad6a55'); }
  function prompt(x, y, text) { ctx.font = '800 10px Nunito,sans-serif'; const w = ctx.measureText(text).width + 20; ctx.fillStyle = '#162b2add'; rr(x - w / 2, y - 13, w, 25, 9); ctx.fill(); ctx.strokeStyle = '#e1f2d83b'; ctx.stroke(); ctx.fillStyle = '#f4e7c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  function drawLuna(time) { const p = screen(luna.x, luna.y), b = Math.sin(time / 380) * 2; ellipse(p.x, p.y + 19, 24, 9, '#102b204a'); ellipse(p.x, p.y + 5 + b, 18, 21, '#f1e6df'); ellipse(p.x, p.y - 8 + b, 19, 18, '#f5e9df'); ctx.fillStyle = '#f5e9df'; ctx.beginPath(); ctx.moveTo(p.x - 15, p.y - 15 + b); ctx.lineTo(p.x - 17, p.y - 34 + b); ctx.lineTo(p.x - 4, p.y - 23 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 5, p.y - 23 + b); ctx.lineTo(p.x + 18, p.y - 35 + b); ctx.lineTo(p.x + 15, p.y - 13 + b); ctx.fill(); ctx.fillStyle = '#d9a5ae'; ctx.beginPath(); ctx.moveTo(p.x - 13, p.y - 20 + b); ctx.lineTo(p.x - 14, p.y - 29 + b); ctx.lineTo(p.x - 7, p.y - 22 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 9, p.y - 22 + b); ctx.lineTo(p.x + 15, p.y - 29 + b); ctx.lineTo(p.x + 13, p.y - 19 + b); ctx.fill(); ellipse(p.x - 7, p.y - 12 + b, 2.2, 3.6, '#554d5b'); ellipse(p.x + 7, p.y - 12 + b, 2.2, 3.6, '#554d5b'); ellipse(p.x, p.y - 5 + b, 2.3, 1.6, '#ce8d91'); ctx.fillStyle = '#cba9df'; ctx.beginPath(); ctx.moveTo(p.x - 2, p.y - 29 + b); ctx.lineTo(p.x - 13, p.y - 35 + b); ctx.lineTo(p.x - 12, p.y - 25 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 1, p.y - 29 + b); ctx.lineTo(p.x + 12, p.y - 36 + b); ctx.lineTo(p.x + 10, p.y - 25 + b); ctx.fill(); ellipse(p.x, p.y - 29 + b, 3, 3, '#f4d7f0'); if (dist(player, luna) < 100) prompt(p.x, p.y - 54, 'E  ПОГОВОРИТЬ'); }
  function drawFox(time) { const p = screen(fox.x, fox.y), b = Math.sin(time / 420) * 1.5; if (p.x < -60 || p.x > canvas.clientWidth + 60 || p.y < -60 || p.y > canvas.clientHeight + 60) return; ellipse(p.x, p.y + 16, 23, 8, '#102b204a'); ellipse(p.x, p.y + 4 + b, 17, 18, '#d58a55'); ellipse(p.x, p.y - 8 + b, 17, 15, '#e5a56b'); ctx.fillStyle = '#e5a56b'; ctx.beginPath(); ctx.moveTo(p.x - 14, p.y - 14 + b); ctx.lineTo(p.x - 18, p.y - 34 + b); ctx.lineTo(p.x - 3, p.y - 23 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 3, p.y - 23 + b); ctx.lineTo(p.x + 18, p.y - 35 + b); ctx.lineTo(p.x + 14, p.y - 12 + b); ctx.fill(); ctx.fillStyle = '#f5d9bd'; ctx.beginPath(); ctx.moveTo(p.x - 13, p.y - 22 + b); ctx.lineTo(p.x - 16, p.y - 30 + b); ctx.lineTo(p.x - 7, p.y - 23 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 8, p.y - 23 + b); ctx.lineTo(p.x + 15, p.y - 30 + b); ctx.lineTo(p.x + 12, p.y - 20 + b); ctx.fill(); ellipse(p.x - 6, p.y - 9 + b, 2, 3, '#3b3030'); ellipse(p.x + 6, p.y - 9 + b, 2, 3, '#3b3030'); ctx.fillStyle = '#f5e5d5'; ctx.beginPath(); ctx.moveTo(p.x - 9, p.y - 1 + b); ctx.lineTo(p.x, p.y + 7 + b); ctx.lineTo(p.x + 9, p.y - 1 + b); ctx.closePath(); ctx.fill(); ellipse(p.x, p.y - 2 + b, 2, 1.5, '#473331'); if (dist(player, fox) < 100) prompt(p.x, p.y - 52, 'E  ПОГОВОРИТЬ'); }
  function drawMoonstones(time) { for (let i = 0; i < moonstones.length; i++) { const m = moonstones[i]; if (m.found) continue; const p = screen(m.x, m.y), b = Math.sin(time / 320 + i) * 3; if (p.x < -35 || p.x > canvas.clientWidth + 35 || p.y < -35 || p.y > canvas.clientHeight + 35) continue; const glow = ctx.createRadialGradient(p.x, p.y + b, 2, p.x, p.y + b, 25); glow.addColorStop(0, '#c9c2ff66'); glow.addColorStop(1, '#c9c2ff00'); ctx.fillStyle = glow; ctx.fillRect(p.x - 25, p.y - 25 + b, 50, 50); ctx.save(); ctx.translate(p.x, p.y + b); ctx.rotate(.18 + i * .7); ctx.fillStyle = '#c9c4ff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -2); ctx.lineTo(5, 8); ctx.lineTo(-4, 9); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#f2eaff'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); if (dist(player, m) < 66 && sideQuestStage >= 1) prompt(p.x, p.y - 21, 'E  ВЗЯТЬ ОСКОЛОК'); } }
  function drawHiddenFish(time) { for (const f of hiddenFish) { if (f.found) continue; const p = screen(f.x, f.y); if (p.x < -20 || p.x > canvas.clientWidth + 20 || p.y < -20 || p.y > canvas.clientHeight + 20) continue; const near = dist(player, f) < 88; const bob = Math.sin(time / 390 + f.phase) * 1.8; ctx.save(); ctx.globalAlpha = near ? .95 : .46; ctx.translate(p.x, p.y + bob); ctx.rotate(-.18); ctx.fillStyle = near ? '#ffe5a0' : '#d8c58b'; ctx.beginPath(); ctx.ellipse(-1, 0, 6, 3.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(9, -4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill(); ellipse(-3, -.7, .8, .8, '#344c40'); ctx.restore(); if (near) prompt(p.x, p.y - 14, questStage >= 1 ? 'E  РЫБКА' : 'СНАЧАЛА ЛУНА'); } }
  function drawSecretChest() { if (fishCount < totalHiddenFish || secretChest.opened) return; const p = screen(secretChest.x, secretChest.y); if (p.x < -40 || p.x > canvas.clientWidth + 40 || p.y < -40 || p.y > canvas.clientHeight + 40) return; const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 32); glow.addColorStop(0, '#ffd98a77'); glow.addColorStop(1, '#ffd98a00'); ctx.fillStyle = glow; ctx.fillRect(p.x - 32, p.y - 32, 64, 64); ctx.fillStyle = '#704b35'; rr(p.x - 12, p.y - 5, 24, 16, 4); ctx.fill(); ctx.fillStyle = '#bd8750'; rr(p.x - 13, p.y - 10, 26, 10, 4); ctx.fill(); ctx.fillStyle = '#f4d48b'; ctx.fillRect(p.x - 2, p.y - 7, 4, 15); if (dist(player, secretChest) < 70) prompt(p.x, p.y - 23, 'E  ОТКРЫТЬ СУНДУК'); }
  function drawFish(time) { if (fishSpot.found) return; const p = screen(fishSpot.x, fishSpot.y), b = Math.sin(time / 270) * 4; if (p.x < -30 || p.x > canvas.clientWidth + 30 || p.y < -30 || p.y > canvas.clientHeight + 30) return; const g = ctx.createRadialGradient(p.x, p.y + b, 2, p.x, p.y + b, 33); g.addColorStop(0, '#ffdf8a5c'); g.addColorStop(1, '#ffdf8a00'); ctx.fillStyle = g; ctx.fillRect(p.x - 33, p.y - 33 + b, 66, 66); ctx.save(); ctx.translate(p.x, p.y + b); ctx.rotate(-.2); ctx.fillStyle = '#f5d58c'; ctx.beginPath(); ctx.ellipse(-2, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(15, -6); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill(); ellipse(-5, -1, 1.5, 1.5, '#425749'); ctx.restore(); if (dist(player, fishSpot) < 70 && questStage >= 1) prompt(p.x, p.y - 24, 'E  ПОДОБРАТЬ'); }
  function drawPlayer(time) { const p = screen(player.x, player.y), stride = player.moving ? Math.sin(player.walk * 13) * 3 : Math.sin(time / 420) * .7, b = player.moving ? Math.abs(Math.sin(player.walk * 13)) * 1.5 : Math.sin(time / 500); ellipse(p.x, p.y + 13, 17, 7, '#0d251b4d'); ctx.strokeStyle = '#f1dfd3'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x + 10, p.y + 4); ctx.quadraticCurveTo(p.x + 24, p.y + 7 + stride, p.x + 21, p.y - 5 + stride); ctx.stroke(); ctx.fillStyle = '#d78e9f'; ctx.beginPath(); ctx.moveTo(p.x - 9, p.y + 1 + b); ctx.quadraticCurveTo(p.x, p.y + 7 + b, p.x + 9, p.y + 1 + b); ctx.lineTo(p.x + 7, p.y + 8 + b); ctx.lineTo(p.x - 6, p.y + 8 + b); ctx.closePath(); ctx.fill(); ellipse(p.x, p.y + 3 + b, 14, 16, '#f3e9dd'); ellipse(p.x, p.y - 8 + b, 17, 16, '#fff1e4'); ctx.fillStyle = '#fff1e4'; ctx.beginPath(); ctx.moveTo(p.x - 13, p.y - 17 + b); ctx.lineTo(p.x - 15, p.y - 34 + b); ctx.lineTo(p.x - 3, p.y - 24 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 4, p.y - 24 + b); ctx.lineTo(p.x + 16, p.y - 34 + b); ctx.lineTo(p.x + 14, p.y - 15 + b); ctx.fill(); ctx.fillStyle = '#dba4a7'; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y - 22 + b); ctx.lineTo(p.x - 13, p.y - 30 + b); ctx.lineTo(p.x - 7, p.y - 23 + b); ctx.fill(); ctx.beginPath(); ctx.moveTo(p.x + 7, p.y - 23 + b); ctx.lineTo(p.x + 13, p.y - 30 + b); ctx.lineTo(p.x + 12, p.y - 21 + b); ctx.fill(); ctx.strokeStyle = '#d8b9a7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y - 22 + b); ctx.lineTo(p.x - 1, p.y - 17 + b); ctx.stroke(); const shift = player.facing === 'left' ? -2 : player.facing === 'right' ? 2 : 0; ellipse(p.x - 6 + shift, p.y - 9 + b, 2.3, 3.6, '#4c4b57'); ellipse(p.x + 6 + shift, p.y - 9 + b, 2.3, 3.6, '#4c4b57'); ellipse(p.x - 5 + shift, p.y - 10 + b, .8, 1.2, '#fff'); ellipse(p.x + 7 + shift, p.y - 10 + b, .8, 1.2, '#fff'); ellipse(p.x, p.y - 2 + b, 2.2, 1.5, '#d68d96'); ellipse(p.x - 10, p.y - 3 + b, 3, 1.7, '#efb1ad66'); ellipse(p.x + 10, p.y - 3 + b, 3, 1.7, '#efb1ad66'); if (fishCount > 0) { ellipse(p.x + 11, p.y - 26 + b, 3, 3, '#e9a7c7'); ellipse(p.x + 14, p.y - 26 + b, 2, 2, '#f6d9a2'); } if (questStage >= 3) { ellipse(p.x - 13, p.y - 28 + b, 4, 4, '#f0a6cb'); ellipse(p.x - 13, p.y - 28 + b, 1.6, 1.6, '#ffe7a5'); } if (secretChest.opened) { ctx.save(); ctx.translate(p.x, p.y - 38 + b); ctx.fillStyle = '#f4cf68'; ctx.strokeStyle = '#fff0b5'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-9, -10); ctx.lineTo(-3, -4); ctx.lineTo(0, -13); ctx.lineTo(4, -4); ctx.lineTo(10, -10); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f9e9a0'; ctx.fillRect(-10, 1, 20, 3); ctx.restore(); } }
  function drawMotes(time) { for (const m of motes) { const p = screen(m.x, m.y); if (p.x < 0 || p.x > canvas.clientWidth || p.y < 0 || p.y > canvas.clientHeight) continue; const a = .12 + .2 * (.5 + .5 * Math.sin(time / 650 + m.p)); ellipse(p.x + Math.sin(time / 900 + m.p) * 4, p.y + Math.cos(time / 1100 + m.p) * 5, m.s, m.s, `rgba(240,238,173,${a})`); } }
  function collides(x, y) { if (x < 28 || y < 28 || x > WORLD.w - 28 || y > WORLD.h - 28) return true; for (const t of trees) if (Math.hypot(x - t.x, y - t.y) < t.r + player.radius * .62) return true; return false; }
  function move(dt) { let dx = 0, dy = 0; if (keys.has('arrowleft') || keys.has('a') || touchDirs.has('left')) dx--; if (keys.has('arrowright') || keys.has('d') || touchDirs.has('right')) dx++; if (keys.has('arrowup') || keys.has('w') || touchDirs.has('up')) dy--; if (keys.has('arrowdown') || keys.has('s') || touchDirs.has('down')) dy++; const len = Math.hypot(dx, dy); player.moving = len > 0; if (len) { ensureTimerStarted(); dx /= len; dy /= len; if (Math.abs(dx) > Math.abs(dy)) player.facing = dx < 0 ? 'left' : 'right'; else player.facing = dy < 0 ? 'up' : 'down'; const step = player.speed * dt; if (!collides(player.x + dx * step, player.y)) player.x += dx * step; if (!collides(player.x, player.y + dy * step)) player.y += dy * step; player.walk += dt; } }
  function updateCamera(dt) { const w = canvas.clientWidth, h = canvas.clientHeight, tx = Math.max(0, Math.min(WORLD.w - w, player.x - w / 2)), ty = Math.max(0, Math.min(WORLD.h - h, player.y - h / 2)), s = 1 - Math.pow(.001, dt); camera.x += (tx - camera.x) * s; camera.y += (ty - camera.y) * s; }
  function render(time) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawGround();
    ctx.restore();
    drawPlants();
    const actors = trees.map(t => ({ y: t.y, draw: () => drawTree(t) }));
    actors.push({ y: luna.y, draw: () => drawLuna(time) }, { y: fox.y, draw: () => drawFox(time) }, { y: fishSpot.y, draw: () => drawFish(time) }, { y: player.y, draw: () => drawPlayer(time) });
    for (const m of moonstones) actors.push({ y: m.y, draw: () => { } });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
    drawMoonstones(time); drawHiddenFish(time); drawSecretChest();
    drawMotes(time);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, '#142d260f'); shade.addColorStop(1, '#0c1f1d24');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    const dusk = (Math.sin(worldTime / 26000 - 1.1) + 1) / 2; ctx.fillStyle = `rgba(27,35,79,${dusk * .20})`; ctx.fillRect(0, 0, w, h);
  }
  function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 4, player: { x: player.x, y: player.y }, questStage, fishCount, sideQuestStage, moonstoneCount, questFishFound: fishSpot.found, collectiblesFound: hiddenFish.map(f => f.found), moonstonesFound: moonstones.map(m => m.found), chestOpened: secretChest.opened, runStartedAt: !!runStartedAt, elapsedMs: currentRunMs(), completedMs, recordSaved })); } catch (e) {/* Storage can be unavailable in private browsing; gameplay still works. */ } }
  function refreshCounters() { fishCount = hiddenFish.filter(f => f.found).length; ui.fish.textContent = `${fishCount}/${totalHiddenFish}`; $('moonstoneCount').textContent = `${moonstoneCount}/3`; }
  function loadGame() { try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return; const d = JSON.parse(raw); if (!d || typeof d !== 'object') return; player.x = Number.isFinite(d.player?.x) ? Math.max(40, Math.min(WORLD.w - 40, d.player.x)) : player.x; player.y = Number.isFinite(d.player?.y) ? Math.max(40, Math.min(WORLD.h - 40, d.player.y)) : player.y; questStage = Number.isInteger(d.questStage) ? Math.max(0, Math.min(3, d.questStage)) : 0; sideQuestStage = Number.isInteger(d.sideQuestStage) ? Math.max(0, Math.min(2, d.sideQuestStage)) : 0; fishSpot.found = typeof d.questFishFound === 'boolean' ? d.questFishFound : !!d.fishFound; if (Array.isArray(d.collectiblesFound)) hiddenFish.forEach((f, i) => f.found = !!d.collectiblesFound[i]); if (Array.isArray(d.moonstonesFound)) moonstones.forEach((m, i) => m.found = !!d.moonstonesFound[i]); else if (d.moonstoneFound) moonstones[0].found = true; moonstoneCount = moonstones.filter(m => m.found).length; secretChest.opened = !!d.chestOpened; runElapsedMs = Number.isFinite(d.elapsedMs) ? Math.max(0, d.elapsedMs) : 0; runStartedAt = d.runStartedAt ? Date.now() : 0; completedMs = Number.isFinite(d.completedMs) ? d.completedMs : 0; recordSaved = !!d.recordSaved; refreshCounters(); } catch (e) {/* Ignore a corrupted save and start a fresh adventure. */ } }
  function toast(message) { ui.toast.textContent = message; ui.toast.classList.add('visible'); toastTime = 2.4; }
  function updateQuest() { ui.questTitle.textContent = fishCount >= totalHiddenFish && !secretChest.opened ? 'Пора домой!' : CAT_QUEST.title; const data = CAT_QUEST.steps[Math.min(questStage, 2)]; ui.questText.textContent = fishCount >= totalHiddenFish && !secretChest.opened ? 'Все рыбки собраны! Возвращайся по извилистой тропинке к сундуку у дороги.' : questStage >= 3 ? CAT_QUEST.completedText : data.text; ui.progress.style.width = (fishCount >= totalHiddenFish || questStage >= 3) ? '100%' : data.progress + '%'; ui.step.textContent = fishCount >= totalHiddenFish && !secretChest.opened ? 'Финальный путь' : questStage >= 3 ? 'Задание завершено' : `Шаг ${questStage + 1} из 3`; }
  function openDialogue(name, text, button, action) { dialogueOpen = true; pendingAction = action || null; ui.dialogueName.textContent = name; ui.dialogueText.textContent = text; ui.dialogueNext.innerHTML = button + ' <span>↗</span>'; ui.dialogue.hidden = false; }
  function closeDialogue() { dialogueOpen = false; ui.dialogue.hidden = true; }
  function advanceDialogue() { closeDialogue(); if (pendingAction) { const action = pendingAction; pendingAction = null; action(); saveGame(); } }
  function ensureTimerStarted() { if (!runStartedAt) { runStartedAt = Date.now(); saveGame(); } }
  function formatTime(ms) { const total = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60; return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; }
  function currentRunMs() { return completedMs || (runElapsedMs + (runStartedAt ? Date.now() - runStartedAt : 0)); }
  function loadPlayerName() { try { const saved = localStorage.getItem(PLAYER_NAME_KEY); if (saved) playerName = saved.slice(0, 18); } catch (e) { } $('playerNameLabel').textContent = playerName; }

  async function initFirebase() {
    const config = window.CAT_FIREBASE_CONFIG;

    if (
      !window.firebase ||
      !config ||
      !config.apiKey ||
      config.apiKey.startsWith("ВСТАВЬ_")
    ) {
      console.warn("Firebase пока не настроен. Используется локальный рейтинг.");
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }

    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();

    await firebaseAuth.setPersistence(
      firebase.auth.Auth.Persistence.LOCAL
    );

    const credential = await firebaseAuth.signInAnonymously();
    firebaseUid = credential.user.uid;

    console.log("Firebase подключён. ID игрока:", firebaseUid);
    return true;
  }

  async function saveCloudName() {
    const ready = await firebaseReadyPromise;

    if (!ready || !firebaseDb || !firebaseUid) return;

    await firebaseDb.collection("leaderboard").doc(firebaseUid).set({
      name: playerName,
      updatedAt: Date.now()
    }, { merge: true });
  }

  async function saveGlobalRecord(ms) {
    const ready = await firebaseReadyPromise;

    if (!ready || !firebaseDb || !firebaseUid) {
      console.warn("Рекорд не отправлен: Firebase недоступен.");
      return;
    }

    const ref = firebaseDb.collection("leaderboard").doc(firebaseUid);

    await firebaseDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const previous = snapshot.exists ? snapshot.data() : {};

      const previousMs =
        Number.isFinite(previous.ms) && previous.ms > 0
          ? previous.ms
          : null;

      const bestMs = previousMs === null
        ? ms
        : Math.min(previousMs, ms);

      transaction.set(ref, {
        name: playerName,
        ms: bestMs,
        updatedAt: Date.now(),
        createdAt: previous.createdAt || Date.now()
      }, { merge: true });
    });
  }

  function openNameEditor() { $('playerNameInput').value = playerName === 'Котик' ? '' : playerName; $('nameModal').hidden = false; $('playerNameInput').focus(); }
  function closeNameEditor() { $('nameModal').hidden = true; }

  async function savePlayerName(event) {
    event.preventDefault();

    const value = $("playerNameInput").value
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 18);

    if (!value) {
      $("playerNameInput").focus();
      return;
    }

    playerName = value;

    try {
      localStorage.setItem(PLAYER_NAME_KEY, playerName);
    } catch (e) {
      console.warn("Не удалось сохранить имя на устройстве.", e);
    }

    $("playerNameLabel").textContent = playerName;
    closeNameEditor();
    toast(`Приятно познакомиться, ${playerName}!`);
    saveGame();

    try {
      await saveCloudName();
    } catch (error) {
      console.error("Не удалось сохранить имя в Firebase:", error);
      toast("Имя сохранено на устройстве, но не в облаке.");
    }
  }

  function getRanking() { try { const value = JSON.parse(localStorage.getItem(RANKING_KEY) || '[]'); return Array.isArray(value) ? value.filter(r => Number.isFinite(r.ms) && r.ms > 0).sort((a, b) => a.ms - b.ms).slice(0, 10) : []; } catch (e) { return []; } }

  async function renderRanking() {
    ui.rankingList.innerHTML =
      '<li class="empty-ranking">Загружаем рейтинг...</li>';

    let records = [];

    try {
      const ready = await firebaseReadyPromise;

      if (ready && firebaseDb) {
        const snapshot = await firebaseDb
          .collection("leaderboard")
          .where("ms", ">", 0)
          .orderBy("ms", "asc")
          .limit(10)
          .get();

        records = snapshot.docs.map(doc => {
          const data = doc.data();

          return {
            name: data.name || "Без имени",
            ms: data.ms
          };
        });
      } else {
        records = getRanking();
      }
    } catch (error) {
      console.error("Ошибка загрузки мирового рейтинга:", error);
      records = getRanking();
    }

    ui.rankingList.innerHTML = "";

    if (!records.length) {
      ui.rankingList.innerHTML =
        '<li class="empty-ranking">Пока нет рекордов. Открой сундук и установи первый!</li>';
      return;
    }

    records.sort((a, b) => a.ms - b.ms);

    records.slice(0, 10).forEach((record, index) => {
      const li = document.createElement("li");

      const place = document.createElement("span");
      place.className = "rank-place";
      place.textContent = String(index + 1);

      const name = document.createElement("span");
      name.textContent = record.name || "Без имени";

      const time = document.createElement("strong");
      time.className = "rank-time";
      time.textContent = formatTime(record.ms);

      li.append(place, name, time);
      ui.rankingList.append(li);
    });
  }

  function openRanking() { renderRanking(); ui.rankingModal.hidden = false; }
  function closeRanking() { ui.rankingModal.hidden = true; }
  function showVictory() { ui.victoryTime.textContent = formatTime(completedMs || currentRunMs()); ui.victoryFish.textContent = `${fishCount}/${totalHiddenFish}`; ui.victoryShards.textContent = `${moonstoneCount}/3`; ui.victoryModal.hidden = false; }
  function finishRun() {
    if (!runStartedAt && !runElapsedMs) runStartedAt = Date.now(); completedMs = Math.max(1000, currentRunMs()); runElapsedMs = completedMs; runStartedAt = 0; secretChest.opened = true; if (!recordSaved) {
      const records = getRanking(); records.push({ name: playerName, ms: completedMs, createdAt: Date.now() }); records.sort((a, b) => a.ms - b.ms); try { localStorage.setItem(RANKING_KEY, JSON.stringify(records.slice(0, 10))); } catch (e) { } recordSaved = true; saveGlobalRecord(completedMs).catch(error => {
        console.error("Не удалось отправить рекорд в Firebase:", error);
      });
    } updateQuest(); saveGame(); showVictory();
  }
  function resetRun() { player.x = 930; player.y = 690; player.facing = 'down'; player.moving = false; player.walk = 0; camera.x = 0; camera.y = 0; questStage = 0; fishCount = 0; sideQuestStage = 0; moonstoneCount = 0; fishSpot.found = false; hiddenFish.forEach(f => f.found = false); moonstones.forEach(m => m.found = false); secretChest.opened = false; runStartedAt = Date.now(); runElapsedMs = 0; completedMs = 0; recordSaved = false; dialogueOpen = false; pendingAction = null; ui.dialogue.hidden = true; ui.victoryModal.hidden = true; closeRanking(); refreshCounters(); updateQuest(); saveGame(); toast('Новая прогулка началась! Поговори с Луной и Рыжиком.'); }
  function interact() { if (dialogueOpen) { advanceDialogue(); return; } ensureTimerStarted(); if (dist(player, fox) < 85) { if (sideQuestStage === 0) openDialogue('Рыжик', 'Псс… я храню секрет леса. На берегу пруда спрятан лунный осколок. Принесёшь его мне?', 'Найти осколок', () => { sideQuestStage = 1; toast('Новое побочное задание: найди лунный осколок'); saveGame(); }); else if (sideQuestStage === 1 && moonstoneCount >= 3) openDialogue('Рыжик', 'Ты нашла все три осколка! Они снова соединились в лунный талисман. Держи звёздную пыльцу!', 'Получить награду', () => { sideQuestStage = 2; toast('Секрет раскрыт! Получена звёздная пыльца ✦'); saveGame(); }); else if (sideQuestStage === 2) openDialogue('Рыжик', 'Секрет теперь твой. Прислушайся к лесу — у него ещё много историй.', 'До встречи', null); else openDialogue('Рыжик', `Я спрятал три лунных осколка по всему лесу. Найдено: ${moonstoneCount}/3. Ищи крошечные фиолетовые искорки!`, 'Поняла!', null); return; } if (dist(player, luna) < 85) { if (questStage === 0) openDialogue('Луна', 'Привет, путешественник! Я потеряла свою счастливую рыбку. Кажется, она упала где-то на поляне. Поможешь поискать?', 'Начать поиск', () => { questStage = 1; updateQuest(); toast('Теперь можно искать рыбок!'); saveGame(); }); else if (questStage === 2) openDialogue('Луна', 'Ты нашёл её! Спасибо! Возьми этот цветок-талисман — пусть он принесёт тебе удачу в путешествиях.', 'Получить награду', () => { questStage = 3; updateQuest(); toast('Награда получена! Открыт цветок-аксессуар ✿'); saveGame(); }); else if (questStage === 3) openDialogue('Луна', 'Пусть лесные звёзды освещают твой путь. Возвращайся, если захочешь поболтать!', 'До встречи', null); else openDialogue('Луна', 'Рыбка всё ещё где-то на поляне. Я верю в тебя!', 'Ищу дальше', null); return; } if (!fishSpot.found && dist(player, fishSpot) < 72 && questStage >= 1) { fishSpot.found = true; questStage = 2; updateQuest(); toast('Ты нашёл золотую рыбку! Вернись к Луне.'); saveGame(); return; } if (fishCount >= totalHiddenFish && !secretChest.opened && dist(player, secretChest) < 62) { finishRun(); toast('Сундук открыт! Ты стала легендой леса 👑'); return; } if (sideQuestStage >= 1) { const shard = moonstones.find(m => !m.found && dist(player, m) < 62); if (shard) { shard.found = true; moonstoneCount = moonstones.filter(m => m.found).length; refreshCounters(); toast(moonstoneCount >= 3 ? 'Все три осколка найдены! Вернись к Рыжику ✦' : `Лунный осколок найден! ${moonstoneCount}/3`); saveGame(); return; } } const hidden = hiddenFish.find(f => !f.found && dist(player, f) < 38); if (hidden && questStage >= 1) { hidden.found = true; refreshCounters(); updateQuest(); toast(`Рыбка найдена! ${fishCount}/${totalHiddenFish} 🐟`); if (fishCount === totalHiddenFish) { updateQuest(); toast('Все 50 рыбок! Сундук появился у тропинки — возвращайся по дороге домой ✨'); } saveGame(); return; } if (hidden && questStage < 1) { toast('Сначала поговори с Луной — она расскажет о рыбках!'); return; } toast('Здесь пока тихо… Осмотрись внимательнее.'); }
  addEventListener('beforeunload', saveGame);
  ui.dialogueNext.addEventListener('click', advanceDialogue);
  $('playerNameButton').addEventListener('click', openNameEditor); $('nameForm').addEventListener('submit', savePlayerName); $('closeName').addEventListener('click', closeNameEditor); $('nameModal').addEventListener('click', e => { if (e.target === $('nameModal')) closeNameEditor(); });
  $('interactTouch').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
  $('rankingButton').addEventListener('click', openRanking); $('closeRanking').addEventListener('click', closeRanking); $('closeRankingBottom').addEventListener('click', closeRanking); $('playAgainButton').addEventListener('click', resetRun); $('victoryRankingButton').addEventListener('click', () => { ui.victoryModal.hidden = true; openRanking(); }); ui.rankingModal.addEventListener('click', e => { if (e.target === ui.rankingModal) closeRanking(); }); ui.victoryModal.addEventListener('click', e => { if (e.target === ui.victoryModal) { } });
  ui.sound.addEventListener('click', () => toast('Звуки появятся на следующем этапе.'));
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); keys.add(k); if (['e', 'enter', ' '].includes(k) && !e.repeat) interact(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); addEventListener('blur', () => { keys.clear(); touchDirs.clear(); });
  document.querySelectorAll('[data-dir]').forEach(button => { const dir = button.dataset.dir; button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); touchDirs.add(dir); }); const release = e => { e.preventDefault(); touchDirs.delete(dir); }; button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', () => touchDirs.delete(dir)); });
  function loop(time) { const dt = Math.min((time - last) / 1000 || 0, .035); last = time; worldTime += dt * 1000; saveClock += dt; if (saveClock > 5) { saveClock = 0; saveGame(); } move(dt); updateCamera(dt); render(time); ui.timer.textContent = formatTime(currentRunMs()); if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) ui.toast.classList.remove('visible'); } requestAnimationFrame(loop); }
  
  loadPlayerName();
  loadGame();
  refreshCounters();
  updateQuest();

  firebaseReadyPromise = initFirebase().catch(error => {
    console.error("Ошибка запуска Firebase:", error);
    return false;
  });

  try {
    if (!localStorage.getItem(PLAYER_NAME_KEY)) {
      setTimeout(openNameEditor, 450);
    }
  } catch (error) {
    console.warn("Не удалось проверить сохранённое имя.", error);
  }

  if (secretChest.opened) {
    showVictory();
  }

  requestAnimationFrame(loop);
})();
