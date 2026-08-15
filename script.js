/* =========================================================
   ElectroCalc — script.js
   Vanilla JS. No frameworks, no external libraries.
   Organized by: Utilities -> Data -> Router -> Views -> Calculators -> Init
========================================================= */

(function(){
"use strict";

/* =========================================================
   1. UTILITIES
========================================================= */

const $  = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

function el(tag, attrs, children){
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs){
    if (k === 'class') node.className = attrs[k];
    else if (k === 'html') node.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
    else node.setAttribute(k, attrs[k]);
  }
  if (children) (Array.isArray(children) ? children : [children]).forEach(c=>{
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

let toastTimer = null;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

function copyText(text){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard'))
      .catch(()=>fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); toast('Copied to clipboard'); }catch(e){ toast('Copy failed'); }
  document.body.removeChild(ta);
}

/* ---------- localStorage helpers (safe against private-mode errors) ---------- */
const STORE_KEYS = { theme:'ec_theme', history:'ec_history', favorites:'ec_favorites' };

function lsGet(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }catch(e){ return fallback; }
}
function lsSet(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ return false; }
}

function getHistory(){ return lsGet(STORE_KEYS.history, []); }
function addHistory(entry){
  const hist = getHistory();
  hist.unshift(Object.assign({ time: Date.now() }, entry));
  if (hist.length > 50) hist.length = 50;
  lsSet(STORE_KEYS.history, hist);
}
function deleteHistoryItem(idx){
  const hist = getHistory();
  hist.splice(idx,1);
  lsSet(STORE_KEYS.history, hist);
}
function clearHistory(){ lsSet(STORE_KEYS.history, []); }

function getFavorites(){ return lsGet(STORE_KEYS.favorites, []); }
function isFavorite(id){ return getFavorites().includes(id); }
function toggleFavorite(id){
  let favs = getFavorites();
  if (favs.includes(id)) favs = favs.filter(f=>f!==id);
  else favs.push(id);
  lsSet(STORE_KEYS.favorites, favs);
  return favs.includes(id);
}

/* ---------- number formatting ---------- */
function isValidNum(n){ return typeof n === 'number' && isFinite(n) && !isNaN(n); }

function fmt(n, sig){
  sig = sig || 4;
  if (!isValidNum(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e12)) return n.toExponential(3);
  let out = Number(n.toPrecision(sig));
  // avoid scientific notation creeping in for mid-range small numbers
  if (Math.abs(out) < 1e-6) return out.toExponential(3);
  let s = out.toString();
  return s;
}

const PREFIXES = [
  {e:12,s:'T'},{e:9,s:'G'},{e:6,s:'M'},{e:3,s:'k'},{e:0,s:''},
  {e:-3,s:'m'},{e:-6,s:'µ'},{e:-9,s:'n'},{e:-12,s:'p'}
];
// auto-scale a base-SI value to the most readable prefixed unit
function autoScale(value, baseUnit){
  if (!isValidNum(value)) return { text:'—', value:0, unit:baseUnit };
  if (value === 0) return { text:'0 ' + baseUnit, value:0, unit:baseUnit };
  const abs = Math.abs(value);
  let chosen = PREFIXES[PREFIXES.length-1];
  for (const p of PREFIXES){
    if (abs >= Math.pow(10,p.e)){ chosen = p; break; }
  }
  const scaled = value / Math.pow(10, chosen.e);
  return { text: fmt(scaled,4) + ' ' + chosen.s + baseUnit, value: scaled, unit: chosen.s + baseUnit };
}

const UNIT_MULT = { 'T':1e12,'G':1e9,'M':1e6,'k':1e3,'':1,'m':1e-3,'µ':1e-6,'u':1e-6,'n':1e-9,'p':1e-12 };
function toBase(value, prefix){ return value * (UNIT_MULT[prefix] ?? 1); }

/* ---------- input validation ---------- */
function readNum(input){
  if (!input) return NaN;
  const v = input.value.trim();
  if (v === '') return NaN;
  const n = Number(v);
  return n;
}

function setFieldError(fieldGroup, msg){
  fieldGroup.classList.add('has-error');
  const errEl = fieldGroup.querySelector('.field-error');
  if (errEl) errEl.textContent = msg;
}
function clearFieldError(fieldGroup){
  fieldGroup.classList.remove('has-error');
}


/* =========================================================
   2. DATA — categories & calculator registry
========================================================= */

const CATEGORIES = [
  { id:'basic-electrical', name:'Basic Electrical', desc:"Ohm's Law, power and DC fundamentals.", icon:'bolt' },
  { id:'resistors', name:'Resistors', desc:'Series, parallel, dividers and color codes.', icon:'resistor' },
  { id:'led-diodes', name:'LED & Diodes', desc:'Current-limiting resistors for LEDs and Zener diodes.', icon:'led' },
  { id:'circuit-analysis', name:'Circuit Analysis', desc:'RC / RL time constants and cutoff frequencies.', icon:'circuit' },
  { id:'signals-comm', name:'Signals & Communication', desc:'Frequency, wavelength and decibel calculators.', icon:'wave' },
  { id:'battery-power', name:'Battery & Power', desc:'Runtime, energy and efficiency.', icon:'battery' },
  { id:'converters', name:'Converters', desc:'Convert between common electronics units.', icon:'convert' },
  { id:'formula-reference', name:'Formula Reference', desc:'Searchable library of core electronics formulas.', icon:'book', isFormulaLink:true }
];

// Calculator registry. `render` functions are attached later, once defined,
// via registerRenderer() to keep this list readable.
const CALCULATORS = [
  { id:'ohms-law', name:"Ohm's Law Calculator", category:'basic-electrical', keywords:['voltage','current','resistance','V=IR','ohm'], short:"Solve for voltage, current or resistance.", popular:true },
  { id:'power', name:'Power Calculator', category:'basic-electrical', keywords:['power','watt','P=VI','P=I2R'], short:'Solve for power, voltage, current or resistance.', popular:true },
  { id:'dc-power', name:'DC Power Calculator', category:'basic-electrical', keywords:['power','watt','dc'], short:'Quick P = V × I calculation.' },
  { id:'efficiency', name:'Efficiency Calculator', category:'basic-electrical', keywords:['efficiency','output power','input power'], short:'Efficiency = output / input × 100%.' },

  { id:'voltage-divider', name:'Voltage Divider', category:'resistors', keywords:['vout','vin','r1','r2','divider'], short:'Vout = Vin × R2 / (R1 + R2).', popular:true },
  { id:'current-divider', name:'Current Divider', category:'resistors', keywords:['current','divider','parallel'], short:'Split current between two parallel resistors.' },
  { id:'series-resistor', name:'Series Resistor Calculator', category:'resistors', keywords:['series','resistance','total'], short:'Add any number of resistors in series.' },
  { id:'parallel-resistor', name:'Parallel Resistor Calculator', category:'resistors', keywords:['parallel','resistance','equivalent'], short:'Equivalent resistance of resistors in parallel.' },
  { id:'resistor-color-code', name:'Resistor Color Code', category:'resistors', keywords:['color','band','code','resistor'], short:'4-band color code ↔ resistance, both directions.', popular:true },
  { id:'smd-resistor', name:'SMD Resistor Decoder', category:'resistors', keywords:['smd','3-digit','4-digit','code'], short:'Decode 3-digit and 4-digit SMD resistor codes.' },

  { id:'led-resistor', name:'LED Resistor Calculator', category:'led-diodes', keywords:['led','resistor','forward voltage'], short:'Find the current-limiting resistor for an LED.', popular:true },
  { id:'led-power', name:'LED Power Calculator', category:'led-diodes', keywords:['led','power','watt'], short:'P = V × I for an LED.' },
  { id:'zener-resistor', name:'Zener Resistor Calculator', category:'led-diodes', keywords:['zener','diode','regulator'], short:'Series resistor for a Zener voltage regulator.' },

  { id:'rc-time-constant', name:'RC Time Constant', category:'circuit-analysis', keywords:['rc','tau','capacitor','charge'], short:'τ = R × C, with charge/discharge percentages.' },
  { id:'rl-time-constant', name:'RL Time Constant', category:'circuit-analysis', keywords:['rl','tau','inductor'], short:'τ = L / R.' },
  { id:'rc-cutoff-frequency', name:'RC Cutoff Frequency', category:'circuit-analysis', keywords:['cutoff','filter','fc','rc'], short:'fc = 1 / (2πRC).' },
  { id:'rl-cutoff-frequency', name:'RL Cutoff Frequency', category:'circuit-analysis', keywords:['cutoff','filter','fc','rl'], short:'fc = R / (2πL).' },

  { id:'freq-wavelength', name:'Frequency ↔ Wavelength', category:'signals-comm', keywords:['wavelength','frequency','lambda','rf'], short:'λ = c / f, and the reverse.', popular:true },
  { id:'freq-period', name:'Frequency ↔ Period', category:'signals-comm', keywords:['period','frequency','T=1/f'], short:'T = 1/f and f = 1/T.' },
  { id:'angular-frequency', name:'Angular Frequency', category:'signals-comm', keywords:['omega','angular','2πf'], short:'ω = 2πf.' },
  { id:'decibel', name:'Decibel Calculator', category:'signals-comm', keywords:['db','gain','power ratio','voltage ratio'], short:'Power, voltage and current gain in dB.' },

  { id:'battery-runtime', name:'Battery Runtime', category:'battery-power', keywords:['battery','runtime','mah','ah'], short:'Estimate how long a battery will last under load.', popular:true },
  { id:'battery-energy', name:'Battery Energy', category:'battery-power', keywords:['battery','energy','wh','mah'], short:'Wh = V × Ah, with mAh ↔ Ah conversion.' },

  { id:'unit-converter', name:'Electronics Unit Converter', category:'converters', keywords:['convert','units','prefix','milli','micro'], short:'Convert voltage, current, resistance, capacitance and more.', popular:true }
];

function getCalc(id){ return CALCULATORS.find(c=>c.id===id); }
function calcsInCategory(catId){ return CALCULATORS.filter(c=>c.category===catId); }

/* =========================================================
   3. FORMULA REFERENCE DATA
========================================================= */

const FORMULA_LIBRARY = [
  { cat:"Ohm's Law", items:[
    { name:"Ohm's Law (Voltage)", expr:'V = I × R', vars:'V = voltage (V), I = current (A), R = resistance (Ω)', note:'The foundation of circuit analysis.' },
    { name:"Ohm's Law (Current)", expr:'I = V / R', vars:'I = current (A), V = voltage (V), R = resistance (Ω)' },
    { name:"Ohm's Law (Resistance)", expr:'R = V / I', vars:'R = resistance (Ω), V = voltage (V), I = current (A)' }
  ]},
  { cat:'Power', items:[
    { name:'Power (VI)', expr:'P = V × I', vars:'P = power (W), V = voltage (V), I = current (A)' },
    { name:'Power (I²R)', expr:'P = I² × R', vars:'P = power (W), I = current (A), R = resistance (Ω)' },
    { name:'Power (V²/R)', expr:'P = V² / R', vars:'P = power (W), V = voltage (V), R = resistance (Ω)' },
    { name:'Efficiency', expr:'η = Pout / Pin × 100%', vars:'η = efficiency, Pout/Pin = output/input power' }
  ]},
  { cat:'Resistors', items:[
    { name:'Series resistors', expr:'Rtotal = R1 + R2 + ... + Rn', vars:'Rtotal = total resistance (Ω)' },
    { name:'Parallel resistors (two)', expr:'Req = (R1 × R2) / (R1 + R2)', vars:'Req = equivalent resistance (Ω)' },
    { name:'Parallel resistors (many)', expr:'1/Req = 1/R1 + 1/R2 + ... + 1/Rn', vars:'Req = equivalent resistance (Ω)' },
    { name:'Voltage divider', expr:'Vout = Vin × R2 / (R1 + R2)', vars:'Vin = source voltage, R1/R2 = divider resistors' },
    { name:'Current divider', expr:'I1 = Itotal × R2 / (R1 + R2)', vars:'I1 = current through R1, given two parallel resistors' }
  ]},
  { cat:'Capacitors', items:[
    { name:'Capacitive reactance', expr:'Xc = 1 / (2πfC)', vars:'Xc = reactance (Ω), f = frequency (Hz), C = capacitance (F)' },
    { name:'RC time constant', expr:'τ = R × C', vars:'τ = time constant (s), R = resistance (Ω), C = capacitance (F)' },
    { name:'Capacitor energy', expr:'E = ½CV²', vars:'E = energy (J), C = capacitance (F), V = voltage (V)' }
  ]},
  { cat:'Inductors', items:[
    { name:'Inductive reactance', expr:'XL = 2πfL', vars:'XL = reactance (Ω), f = frequency (Hz), L = inductance (H)' },
    { name:'RL time constant', expr:'τ = L / R', vars:'τ = time constant (s), L = inductance (H), R = resistance (Ω)' },
    { name:'Inductor energy', expr:'E = ½LI²', vars:'E = energy (J), L = inductance (H), I = current (A)' }
  ]},
  { cat:'RC Circuits', items:[
    { name:'RC cutoff frequency', expr:'fc = 1 / (2πRC)', vars:'fc = -3 dB cutoff frequency (Hz)' },
    { name:'RC charge at 1τ', expr:'63.2% of final value', vars:'After one time constant during charging.' },
    { name:'RC charge at 5τ', expr:'99.3% of final value', vars:'Considered "fully charged" in practice.' }
  ]},
  { cat:'RL Circuits', items:[
    { name:'RL cutoff frequency', expr:'fc = R / (2πL)', vars:'fc = -3 dB cutoff frequency (Hz)' }
  ]},
  { cat:'AC Circuits', items:[
    { name:'Impedance (RC series)', expr:'Z = √(R² + Xc²)', vars:'Z = impedance magnitude (Ω)' },
    { name:'Impedance (RL series)', expr:'Z = √(R² + XL²)', vars:'Z = impedance magnitude (Ω)' },
    { name:'Resonant frequency', expr:'f0 = 1 / (2π√(LC))', vars:'f0 = resonant frequency of an LC circuit (Hz)' }
  ]},
  { cat:'Signals', items:[
    { name:'Frequency ↔ period', expr:'T = 1/f  and  f = 1/T', vars:'T = period (s), f = frequency (Hz)' },
    { name:'Angular frequency', expr:'ω = 2πf', vars:'ω = angular frequency (rad/s), f = frequency (Hz)' }
  ]},
  { cat:'Communication', items:[
    { name:'Wavelength', expr:'λ = c / f', vars:'λ = wavelength (m), c = 299,792,458 m/s, f = frequency (Hz)' }
  ]},
  { cat:'Decibels', items:[
    { name:'Power gain', expr:'dB = 10 log10(P2 / P1)', vars:'Used when comparing two power levels.' },
    { name:'Voltage gain', expr:'dB = 20 log10(V2 / V1)', vars:'Used when comparing two voltage levels.' },
    { name:'Current gain', expr:'dB = 20 log10(I2 / I1)', vars:'Used when comparing two current levels.' }
  ]},
  { cat:'Diodes', items:[
    { name:'LED series resistor', expr:'R = (Vs − Vf) / I', vars:'Vs = supply, Vf = LED forward voltage, I = LED current' },
    { name:'Zener series resistor', expr:'R = (Vs − Vz) / Iz', vars:'Vs = supply, Vz = Zener voltage, Iz = Zener current' }
  ]},
  { cat:'Transistors', items:[
    { name:'DC current gain', expr:'β (hFE) = Ic / Ib', vars:'Ic = collector current, Ib = base current' },
    { name:'Emitter current', expr:'Ie = Ic + Ib', vars:'Approximately Ie ≈ Ic for high β' }
  ]},
  { cat:'Basic Electronics', items:[
    { name:'Charge', expr:'Q = I × t', vars:'Q = charge (C), I = current (A), t = time (s)' },
    { name:'Battery energy', expr:'Wh = V × Ah', vars:'Wh = watt-hours, V = voltage, Ah = amp-hours' }
  ]}
];


/* =========================================================
   4. ICONS (inline SVG, no external assets)
========================================================= */

const ICONS = {
  bolt:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke-linejoin="round"/></svg>',
  resistor:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12h3l1.5-4 3 8 3-8 3 8 1.5-4H22" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  led:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v3M8 21h8M9 21v-3.5a5 5 0 116 0V21" /><path d="M4 8l3 1M20 8l-3 1"/></svg>',
  circuit:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v4h8v4M8 6h10v6"/></svg>',
  wave:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" /></svg>',
  battery:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4" stroke-linecap="round"/><path d="M6 10v4M10 10v4" stroke-linecap="round"/></svg>',
  convert:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7h13l-3-3M17 17H4l3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  book:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5v-17z"/><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/></svg>'
};

/* =========================================================
   5. ROUTER
========================================================= */

const VIEWS = ['home','category','calc','favorites','history','formulas','notfound'];

function showView(name){
  VIEWS.forEach(v=>{
    const node = $('#view-'+v);
    if (node) node.classList.toggle('active', v===name);
  });
  window.scrollTo({ top:0, behavior:'auto' });
}

function parseHash(){
  const hash = location.hash.replace(/^#/, '') || '/home';
  const parts = hash.split('/').filter(Boolean);
  return parts; // e.g. ['category','resistors'] or ['calc','ohms-law']
}

function router(){
  const parts = parseHash();
  updateActiveNav(parts);
  closeMobileMenu();
  closeCategoriesPanel();

  if (parts.length === 0 || parts[0] === 'home'){
    renderHome(); showView('home'); return;
  }
  if (parts[0] === 'category' && parts[1]){
    const cat = CATEGORIES.find(c=>c.id===parts[1]);
    if (!cat){ showView('notfound'); return; }
    renderCategory(cat); showView('category'); return;
  }
  if (parts[0] === 'calc' && parts[1]){
    const calc = getCalc(parts[1]);
    if (!calc || !calc.render){ showView('notfound'); return; }
    renderCalcShell(calc); showView('calc'); return;
  }
  if (parts[0] === 'favorites'){ renderFavorites(); showView('favorites'); return; }
  if (parts[0] === 'history'){ renderHistory(); showView('history'); return; }
  if (parts[0] === 'formulas'){ renderFormulas(); showView('formulas'); return; }
  showView('notfound');
}

function updateActiveNav(parts){
  $$('.nav-link[data-route]').forEach(a=>{
    a.classList.toggle('active', ('/'+parts.join('/')).indexOf(a.dataset.route) === 0 && parts[0]===a.dataset.route.replace('/',''));
  });
}

function goTo(hash){ location.hash = hash; }

/* =========================================================
   6. SHARED UI BUILDERS
========================================================= */

function calcCardEl(calc, opts){
  opts = opts || {};
  const fav = isFavorite(calc.id);
  const card = el('div', { class:'calc-card' }, [
    el('div', { class:'calc-card-top' }, [
      el('h4', null, calc.name),
      el('button', {
        class:'fav-star' + (fav ? ' active' : ''),
        'aria-label': fav ? 'Remove from favorites' : 'Add to favorites',
        onclick:(e)=>{ e.preventDefault(); e.stopPropagation(); const now=toggleFavorite(calc.id); e.currentTarget.classList.toggle('active', now); e.currentTarget.setAttribute('aria-label', now?'Remove from favorites':'Add to favorites'); toast(now?'Added to favorites':'Removed from favorites'); if (opts.onFavToggle) opts.onFavToggle(); }
      }, fav ? '★' : '☆')
    ]),
    el('p', null, calc.short || '')
  ]);
  card.addEventListener('click', ()=> goTo('#/calc/'+calc.id));
  card.setAttribute('tabindex','0');
  card.setAttribute('role','button');
  card.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); goTo('#/calc/'+calc.id); } });
  return card;
}

function categoryCardEl(cat){
  const count = cat.isFormulaLink ? FORMULA_LIBRARY.reduce((a,g)=>a+g.items.length,0) : calcsInCategory(cat.id).length;
  const card = el('div', { class:'category-card' }, [
    el('div', { class:'cat-icon', html: ICONS[cat.icon] || '' }),
    el('h3', null, cat.name),
    el('p', null, cat.desc),
    el('div', { class:'cat-count' }, cat.isFormulaLink ? (count+' formulas') : (count+' calculators'))
  ]);
  card.addEventListener('click', ()=> goTo(cat.isFormulaLink ? '#/formulas' : '#/category/'+cat.id));
  card.setAttribute('tabindex','0'); card.setAttribute('role','button');
  card.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); card.click(); } });
  return card;
}

/* =========================================================
   7. HOME VIEW
========================================================= */

function renderHome(){
  // stats strip
  const stats = $('#statsStrip');
  stats.innerHTML = '';
  const hist = getHistory();
  const favs = getFavorites();
  [
    { num: CALCULATORS.length, label:'Calculators' },
    { num: CATEGORIES.length-1, label:'Categories' },
    { num: hist.length, label:'Calculations run' },
    { num: favs.length, label:'Favorites saved' }
  ].forEach(s=> stats.appendChild(el('div', { class:'stat-card' }, [
    el('div', { class:'stat-num' }, String(s.num)),
    el('div', { class:'stat-label' }, s.label)
  ])));

  const grid = $('#categoryGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(c=> grid.appendChild(categoryCardEl(c)));

  const favSection = $('#favoritesHomeSection');
  const favRow = $('#favoritesHomeRow');
  favRow.innerHTML = '';
  if (favs.length){
    favSection.hidden = false;
    favs.slice(0,8).forEach(id=>{ const c=getCalc(id); if(c) favRow.appendChild(calcCardEl(c,{onFavToggle:renderHome})); });
  } else favSection.hidden = true;

  const recentSection = $('#recentHomeSection');
  const recentRow = $('#recentHomeRow');
  recentRow.innerHTML = '';
  const recentIds = [...new Set(hist.map(h=>h.calcId))].slice(0,8);
  if (recentIds.length){
    recentSection.hidden = false;
    recentIds.forEach(id=>{ const c=getCalc(id); if(c) recentRow.appendChild(calcCardEl(c)); });
  } else recentSection.hidden = true;

  const popRow = $('#popularHomeRow');
  popRow.innerHTML = '';
  CALCULATORS.filter(c=>c.popular).forEach(c=> popRow.appendChild(calcCardEl(c)));
}

/* =========================================================
   8. CATEGORY VIEW
========================================================= */

function renderCategory(cat){
  $('#categoryTitle').textContent = cat.name;
  $('#categoryDesc').textContent = cat.desc;
  const grid = $('#categoryCalcGrid');
  grid.innerHTML = '';
  calcsInCategory(cat.id).forEach(c=> grid.appendChild(calcCardEl(c)));
}

/* =========================================================
   9. FAVORITES VIEW
========================================================= */

function renderFavorites(){
  const favs = getFavorites();
  const grid = $('#favoritesGrid');
  grid.innerHTML = '';
  $('#favoritesEmpty').hidden = favs.length !== 0;
  favs.forEach(id=>{ const c=getCalc(id); if(c) grid.appendChild(calcCardEl(c,{onFavToggle:renderFavorites})); });
}

/* =========================================================
   10. HISTORY VIEW
========================================================= */

function renderHistory(){
  const hist = getHistory();
  const list = $('#historyList');
  list.innerHTML = '';
  $('#historyEmpty').hidden = hist.length !== 0;
  hist.forEach((h,idx)=>{
    const item = el('div', { class:'history-item' }, [
      el('div', { class:'hi-main' }, [
        el('div', { class:'hi-name' }, h.calcName),
        el('div', { class:'hi-detail' }, h.summary)
      ]),
      el('div', { class:'hi-time' }, new Date(h.time).toLocaleString()),
      el('button', { class:'hi-del', 'aria-label':'Delete this entry', onclick:()=>{ deleteHistoryItem(idx); renderHistory(); } }, '✕')
    ]);
    list.appendChild(item);
  });
}

$('#clearHistoryBtn') && $('#clearHistoryBtn').addEventListener('click', ()=>{
  if (getHistory().length === 0) return;
  if (confirm('Clear all calculation history? This cannot be undone.')){
    clearHistory(); renderHistory(); toast('History cleared');
  }
});

/* =========================================================
   11. FORMULA REFERENCE VIEW
========================================================= */

function renderFormulas(query){
  const container = $('#formulaCategories');
  container.innerHTML = '';
  const q = (query || '').trim().toLowerCase();
  let totalShown = 0;

  FORMULA_LIBRARY.forEach(group=>{
    const items = q ? group.items.filter(it=>
      it.name.toLowerCase().includes(q) || it.expr.toLowerCase().includes(q) ||
      it.vars.toLowerCase().includes(q) || group.cat.toLowerCase().includes(q)
    ) : group.items;
    if (!items.length) return;
    totalShown += items.length;
    const groupEl = el('div', { class:'formula-cat-group' }, [
      el('h2', null, group.cat),
      el('div', { class:'formula-cards' }, items.map(it=> el('div', { class:'formula-card' }, [
        el('div', { class:'f-name' }, it.name),
        el('div', { class:'f-expr' }, it.expr),
        el('div', { class:'f-vars' }, it.vars),
        it.note ? el('div', { class:'f-note' }, it.note) : null
      ])))
    ]);
    container.appendChild(groupEl);
  });

  if (totalShown === 0){
    container.appendChild(el('p', { class:'formula-no-results' }, 'No formulas match "'+query+'". Try a different term.'));
  }
}

const formulaSearchInput = $('#formulaSearchInput');
if (formulaSearchInput) formulaSearchInput.addEventListener('input', (e)=> renderFormulas(e.target.value));


/* =========================================================
   12. CALCULATOR SHELL (generic host for every calculator)
========================================================= */

function renderCalcShell(calc){
  const shell = $('#calcShell');
  shell.innerHTML = '';

  const cat = CATEGORIES.find(c=>c.id===calc.category);
  const header = el('div', { class:'calc-header' }, [
    el('div', { class:'breadcrumb' }, [
      el('a', { href:'#/home' }, 'Home'), ' / ',
      cat ? el('a', { href:'#/category/'+cat.id }, cat.name) : null, cat ? ' / ' : null,
      el('span', null, calc.name)
    ]),
    el('div', { class:'calc-header-top' }, [
      el('h1', null, calc.name),
      el('button', {
        class:'icon-toggle' + (isFavorite(calc.id) ? ' active' : ''),
        id:'calcFavBtn',
        'aria-label':'Toggle favorite',
        onclick:(e)=>{ const now=toggleFavorite(calc.id); e.currentTarget.classList.toggle('active', now); toast(now?'Added to favorites':'Removed from favorites'); }
      }, '★')
    ]),
    el('p', { class:'calc-explain' }, calc.short || '')
  ]);
  shell.appendChild(header);

  const body = el('div', { class:'calc-body' });
  shell.appendChild(body);

  try{
    calc.render(body, calc);
  }catch(err){
    console.error('Calculator render error for', calc.id, err);
    body.appendChild(el('div', { class:'result-warning' }, 'This calculator failed to load. Please refresh the page.'));
  }
}

/* ---------- shared field builders ---------- */

function fieldGroup(opts){
  // opts: {id, label, placeholder, help, unit(optional select), unitOptions, type}
  const group = el('div', { class:'field-group', 'data-field':opts.id });
  group.appendChild(el('label', { for:opts.id }, opts.label));
  let inputRow;
  if (opts.unitOptions){
    const input = el('input', { type:'number', id:opts.id, placeholder:opts.placeholder||'', step:'any', inputmode:'decimal' });
    const select = el('select', { id:opts.id+'_unit', 'aria-label':opts.label+' unit' },
      opts.unitOptions.map(u=> el('option', { value:u.value }, u.label))
    );
    if (opts.defaultUnit) select.value = opts.defaultUnit;
    select.className = 'unit-select';
    inputRow = el('div', { class:'input-unit-wrap' }, [input, select]);
  } else {
    inputRow = el('input', { type:'number', id:opts.id, placeholder:opts.placeholder||'', step:'any', inputmode:'decimal' });
  }
  group.appendChild(inputRow);
  if (opts.help) group.appendChild(el('div', { class:'field-help' }, opts.help));
  group.appendChild(el('div', { class:'field-error' }, ''));
  return group;
}

function getUnitValue(id){
  const input = $('#'+id);
  const unitSel = $('#'+id+'_unit');
  const raw = readNum(input);
  const mult = unitSel ? (UNIT_MULT[unitSel.value] ?? 1) : 1;
  return { raw, base: raw * mult, group: input.closest('.field-group') };
}

// Validate a set of {raw, group} entries; returns true if all valid (fills field errors)
function validateFields(fields, opts){
  opts = opts || {};
  let ok = true;
  fields.forEach(f=>{
    clearFieldError(f.group);
    if (isNaN(f.raw) || f.raw === undefined){
      setFieldError(f.group, 'Enter a value.'); ok = false; return;
    }
    if (!opts.allowNegative && f.raw < 0){
      setFieldError(f.group, 'Value cannot be negative.'); ok = false; return;
    }
    if (opts.mustBePositive && f.raw <= 0){
      setFieldError(f.group, 'Value must be greater than zero.'); ok = false; return;
    }
  });
  return ok;
}

function resultPanel(){
  return el('div', { class:'result-panel', id:'resultPanel' });
}

function showResult(panel, data){
  // data: {formula, calc, resultValue, resultUnit, note, warning, copyText}
  panel.innerHTML = '';
  panel.classList.add('show');
  if (data.formula) panel.appendChild(el('div', { class:'result-block' }, [
    el('div', { class:'result-label' }, 'Formula'),
    el('div', { class:'result-formula' }, data.formula)
  ]));
  if (data.calcText) panel.appendChild(el('div', { class:'result-block' }, [
    el('div', { class:'result-label' }, 'Calculation'),
    el('div', { class:'result-calc' }, data.calcText)
  ]));
  panel.appendChild(el('div', { class:'result-block' }, [
    el('div', { class:'result-label' }, 'Result'),
    el('div', { class:'result-final' }, [
      el('div', { class:'rf-value' }, [data.resultMain, data.resultUnit ? el('small', null, ' '+data.resultUnit) : null]),
      el('button', { class:'copy-btn', onclick:()=>copyText(data.copyText || (data.resultMain+' '+(data.resultUnit||''))) }, 'Copy result')
    ])
  ]));
  if (data.note) panel.appendChild(el('div', { class:'result-note' }, data.note));
  if (data.warning) panel.appendChild(el('div', { class:'result-warning' }, data.warning));
}

function hideResult(panel){
  panel.classList.remove('show');
  panel.innerHTML = '';
}

function saveCalcHistory(calc, summary){
  addHistory({ calcId:calc.id, calcName:calc.name, summary:summary });
}

function buttonRow(onCalc, onReset){
  return el('div', { class:'btn-row' }, [
    el('button', { class:'btn btn-primary', type:'button', onclick:onCalc }, 'Calculate'),
    el('button', { class:'btn btn-secondary', type:'button', onclick:onReset }, 'Reset')
  ]);
}


/* =========================================================
   13. CALCULATOR IMPLEMENTATIONS
========================================================= */

function registerRenderer(id, fn){ const c = getCalc(id); if (c) c.render = fn; }

const UNITS_V = [{value:'',label:'V'},{value:'m',label:'mV'},{value:'k',label:'kV'}];
const UNITS_I = [{value:'',label:'A'},{value:'m',label:'mA'},{value:'µ',label:'µA'}];
const UNITS_R = [{value:'',label:'Ω'},{value:'k',label:'kΩ'},{value:'M',label:'MΩ'}];
const UNITS_P = [{value:'',label:'W'},{value:'m',label:'mW'},{value:'k',label:'kW'}];
const UNITS_C = [{value:'',label:'F'},{value:'m',label:'mF'},{value:'µ',label:'µF'},{value:'n',label:'nF'},{value:'p',label:'pF'}];
const UNITS_L = [{value:'',label:'H'},{value:'m',label:'mH'},{value:'µ',label:'µH'},{value:'n',label:'nH'}];
const UNITS_F = [{value:'',label:'Hz'},{value:'k',label:'kHz'},{value:'M',label:'MHz'},{value:'G',label:'GHz'}];

function unitLabel(sel){ const s=$('#'+sel); return s ? (s.options[s.selectedIndex].text) : ''; }

/* ---------- 1. OHM'S LAW ---------- */
registerRenderer('ohms-law', function(body){
  const targets = [
    { key:'V', label:'Voltage (V)' },
    { key:'I', label:'Current (I)' },
    { key:'R', label:'Resistance (R)' }
  ];
  let target = 'R';

  const panel = el('div', { class:'calc-card-panel' });
  const chipRow = el('div', { class:'radio-group' }, targets.map(t=>
    el('button', { type:'button', class:'radio-chip'+(t.key===target?' active':''), 'data-key':t.key }, 'Solve for '+t.label)
  ));
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'What do you want to calculate?'), chipRow ]));

  const fieldsWrap = el('div', null);
  panel.appendChild(fieldsWrap);

  const result = resultPanel();

  function fieldsFor(t){
    if (t==='V') return [ fieldGroup({id:'ol_i', label:'Current', unitOptions:UNITS_I, defaultUnit:''}), fieldGroup({id:'ol_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:''}) ];
    if (t==='I') return [ fieldGroup({id:'ol_v', label:'Voltage', unitOptions:UNITS_V, defaultUnit:''}), fieldGroup({id:'ol_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:''}) ];
    return [ fieldGroup({id:'ol_v', label:'Voltage', unitOptions:UNITS_V, defaultUnit:''}), fieldGroup({id:'ol_i', label:'Current', unitOptions:UNITS_I, defaultUnit:''}) ];
  }

  function rebuildFields(){
    fieldsWrap.innerHTML = '';
    fieldsFor(target).forEach(f=>fieldsWrap.appendChild(f));
    hideResult(result);
  }
  rebuildFields();

  chipRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    target = btn.dataset.key;
    $$('.radio-chip', chipRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuildFields();
  });

  function calc(){
    let ok, V,I,R, formula, calcText, resultMain, resultUnit, unit;
    if (target === 'V'){
      const i = getUnitValue('ol_i'), r = getUnitValue('ol_r');
      ok = validateFields([i,r], { mustBePositive:true });
      if (!ok) return;
      const v = i.base * r.base;
      const sc = autoScale(v, 'V');
      showResult(result, {
        formula:'V = I × R', calcText:'V = '+fmt(i.raw)+' '+unitLabel('ol_i_unit')+' × '+fmt(r.raw)+' '+unitLabel('ol_r_unit'),
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Voltage across the resistor given current and resistance.'
      });
      saveCalcHistory(getCalc('ohms-law'), 'V = I×R → '+sc.text);
    } else if (target === 'I'){
      const v = getUnitValue('ol_v'), r = getUnitValue('ol_r');
      ok = validateFields([v,r]);
      if (!ok) return;
      if (r.base === 0){ setFieldError(r.group,'Resistance cannot be zero.'); return; }
      const i = v.base / r.base;
      const sc = autoScale(i, 'A');
      showResult(result, {
        formula:'I = V / R', calcText:'I = '+fmt(v.raw)+' '+unitLabel('ol_v_unit')+' / '+fmt(r.raw)+' '+unitLabel('ol_r_unit'),
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Current flowing through the resistance.'
      });
      saveCalcHistory(getCalc('ohms-law'), 'I = V/R → '+sc.text);
    } else {
      const v = getUnitValue('ol_v'), i = getUnitValue('ol_i');
      ok = validateFields([v,i]);
      if (!ok) return;
      if (i.base === 0){ setFieldError(i.group,'Current cannot be zero.'); return; }
      const r = v.base / i.base;
      const sc = autoScale(r, 'Ω');
      showResult(result, {
        formula:'R = V / I', calcText:'R = '+fmt(v.raw)+' '+unitLabel('ol_v_unit')+' / '+fmt(i.raw)+' '+unitLabel('ol_i_unit'),
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Resistance required to draw this current at this voltage.'
      });
      saveCalcHistory(getCalc('ohms-law'), 'R = V/I → '+sc.text);
    }
  }
  function reset(){ $$('input', fieldsWrap).forEach(i=>i.value=''); $$('.field-group', fieldsWrap).forEach(clearFieldError); hideResult(result); }

  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel);
  body.appendChild(result);
});

/* ---------- 2. POWER CALCULATOR ---------- */
registerRenderer('power', function(body){
  const POWER_VARIANTS = {
    P: [ {keys:['V','I'], formula:'P = V × I', f:(a,b)=>a*b}, {keys:['I','R'], formula:'P = I² × R', f:(a,b)=>a*a*b}, {keys:['V','R'], formula:'P = V² / R', f:(a,b)=>a*a/b} ],
    V: [ {keys:['P','I'], formula:'V = P / I', f:(a,b)=>a/b}, {keys:['I','R'], formula:'V = I × R', f:(a,b)=>a*b}, {keys:['P','R'], formula:'V = √(P × R)', f:(a,b)=>Math.sqrt(a*b)} ],
    I: [ {keys:['P','V'], formula:'I = P / V', f:(a,b)=>a/b}, {keys:['V','R'], formula:'I = V / R', f:(a,b)=>a/b}, {keys:['P','R'], formula:'I = √(P / R)', f:(a,b)=>Math.sqrt(a/b)} ],
    R: [ {keys:['V','I'], formula:'R = V / I', f:(a,b)=>a/b}, {keys:['V','P'], formula:'R = V² / P', f:(a,b)=>a*a/b}, {keys:['I','P'], formula:'R = P / I²', f:(a,b)=>b/(a*a)} ]
  };
  const META = {
    P:{name:'Power', unit:'W', opts:UNITS_P}, V:{name:'Voltage', unit:'V', opts:UNITS_V},
    I:{name:'Current', unit:'A', opts:UNITS_I}, R:{name:'Resistance', unit:'Ω', opts:UNITS_R}
  };
  let target = 'P';
  let variantIdx = 0;

  const panel = el('div', { class:'calc-card-panel' });
  const targetRow = el('div', { class:'radio-group' }, Object.keys(META).map(k=>
    el('button', { type:'button', class:'radio-chip'+(k===target?' active':''), 'data-key':k }, 'Solve for '+META[k].name)
  ));
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'What do you want to calculate?'), targetRow ]));

  const variantRow = el('div', { class:'radio-group' });
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'Using which known values?'), variantRow ]));

  const fieldsWrap = el('div', null);
  panel.appendChild(fieldsWrap);
  const result = resultPanel();

  function rebuildVariants(){
    variantRow.innerHTML = '';
    POWER_VARIANTS[target].forEach((v,i)=>{
      variantRow.appendChild(el('button', { type:'button', class:'radio-chip'+(i===variantIdx?' active':''), 'data-idx':i }, v.keys.map(k=>META[k].name).join(' & ')));
    });
  }
  function rebuildFields(){
    fieldsWrap.innerHTML = '';
    const variant = POWER_VARIANTS[target][variantIdx];
    variant.keys.forEach(k=> fieldsWrap.appendChild(fieldGroup({ id:'pw_'+k, label:META[k].name, unitOptions:META[k].opts, defaultUnit:'' })));
    hideResult(result);
  }
  rebuildVariants(); rebuildFields();

  targetRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    target = btn.dataset.key; variantIdx = 0;
    $$('.radio-chip', targetRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuildVariants(); rebuildFields();
  });
  variantRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    variantIdx = Number(btn.dataset.idx);
    $$('.radio-chip', variantRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuildFields();
  });

  function calc(){
    const variant = POWER_VARIANTS[target][variantIdx];
    const vals = variant.keys.map(k=> getUnitValue('pw_'+k));
    const ok = validateFields(vals, { mustBePositive:true });
    if (!ok) return;
    if (variant.keys.length===2 && vals[1].base===0 && variant.formula.includes('/')){ setFieldError(vals[1].group,'Value cannot be zero.'); return; }
    const raw = variant.f(vals[0].base, vals[1].base);
    if (!isValidNum(raw) || raw < 0){ toast('Invalid combination of values.'); return; }
    const sc = autoScale(raw, META[target].unit);
    const calcText = variant.formula.split('=')[0].trim()+' = '+vals.map((v,i)=>fmt(v.raw)+' '+unitLabel('pw_'+variant.keys[i]+'_unit')).join(variant.formula.includes('²')&&variant.keys.length===1?'':' , ');
    showResult(result, {
      formula: variant.formula,
      calcText: variant.keys.map((k,i)=>k+' = '+fmt(vals[i].raw)+' '+unitLabel('pw_'+k+'_unit')).join(', '),
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
      note: META[target].name+' calculated from '+variant.keys.map(k=>META[k].name).join(' and ')+'.'
    });
    saveCalcHistory(getCalc('power'), META[target].name+' → '+sc.text);
  }
  function reset(){ $$('input', fieldsWrap).forEach(i=>i.value=''); $$('.field-group', fieldsWrap).forEach(clearFieldError); hideResult(result); }

  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel);
  body.appendChild(result);
});

/* ---------- 3. DC POWER ---------- */
registerRenderer('dc-power', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fv = fieldGroup({ id:'dp_v', label:'Voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fi = fieldGroup({ id:'dp_i', label:'Current', unitOptions:UNITS_I, defaultUnit:'' });
  panel.appendChild(fv); panel.appendChild(fi);
  const result = resultPanel();
  function calc(){
    const v = getUnitValue('dp_v'), i = getUnitValue('dp_i');
    if (!validateFields([v,i], { mustBePositive:true })) return;
    const p = v.base * i.base;
    const sc = autoScale(p, 'W');
    showResult(result, {
      formula:'P = V × I', calcText:'P = '+fmt(v.raw)+' '+unitLabel('dp_v_unit')+' × '+fmt(i.raw)+' '+unitLabel('dp_i_unit'),
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
    });
    saveCalcHistory(getCalc('dc-power'), 'P → '+sc.text);
  }
  function reset(){ [fv,fi].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 4. EFFICIENCY ---------- */
registerRenderer('efficiency', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fout = fieldGroup({ id:'ef_out', label:'Output power', unitOptions:UNITS_P, defaultUnit:'' });
  const fin = fieldGroup({ id:'ef_in', label:'Input power', unitOptions:UNITS_P, defaultUnit:'' });
  panel.appendChild(fout); panel.appendChild(fin);
  const result = resultPanel();
  function calc(){
    const out = getUnitValue('ef_out'), inp = getUnitValue('ef_in');
    if (!validateFields([out,inp], { mustBePositive:true })) return;
    if (out.base > inp.base){ toast('Output power cannot exceed input power.'); }
    const eff = (out.base / inp.base) * 100;
    showResult(result, {
      formula:'η = Pout / Pin × 100%',
      calcText:'η = '+fmt(out.raw)+' '+unitLabel('ef_out_unit')+' / '+fmt(inp.raw)+' '+unitLabel('ef_in_unit')+' × 100',
      resultMain: fmt(eff,4), resultUnit:'%', copyText: fmt(eff,4)+'%',
      note: eff>100 ? undefined : 'Losses: '+fmt(100-eff,4)+'% dissipated as heat or other losses.',
      warning: eff>100 ? 'Output exceeds input — check your values. Efficiency cannot physically exceed 100%.' : undefined
    });
    saveCalcHistory(getCalc('efficiency'), 'η → '+fmt(eff,4)+'%');
  }
  function reset(){ [fout,fin].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});


/* ---------- 5. VOLTAGE DIVIDER ---------- */
registerRenderer('voltage-divider', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fvin = fieldGroup({ id:'vd_vin', label:'Vin (supply voltage)', unitOptions:UNITS_V, defaultUnit:'' });
  const fr1 = fieldGroup({ id:'vd_r1', label:'R1', unitOptions:UNITS_R, defaultUnit:'' });
  const fr2 = fieldGroup({ id:'vd_r2', label:'R2', unitOptions:UNITS_R, defaultUnit:'' });
  panel.appendChild(fvin);
  panel.appendChild(el('div', { class:'field-row' }, [fr1, fr2]));

  // simple SVG diagram
  const diagram = el('div', { class:'resistor-visual' }, [ el('div', { class:'resistor-svg-wrap', html:
    '<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">'+
    '<line x1="100" y1="6" x2="100" y2="30" stroke="var(--olive-soft)" stroke-width="2"/>'+
    '<rect x="80" y="30" width="40" height="34" rx="4" fill="none" stroke="var(--olive-bright)" stroke-width="2"/>'+
    '<text x="128" y="52" fill="var(--text-secondary)" font-size="11" font-family="monospace">R1</text>'+
    '<line x1="100" y1="64" x2="100" y2="76" stroke="var(--olive-soft)" stroke-width="2"/>'+
    '<circle cx="100" cy="76" r="3" fill="var(--olive-bright)"/>'+
    '<line x1="100" y1="76" x2="160" y2="76" stroke="var(--olive-soft)" stroke-width="2" stroke-dasharray="4 3"/>'+
    '<text x="164" y="80" fill="var(--olive-bright)" font-size="11" font-family="monospace">Vout</text>'+
    '<rect x="80" y="76" width="40" height="34" rx="4" fill="none" stroke="var(--olive-bright)" stroke-width="2"/>'+
    '<text x="128" y="98" fill="var(--text-secondary)" font-size="11" font-family="monospace">R2</text>'+
    '<line x1="100" y1="110" x2="100" y2="130" stroke="var(--olive-soft)" stroke-width="2"/>'+
    '<line x1="80" y1="130" x2="120" y2="130" stroke="var(--olive-soft)" stroke-width="2"/>'+
    '<line x1="86" y1="136" x2="114" y2="136" stroke="var(--olive-soft)" stroke-width="1.4"/>'+
    '</svg>' }) ]);
  panel.appendChild(diagram);

  const result = resultPanel();
  function calc(){
    const vin = getUnitValue('vd_vin'), r1 = getUnitValue('vd_r1'), r2 = getUnitValue('vd_r2');
    if (!validateFields([vin,r1,r2], { mustBePositive:true })) return;
    if (r1.base + r2.base === 0){ toast('R1 + R2 cannot be zero.'); return; }
    const vout = vin.base * r2.base / (r1.base + r2.base);
    const sc = autoScale(vout, 'V');
    showResult(result, {
      formula:'Vout = Vin × R2 / (R1 + R2)',
      calcText:'Vout = '+fmt(vin.raw)+' × '+fmt(r2.raw)+' / ('+fmt(r1.raw)+' + '+fmt(r2.raw)+')',
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
      note:'Assumes no load current is drawn from the Vout node (ideal divider).'
    });
    saveCalcHistory(getCalc('voltage-divider'), 'Vout → '+sc.text);
  }
  function reset(){ [fvin,fr1,fr2].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 6. CURRENT DIVIDER ---------- */
registerRenderer('current-divider', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fit = fieldGroup({ id:'cd_it', label:'Total current', unitOptions:UNITS_I, defaultUnit:'' });
  const fr1 = fieldGroup({ id:'cd_r1', label:'R1', unitOptions:UNITS_R, defaultUnit:'' });
  const fr2 = fieldGroup({ id:'cd_r2', label:'R2', unitOptions:UNITS_R, defaultUnit:'' });
  panel.appendChild(fit);
  panel.appendChild(el('div', { class:'field-row' }, [fr1, fr2]));
  const result = resultPanel();
  function calc(){
    const it = getUnitValue('cd_it'), r1 = getUnitValue('cd_r1'), r2 = getUnitValue('cd_r2');
    if (!validateFields([it,r1,r2], { mustBePositive:true })) return;
    if (r1.base + r2.base === 0){ toast('R1 + R2 cannot be zero.'); return; }
    const i1 = it.base * r2.base / (r1.base + r2.base);
    const i2 = it.base * r1.base / (r1.base + r2.base);
    const sc1 = autoScale(i1, 'A'), sc2 = autoScale(i2, 'A');
    result.innerHTML = ''; result.classList.add('show');
    result.appendChild(el('div', { class:'result-block' }, [
      el('div', { class:'result-label' }, 'Formulas'),
      el('div', { class:'result-formula' }, 'I1 = Itotal × R2 / (R1 + R2)   ·   I2 = Itotal × R1 / (R1 + R2)')
    ]));
    result.appendChild(el('div', { class:'result-block' }, [
      el('div', { class:'result-label' }, 'Current through R1'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(sc1.value), el('small', null, ' '+sc1.unit)]),
        el('button', { class:'copy-btn', onclick:()=>copyText(sc1.text) }, 'Copy') ])
    ]));
    result.appendChild(el('div', { class:'result-block' }, [
      el('div', { class:'result-label' }, 'Current through R2'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(sc2.value), el('small', null, ' '+sc2.unit)]),
        el('button', { class:'copy-btn', onclick:()=>copyText(sc2.text) }, 'Copy') ])
    ]));
    result.appendChild(el('div', { class:'result-note' }, 'Note: more current flows through the smaller resistor.'));
    saveCalcHistory(getCalc('current-divider'), 'I1 → '+sc1.text+', I2 → '+sc2.text);
  }
  function reset(){ [fit,fr1,fr2].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 7 & helpers: dynamic resistor list (series/parallel) ---------- */
function dynamicResistorCalc(body, opts){
  // opts: {idPrefix, title, compute(valuesInBase)->{result}, formula, calcTextFn}
  const panel = el('div', { class:'calc-card-panel' });
  const list = el('div', { class:'dyn-list', id:opts.idPrefix+'_list' });
  let count = 0;

  function addRow(value){
    count++;
    const rowId = opts.idPrefix+'_r'+count;
    const row = el('div', { class:'dyn-row', 'data-row':rowId }, [
      el('span', { class:'muted small', style:'min-width:44px;font-family:var(--font-mono);' }, 'R'+count),
      el('input', { type:'number', id:rowId, placeholder:'Resistance', step:'any', value:value||'' }),
      el('select', { id:rowId+'_unit', class:'unit-select' }, UNITS_R.map(u=>el('option', { value:u.value }, u.label))),
      el('button', { class:'dyn-remove', type:'button', 'aria-label':'Remove resistor', onclick:()=>{ row.remove(); renumber(); } }, '✕')
    ]);
    list.appendChild(row);
  }
  function renumber(){
    $$('.dyn-row', list).forEach((row,idx)=>{ row.firstChild.textContent = 'R'+(idx+1); });
  }
  addRow(); addRow();

  const addBtn = el('button', { class:'btn btn-outline btn-sm', type:'button', onclick:()=>addRow() }, '+ Add resistor');
  panel.appendChild(list);
  panel.appendChild(addBtn);

  const result = resultPanel();

  function calc(){
    const rows = $$('.dyn-row', list);
    if (rows.length < 1){ toast('Add at least one resistor.'); return; }
    const values = [];
    let ok = true;
    rows.forEach(row=>{
      const input = row.querySelector('input');
      const unitSel = row.querySelector('select');
      const raw = Number(input.value);
      const group = { group: row, raw };
      if (input.value.trim()==='' || isNaN(raw) || raw <= 0){
        row.style.outline = '1px solid var(--danger)'; ok = false;
      } else {
        row.style.outline = 'none';
        values.push({ raw, base: raw * (UNIT_MULT[unitSel.value]??1), unit: unitSel.options[unitSel.selectedIndex].text });
      }
    });
    if (!ok){ toast('Enter a valid positive resistance for every resistor.'); return; }
    opts.compute(values, result);
  }
  function reset(){ list.innerHTML=''; count=0; addRow(); addRow(); hideResult(result); }

  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
}

/* ---------- 7. SERIES RESISTOR ---------- */
registerRenderer('series-resistor', function(body){
  dynamicResistorCalc(body, { idPrefix:'ser', compute:(values, result)=>{
    const total = values.reduce((a,v)=>a+v.base,0);
    const sc = autoScale(total, 'Ω');
    showResult(result, {
      formula:'Rtotal = R1 + R2 + ... + Rn',
      calcText:'Rtotal = '+values.map(v=>fmt(v.raw)+' '+v.unit).join(' + '),
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
      note:'Series resistance is always greater than the largest individual resistor.'
    });
    saveCalcHistory(getCalc('series-resistor'), values.length+' resistors → '+sc.text);
  }});
});

/* ---------- 8. PARALLEL RESISTOR ---------- */
registerRenderer('parallel-resistor', function(body){
  dynamicResistorCalc(body, { idPrefix:'par', compute:(values, result)=>{
    if (values.length === 2){
      const [a,b] = values;
      const req = (a.base * b.base) / (a.base + b.base);
      const sc = autoScale(req, 'Ω');
      showResult(result, {
        formula:'Req = (R1 × R2) / (R1 + R2)',
        calcText:'Req = ('+fmt(a.raw)+' '+a.unit+' × '+fmt(b.raw)+' '+b.unit+') / ('+fmt(a.raw)+' '+a.unit+' + '+fmt(b.raw)+' '+b.unit+')',
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Parallel resistance is always less than the smallest individual resistor.'
      });
      saveCalcHistory(getCalc('parallel-resistor'), '2 resistors → '+sc.text);
    } else {
      const sumRecip = values.reduce((a,v)=>a+1/v.base,0);
      const req = 1/sumRecip;
      const sc = autoScale(req, 'Ω');
      showResult(result, {
        formula:'1/Req = 1/R1 + 1/R2 + ... + 1/Rn',
        calcText:'1/Req = '+values.map(v=>'1/'+fmt(v.raw)+v.unit).join(' + '),
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Parallel resistance is always less than the smallest individual resistor.'
      });
      saveCalcHistory(getCalc('parallel-resistor'), values.length+' resistors → '+sc.text);
    }
  }});
});


/* ---------- 9. RESISTOR COLOR CODE ---------- */
const RESISTOR_COLORS = [
  { name:'Black',  hex:'#2a2a24', digit:0, exp:0,  tol:null },
  { name:'Brown',  hex:'#7a4a2a', digit:1, exp:1,  tol:1 },
  { name:'Red',    hex:'#c23b3b', digit:2, exp:2,  tol:2 },
  { name:'Orange', hex:'#d9782d', digit:3, exp:3,  tol:null },
  { name:'Yellow', hex:'#d0c62d', digit:4, exp:4,  tol:null },
  { name:'Green',  hex:'#4a9c4a', digit:5, exp:5,  tol:0.5 },
  { name:'Blue',   hex:'#3a6fc4', digit:6, exp:6,  tol:0.25 },
  { name:'Violet', hex:'#8a4ac4', digit:7, exp:7,  tol:0.1 },
  { name:'Gray',   hex:'#8a8a86', digit:8, exp:8,  tol:0.05 },
  { name:'White',  hex:'#e8e8e0', digit:9, exp:9,  tol:null },
  { name:'Gold',   hex:'#c9a227', digit:null, exp:-1, tol:5 },
  { name:'Silver', hex:'#b8b8b8', digit:null, exp:-2, tol:10 }
];
function colorByName(n){ return RESISTOR_COLORS.find(c=>c.name===n); }
function digitColors(){ return RESISTOR_COLORS.filter(c=>c.digit!==null); }
function multColors(){ return RESISTOR_COLORS; }
function tolColors(){ return RESISTOR_COLORS.filter(c=>c.tol!==null); }

function colorSelect(id, label, list, defaultName){
  const group = el('div', { class:'field-group' });
  group.appendChild(el('label', { for:id }, label));
  const select = el('select', { id:id }, list.map(c=> el('option', { value:c.name }, c.name)));
  if (defaultName) select.value = defaultName;
  group.appendChild(select);
  return group;
}

function resistorBandSVG(colors){
  // colors: array of hex, band positions along body
  const bodyX = 30, bodyW = 240, bodyY = 40, bodyH = 40;
  const n = colors.length;
  const spacing = bodyW / (n+1);
  let bands = '';
  colors.forEach((hex,i)=>{
    const x = bodyX + spacing*(i+0.7);
    bands += `<rect x="${x}" y="${bodyY-2}" width="12" height="${bodyH+4}" fill="${hex}" stroke="rgba(0,0,0,0.25)" />`;
  });
  return `<svg viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="60" x2="${bodyX}" y2="60" stroke="var(--olive-soft)" stroke-width="3"/>
    <line x1="${bodyX+bodyW}" y1="60" x2="300" y2="60" stroke="var(--olive-soft)" stroke-width="3"/>
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="14" fill="#D9C9A0"/>
    ${bands}
  </svg>`;
}

registerRenderer('resistor-color-code', function(body){
  let mode = 'forward';
  const tabs = el('div', { class:'calc-tabs' }, [
    el('button', { class:'calc-tab active', 'data-mode':'forward' }, 'Colors → Resistance'),
    el('button', { class:'calc-tab', 'data-mode':'reverse' }, 'Resistance → Colors')
  ]);
  body.appendChild(tabs);

  const panel = el('div', { class:'calc-card-panel' });
  const visual = el('div', { class:'resistor-visual' }, [ el('div', { class:'resistor-svg-wrap', id:'rcc_svg' }) ]);
  body.appendChild(panel);
  body.appendChild(visual);
  const result = resultPanel();
  body.appendChild(result);

  function updateSVG(colors){ $('#rcc_svg').innerHTML = resistorBandSVG(colors.map(c=>c.hex)); }

  function renderForward(){
    panel.innerHTML = '';
    const grid = el('div', { class:'band-select-grid' }, [
      colorSelect('rcc_d1', 'Band 1 (1st digit)', digitColors(), 'Brown'),
      colorSelect('rcc_d2', 'Band 2 (2nd digit)', digitColors(), 'Black'),
      colorSelect('rcc_mult', 'Band 3 (multiplier)', multColors(), 'Red'),
      colorSelect('rcc_tol', 'Band 4 (tolerance)', tolColors(), 'Gold')
    ]);
    panel.appendChild(grid);
    function currentColors(){
      return [colorByName($('#rcc_d1').value), colorByName($('#rcc_d2').value), colorByName($('#rcc_mult').value), colorByName($('#rcc_tol').value)];
    }
    function liveUpdate(){ updateSVG(currentColors()); }
    grid.addEventListener('change', liveUpdate);
    liveUpdate();

    function calc(){
      const [d1,d2,mult,tol] = currentColors();
      const resistance = (d1.digit*10 + d2.digit) * Math.pow(10, mult.exp);
      const sc = autoScale(resistance, 'Ω');
      const min = resistance * (1 - tol.tol/100), max = resistance * (1 + tol.tol/100);
      showResult(result, {
        formula:'R = (D1 × 10 + D2) × Multiplier',
        calcText:'R = ('+d1.digit+'×10 + '+d2.digit+') × 10^'+mult.exp,
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text+' ±'+tol.tol+'%',
        note:'Tolerance ±'+tol.tol+'%  →  Range: '+autoScale(min,'Ω').text+' to '+autoScale(max,'Ω').text
      });
      saveCalcHistory(getCalc('resistor-color-code'), sc.text+' ±'+tol.tol+'%');
    }
    panel.appendChild(buttonRow(calc, ()=>{ $('#rcc_d1').value='Brown'; $('#rcc_d2').value='Black'; $('#rcc_mult').value='Red'; $('#rcc_tol').value='Gold'; liveUpdate(); hideResult(result); }));
    calc();
  }

  function renderReverse(){
    panel.innerHTML = '';
    const fr = fieldGroup({ id:'rcc_rval', label:'Resistance', unitOptions:UNITS_R, defaultUnit:'' });
    const tolGroup = el('div', { class:'field-group' });
    tolGroup.appendChild(el('label', { for:'rcc_rtol' }, 'Tolerance'));
    const tolSelect = el('select', { id:'rcc_rtol' }, tolColors().map(c=>el('option', { value:c.name }, c.name+' (±'+c.tol+'%)')));
    tolSelect.value = 'Gold';
    tolGroup.appendChild(tolSelect);
    panel.appendChild(fr); panel.appendChild(tolGroup);

    function calc(){
      const r = getUnitValue('rcc_rval');
      if (!validateFields([r], { mustBePositive:true })) return;
      const val = r.base;
      let exp = Math.floor(Math.log10(val));
      let mantissa = val / Math.pow(10, exp);
      // normalize mantissa to 10-99.9 range representing 2 sig figs
      let mExp = exp - 1;
      let twoDigit = Math.round(val / Math.pow(10, mExp));
      if (twoDigit >= 100){ twoDigit = Math.round(twoDigit/10); mExp += 1; }
      if (twoDigit < 10){ twoDigit *= 10; mExp -= 1; }
      const d1 = Math.floor(twoDigit/10), d2 = twoDigit%10;
      const multColor = RESISTOR_COLORS.find(c=>c.exp===mExp);
      if (!multColor){ toast('Resistance is out of the representable range for a 4-band resistor.'); return; }
      const d1Color = digitColors().find(c=>c.digit===d1);
      const d2Color = digitColors().find(c=>c.digit===d2);
      const tolColor = colorByName(tolSelect.value);
      updateSVG([d1Color,d2Color,multColor,tolColor]);
      const computedR = twoDigit * Math.pow(10, mExp);
      const sc = autoScale(computedR,'Ω');
      showResult(result, {
        formula:'Closest standard 4-band representation',
        calcText:'Bands: '+d1Color.name+', '+d2Color.name+', '+multColor.name+', '+tolColor.name,
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: d1Color.name+'-'+d2Color.name+'-'+multColor.name+'-'+tolColor.name,
        note:'Nearest representable value: '+sc.text+' (±'+tolColor.tol+'%)'
      });
      saveCalcHistory(getCalc('resistor-color-code'), sc.text+' → '+d1Color.name+'/'+d2Color.name+'/'+multColor.name+'/'+tolColor.name);
    }
    panel.appendChild(buttonRow(calc, ()=>{ $('#rcc_rval').value=''; hideResult(result); }));
    updateSVG([colorByName('Brown'),colorByName('Black'),colorByName('Red'),colorByName('Gold')]);
  }

  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('.calc-tab'); if (!btn) return;
    mode = btn.dataset.mode;
    $$('.calc-tab', tabs).forEach(b=>b.classList.toggle('active', b===btn));
    hideResult(result);
    mode==='forward' ? renderForward() : renderReverse();
  });

  renderForward();
});

/* ---------- 10. SMD RESISTOR DECODER ---------- */
registerRenderer('smd-resistor', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const group = el('div', { class:'field-group' });
  group.appendChild(el('label', { for:'smd_code' }, 'SMD code (3 or 4 digits, or e.g. "4R7")'));
  const input = el('input', { type:'text', id:'smd_code', placeholder:'e.g. 103, 4702, 4R7', maxlength:'6' });
  group.appendChild(input);
  group.appendChild(el('div', { class:'field-error' }, ''));
  panel.appendChild(group);
  panel.appendChild(el('div', { class:'field-help' }, 'Examples: 103 → 10kΩ · 472 → 4.7kΩ · 1001 → 1kΩ · 4R7 → 4.7Ω'));
  const result = resultPanel();

  function decode(codeRaw){
    const code = codeRaw.trim().toUpperCase();
    if (!code) return { error:'Enter an SMD code.' };
    // R-notation e.g. 4R7 = 4.7 ohm, R47 = 0.47 ohm
    if (/^[0-9]*R[0-9]*$/.test(code) && code !== 'R'){
      const val = Number(code.replace('R','.'));
      if (isNaN(val)) return { error:'Invalid R-notation code.' };
      return { value: val, explain: 'R-notation: "R" marks the decimal point.' };
    }
    if (!/^[0-9]{3,4}$/.test(code)) return { error:'Code must be 3 or 4 digits (or R-notation like 4R7).' };
    if (code.length === 3){
      const digits = code.slice(0,2), mult = Number(code[2]);
      const value = Number(digits) * Math.pow(10, mult);
      return { value, explain:'First 2 digits = significant figures ('+digits+'), 3rd digit = ×10^'+mult+'.' };
    } else {
      const digits = code.slice(0,3), mult = Number(code[3]);
      const value = Number(digits) * Math.pow(10, mult);
      return { value, explain:'First 3 digits = significant figures ('+digits+'), 4th digit = ×10^'+mult+'.' };
    }
  }

  function calc(){
    clearFieldError(group);
    const decoded = decode(input.value);
    if (decoded.error){ setFieldError(group, decoded.error); hideResult(result); return; }
    const sc = autoScale(decoded.value, 'Ω');
    showResult(result, {
      formula: 'Significant digits × 10^(last digit)',
      calcText: decoded.explain,
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
    });
    saveCalcHistory(getCalc('smd-resistor'), input.value.toUpperCase()+' → '+sc.text);
  }
  input.addEventListener('keydown', (e)=>{ if (e.key==='Enter') calc(); });
  panel.appendChild(buttonRow(calc, ()=>{ input.value=''; clearFieldError(group); hideResult(result); }));
  body.appendChild(panel); body.appendChild(result);
});


/* ---------- 11. LED RESISTOR CALCULATOR ---------- */
registerRenderer('led-resistor', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fvs = fieldGroup({ id:'led_vs', label:'Supply voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fvf = fieldGroup({ id:'led_vf', label:'LED forward voltage', unitOptions:UNITS_V, defaultUnit:'', help:'Typical: red/yellow ≈ 2.0V, green ≈ 2.2V, blue/white ≈ 3.2V' });
  const fi  = fieldGroup({ id:'led_i', label:'LED current', unitOptions:UNITS_I, defaultUnit:'m', help:'Typical: 10–20 mA for standard 5mm LEDs' });
  panel.appendChild(fvs); panel.appendChild(fvf); panel.appendChild(fi);
  const result = resultPanel();

  const STANDARD_R = [10,22,33,47,68,100,150,220,270,330,470,560,680,820,1000,1200,1500,1800,2200,2700,3300,3900,4700,5600,6800,8200,10000,15000,22000];
  function nearestStandard(r){ return STANDARD_R.reduce((best,v)=> Math.abs(v-r) < Math.abs(best-r) ? v : best, STANDARD_R[0]); }

  function calc(){
    const vs = getUnitValue('led_vs'), vf = getUnitValue('led_vf'), i = getUnitValue('led_i');
    if (!validateFields([vs,vf,i], { mustBePositive:true })) return;
    if (vs.base <= vf.base){
      showResult(result, {
        formula:'R = (Vs − Vf) / I', calcText:'Vs ('+fmt(vs.raw)+'V) must be greater than Vf ('+fmt(vf.raw)+'V)',
        resultMain:'—', resultUnit:'', copyText:'invalid',
        warning:'Supply voltage must be greater than the LED forward voltage, or the LED will not light and no resistor value is valid.'
      });
      return;
    }
    const r = (vs.base - vf.base) / i.base;
    const p = i.base * i.base * r;
    const nearest = nearestStandard(r);
    const scR = autoScale(r,'Ω'); const scP = autoScale(p,'W'); const scNear = autoScale(nearest,'Ω');
    result.innerHTML=''; result.classList.add('show');
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Formula'), el('div', { class:'result-formula' }, 'R = (Vs − Vf) / I') ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Calculation'), el('div', { class:'result-calc' }, 'R = ('+fmt(vs.raw)+' − '+fmt(vf.raw)+') / '+fmt(i.raw)+' '+unitLabel('led_i_unit')) ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Required resistance'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(scR.value), el('small', null, ' '+scR.unit)]), el('button', { class:'copy-btn', onclick:()=>copyText(scR.text) }, 'Copy') ]) ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Resistor power dissipation (P = I²R)'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(scP.value), el('small', null, ' '+scP.unit)]), el('button', { class:'copy-btn', onclick:()=>copyText(scP.text) }, 'Copy') ]) ]));
    result.appendChild(el('div', { class:'result-note' }, 'Nearest standard resistor: '+scNear.text+'. Use a resistor rated for at least 2× the calculated power for safety margin.'));
    saveCalcHistory(getCalc('led-resistor'), scR.text+' (nearest '+scNear.text+')');
  }
  function reset(){ [fvs,fvf,fi].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 12. LED POWER CALCULATOR ---------- */
registerRenderer('led-power', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fv = fieldGroup({ id:'lp_v', label:'LED voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fi = fieldGroup({ id:'lp_i', label:'LED current', unitOptions:UNITS_I, defaultUnit:'m' });
  panel.appendChild(fv); panel.appendChild(fi);
  const result = resultPanel();
  function calc(){
    const v = getUnitValue('lp_v'), i = getUnitValue('lp_i');
    if (!validateFields([v,i], { mustBePositive:true })) return;
    const p = v.base * i.base;
    const sc = autoScale(p, 'W');
    showResult(result, {
      formula:'P = V × I', calcText:'P = '+fmt(v.raw)+' '+unitLabel('lp_v_unit')+' × '+fmt(i.raw)+' '+unitLabel('lp_i_unit'),
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
    });
    saveCalcHistory(getCalc('led-power'), 'P → '+sc.text);
  }
  function reset(){ [fv,fi].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 13. ZENER RESISTOR CALCULATOR ---------- */
registerRenderer('zener-resistor', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fvs = fieldGroup({ id:'zn_vs', label:'Supply voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fvz = fieldGroup({ id:'zn_vz', label:'Zener voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fiz = fieldGroup({ id:'zn_iz', label:'Desired Zener current', unitOptions:UNITS_I, defaultUnit:'m' });
  panel.appendChild(fvs); panel.appendChild(fvz); panel.appendChild(fiz);
  const result = resultPanel();
  function calc(){
    const vs = getUnitValue('zn_vs'), vz = getUnitValue('zn_vz'), iz = getUnitValue('zn_iz');
    if (!validateFields([vs,vz,iz], { mustBePositive:true })) return;
    if (vs.base <= vz.base){
      showResult(result, { formula:'R = (Vs − Vz) / Iz', calcText:'Invalid: Vs must exceed Vz', resultMain:'—', resultUnit:'', copyText:'invalid',
        warning:'Supply voltage must be greater than the Zener voltage for the regulator to function.' });
      return;
    }
    const r = (vs.base - vz.base) / iz.base;
    const p = (vs.base - vz.base) * iz.base;
    const scR = autoScale(r,'Ω'), scP = autoScale(p,'W');
    result.innerHTML=''; result.classList.add('show');
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Formula'), el('div', { class:'result-formula' }, 'R = (Vs − Vz) / Iz') ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Calculation'), el('div', { class:'result-calc' }, 'R = ('+fmt(vs.raw)+' − '+fmt(vz.raw)+') / '+fmt(iz.raw)+' '+unitLabel('zn_iz_unit')) ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Series resistor'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(scR.value), el('small', null, ' '+scR.unit)]), el('button', { class:'copy-btn', onclick:()=>copyText(scR.text) }, 'Copy') ]) ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Resistor power dissipation'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(scP.value), el('small', null, ' '+scP.unit)]), el('button', { class:'copy-btn', onclick:()=>copyText(scP.text) }, 'Copy') ]) ]));
    result.appendChild(el('div', { class:'result-note' }, 'Choose a resistor rated for at least 2× the calculated power dissipation.'));
    saveCalcHistory(getCalc('zener-resistor'), 'R → '+scR.text);
  }
  function reset(){ [fvs,fvz,fiz].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});


/* ---------- 14. RC TIME CONSTANT ---------- */
registerRenderer('rc-time-constant', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fr = fieldGroup({ id:'rc_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:'' });
  const fc = fieldGroup({ id:'rc_c', label:'Capacitance', unitOptions:UNITS_C, defaultUnit:'µ' });
  panel.appendChild(fr); panel.appendChild(fc);
  const result = resultPanel();
  function calc(){
    const r = getUnitValue('rc_r'), c = getUnitValue('rc_c');
    if (!validateFields([r,c], { mustBePositive:true })) return;
    const tau = r.base * c.base;
    const sc = autoScale(tau, 's');
    result.innerHTML=''; result.classList.add('show');
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Formula'), el('div', { class:'result-formula' }, 'τ = R × C') ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Calculation'), el('div', { class:'result-calc' }, 'τ = '+fmt(r.raw)+' '+unitLabel('rc_r_unit')+' × '+fmt(c.raw)+' '+unitLabel('rc_c_unit')) ]));
    result.appendChild(el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Time constant'),
      el('div', { class:'result-final' }, [ el('div', { class:'rf-value' }, [fmt(sc.value), el('small', null, ' '+sc.unit)]), el('button', { class:'copy-btn', onclick:()=>copyText(sc.text) }, 'Copy') ]) ]));
    const pcts = [[1,63.2],[2,86.5],[3,95.0],[4,98.2],[5,99.3]];
    const pctList = el('div', { class:'result-block' }, [ el('div', { class:'result-label' }, 'Charging curve') ]);
    pcts.forEach(([n,pct])=>{
      pctList.appendChild(el('div', { class:'result-calc', style:'margin-bottom:6px;' }, n+'τ ('+autoScale(tau*n,'s').text+')  →  '+pct+'% charged'));
    });
    result.appendChild(pctList);
    saveCalcHistory(getCalc('rc-time-constant'), 'τ → '+sc.text);
  }
  function reset(){ [fr,fc].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 15. RL TIME CONSTANT ---------- */
registerRenderer('rl-time-constant', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fl = fieldGroup({ id:'rl_l', label:'Inductance', unitOptions:UNITS_L, defaultUnit:'m' });
  const fr = fieldGroup({ id:'rl_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:'' });
  panel.appendChild(fl); panel.appendChild(fr);
  const result = resultPanel();
  function calc(){
    const l = getUnitValue('rl_l'), r = getUnitValue('rl_r');
    if (!validateFields([l,r], { mustBePositive:true })) return;
    if (r.base === 0){ setFieldError(r.group,'Resistance cannot be zero.'); return; }
    const tau = l.base / r.base;
    const sc = autoScale(tau, 's');
    showResult(result, {
      formula:'τ = L / R', calcText:'τ = '+fmt(l.raw)+' '+unitLabel('rl_l_unit')+' / '+fmt(r.raw)+' '+unitLabel('rl_r_unit'),
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
    });
    saveCalcHistory(getCalc('rl-time-constant'), 'τ → '+sc.text);
  }
  function reset(){ [fl,fr].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 16. RC CUTOFF FREQUENCY ---------- */
registerRenderer('rc-cutoff-frequency', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fr = fieldGroup({ id:'rcf_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:'' });
  const fc = fieldGroup({ id:'rcf_c', label:'Capacitance', unitOptions:UNITS_C, defaultUnit:'µ' });
  panel.appendChild(fr); panel.appendChild(fc);
  const result = resultPanel();
  function calc(){
    const r = getUnitValue('rcf_r'), c = getUnitValue('rcf_c');
    if (!validateFields([r,c], { mustBePositive:true })) return;
    const fc_ = 1 / (2*Math.PI*r.base*c.base);
    const sc = autoScale(fc_, 'Hz');
    showResult(result, {
      formula:'fc = 1 / (2πRC)', calcText:'fc = 1 / (2π × '+fmt(r.raw)+' '+unitLabel('rcf_r_unit')+' × '+fmt(c.raw)+' '+unitLabel('rcf_c_unit')+')',
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
      note:'-3 dB cutoff frequency of a single-pole RC filter.'
    });
    saveCalcHistory(getCalc('rc-cutoff-frequency'), 'fc → '+sc.text);
  }
  function reset(){ [fr,fc].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 17. RL CUTOFF FREQUENCY ---------- */
registerRenderer('rl-cutoff-frequency', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fr = fieldGroup({ id:'rlf_r', label:'Resistance', unitOptions:UNITS_R, defaultUnit:'' });
  const fl = fieldGroup({ id:'rlf_l', label:'Inductance', unitOptions:UNITS_L, defaultUnit:'m' });
  panel.appendChild(fr); panel.appendChild(fl);
  const result = resultPanel();
  function calc(){
    const r = getUnitValue('rlf_r'), l = getUnitValue('rlf_l');
    if (!validateFields([r,l], { mustBePositive:true })) return;
    if (l.base === 0){ setFieldError(l.group,'Inductance cannot be zero.'); return; }
    const fc_ = r.base / (2*Math.PI*l.base);
    const sc = autoScale(fc_, 'Hz');
    showResult(result, {
      formula:'fc = R / (2πL)', calcText:'fc = '+fmt(r.raw)+' '+unitLabel('rlf_r_unit')+' / (2π × '+fmt(l.raw)+' '+unitLabel('rlf_l_unit')+')',
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
      note:'-3 dB cutoff frequency of a single-pole RL filter.'
    });
    saveCalcHistory(getCalc('rl-cutoff-frequency'), 'fc → '+sc.text);
  }
  function reset(){ [fr,fl].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});


/* ---------- 18. FREQUENCY <-> WAVELENGTH ---------- */
registerRenderer('freq-wavelength', function(body){
  const C = 299792458; // m/s
  let mode = 'f2w';
  const tabs = el('div', { class:'calc-tabs' }, [
    el('button', { class:'calc-tab active', 'data-mode':'f2w' }, 'Frequency → Wavelength'),
    el('button', { class:'calc-tab', 'data-mode':'w2f' }, 'Wavelength → Frequency')
  ]);
  body.appendChild(tabs);
  const panel = el('div', { class:'calc-card-panel' });
  body.appendChild(panel);
  const result = resultPanel();
  body.appendChild(result);

  const UNITS_WAVE = [{value:'',label:'m'},{value:'c',label:'cm'},{value:'mm',label:'mm'}];
  const WAVE_MULT = { '':1, 'c':0.01, 'mm':0.001 };

  function renderF2W(){
    panel.innerHTML='';
    const f = fieldGroup({ id:'fw_f', label:'Frequency', unitOptions:UNITS_F, defaultUnit:'M' });
    panel.appendChild(f);
    function calc(){
      const fr = getUnitValue('fw_f');
      if (!validateFields([fr], { mustBePositive:true })) return;
      const lambda = C / fr.base;
      const sc = autoScale(lambda, 'm');
      showResult(result, {
        formula:'λ = c / f', calcText:'λ = 299,792,458 / '+fmt(fr.raw)+' '+unitLabel('fw_f_unit'),
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text,
        note:'Speed of light c = 299,792,458 m/s (vacuum).'
      });
      saveCalcHistory(getCalc('freq-wavelength'), 'λ → '+sc.text);
    }
    panel.appendChild(buttonRow(calc, ()=>{ $('#fw_f').value=''; hideResult(result); }));
  }
  function renderW2F(){
    panel.innerHTML='';
    const w = fieldGroup({ id:'fw_w', label:'Wavelength', unitOptions:UNITS_WAVE, defaultUnit:'' });
    panel.appendChild(w);
    function calc(){
      const input = $('#fw_w'), unitSel = $('#fw_w_unit');
      const raw = readNum(input);
      const group = input.closest('.field-group');
      if (!validateFields([{raw, group}], { mustBePositive:true })) return;
      const meters = raw * WAVE_MULT[unitSel.value];
      const f = C / meters;
      const sc = autoScale(f, 'Hz');
      showResult(result, {
        formula:'f = c / λ', calcText:'f = 299,792,458 / '+fmt(raw)+' '+unitSel.options[unitSel.selectedIndex].text,
        resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
      });
      saveCalcHistory(getCalc('freq-wavelength'), 'f → '+sc.text);
    }
    panel.appendChild(buttonRow(calc, ()=>{ $('#fw_w').value=''; hideResult(result); }));
  }
  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('.calc-tab'); if (!btn) return;
    mode = btn.dataset.mode;
    $$('.calc-tab', tabs).forEach(b=>b.classList.toggle('active', b===btn));
    hideResult(result);
    mode==='f2w' ? renderF2W() : renderW2F();
  });
  renderF2W();
});

/* ---------- 19. FREQUENCY <-> PERIOD ---------- */
registerRenderer('freq-period', function(body){
  let target = 'T';
  const panel = el('div', { class:'calc-card-panel' });
  const chipRow = el('div', { class:'radio-group' }, [
    el('button', { type:'button', class:'radio-chip active', 'data-key':'T' }, 'Solve for Period (T)'),
    el('button', { type:'button', class:'radio-chip', 'data-key':'f' }, 'Solve for Frequency (f)')
  ]);
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'What do you want to calculate?'), chipRow ]));
  const fieldsWrap = el('div', null);
  panel.appendChild(fieldsWrap);
  const result = resultPanel();

  function rebuild(){
    fieldsWrap.innerHTML='';
    if (target==='T') fieldsWrap.appendChild(fieldGroup({ id:'fp_f', label:'Frequency', unitOptions:UNITS_F, defaultUnit:'' }));
    else fieldsWrap.appendChild(fieldGroup({ id:'fp_t', label:'Period', unitOptions:[{value:'',label:'s'},{value:'m',label:'ms'},{value:'µ',label:'µs'},{value:'n',label:'ns'}], defaultUnit:'' }));
    hideResult(result);
  }
  rebuild();
  chipRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    target = btn.dataset.key;
    $$('.radio-chip', chipRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuild();
  });
  function calc(){
    if (target==='T'){
      const f = getUnitValue('fp_f');
      if (!validateFields([f], { mustBePositive:true })) return;
      const t = 1/f.base; const sc = autoScale(t,'s');
      showResult(result, { formula:'T = 1 / f', calcText:'T = 1 / '+fmt(f.raw)+' '+unitLabel('fp_f_unit'), resultMain:fmt(sc.value), resultUnit:sc.unit, copyText:sc.text });
      saveCalcHistory(getCalc('freq-period'), 'T → '+sc.text);
    } else {
      const t = getUnitValue('fp_t');
      if (!validateFields([t], { mustBePositive:true })) return;
      const f = 1/t.base; const sc = autoScale(f,'Hz');
      showResult(result, { formula:'f = 1 / T', calcText:'f = 1 / '+fmt(t.raw)+' '+unitLabel('fp_t_unit'), resultMain:fmt(sc.value), resultUnit:sc.unit, copyText:sc.text });
      saveCalcHistory(getCalc('freq-period'), 'f → '+sc.text);
    }
  }
  function reset(){ $$('input', fieldsWrap).forEach(i=>i.value=''); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 20. ANGULAR FREQUENCY ---------- */
registerRenderer('angular-frequency', function(body){
  let target = 'omega';
  const panel = el('div', { class:'calc-card-panel' });
  const chipRow = el('div', { class:'radio-group' }, [
    el('button', { type:'button', class:'radio-chip active', 'data-key':'omega' }, 'Solve for ω'),
    el('button', { type:'button', class:'radio-chip', 'data-key':'f' }, 'Solve for f')
  ]);
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'What do you want to calculate?'), chipRow ]));
  const fieldsWrap = el('div', null);
  panel.appendChild(fieldsWrap);
  const result = resultPanel();
  function rebuild(){
    fieldsWrap.innerHTML='';
    if (target==='omega') fieldsWrap.appendChild(fieldGroup({ id:'af_f', label:'Frequency', unitOptions:UNITS_F, defaultUnit:'' }));
    else fieldsWrap.appendChild(fieldGroup({ id:'af_w', label:'Angular frequency (ω)', unitOptions:[{value:'',label:'rad/s'},{value:'k',label:'krad/s'}], defaultUnit:'' }));
    hideResult(result);
  }
  rebuild();
  chipRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    target = btn.dataset.key;
    $$('.radio-chip', chipRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuild();
  });
  function calc(){
    if (target==='omega'){
      const f = getUnitValue('af_f');
      if (!validateFields([f], { mustBePositive:true })) return;
      const w = 2*Math.PI*f.base; const sc = autoScale(w,'rad/s');
      showResult(result, { formula:'ω = 2πf', calcText:'ω = 2π × '+fmt(f.raw)+' '+unitLabel('af_f_unit'), resultMain:fmt(sc.value), resultUnit:sc.unit, copyText:sc.text });
      saveCalcHistory(getCalc('angular-frequency'), 'ω → '+sc.text);
    } else {
      const w = getUnitValue('af_w');
      if (!validateFields([w], { mustBePositive:true })) return;
      const f = w.base/(2*Math.PI); const sc = autoScale(f,'Hz');
      showResult(result, { formula:'f = ω / 2π', calcText:'f = '+fmt(w.raw)+' '+unitLabel('af_w_unit')+' / 2π', resultMain:fmt(sc.value), resultUnit:sc.unit, copyText:sc.text });
      saveCalcHistory(getCalc('angular-frequency'), 'f → '+sc.text);
    }
  }
  function reset(){ $$('input', fieldsWrap).forEach(i=>i.value=''); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 21. DECIBEL CALCULATOR ---------- */
registerRenderer('decibel', function(body){
  let type = 'power'; // power | voltage | current
  const TYPE_META = {
    power:{ label:'Power gain', unit:'W', mult:10, formula:'dB = 10 log10(P2 / P1)' },
    voltage:{ label:'Voltage gain', unit:'V', mult:20, formula:'dB = 20 log10(V2 / V1)' },
    current:{ label:'Current gain', unit:'A', mult:20, formula:'dB = 20 log10(I2 / I1)' }
  };
  let dir = 'toDb'; // toDb | fromDb
  const tabs = el('div', { class:'calc-tabs' }, [
    el('button', { class:'calc-tab active', 'data-dir':'toDb' }, 'Values → dB'),
    el('button', { class:'calc-tab', 'data-dir':'fromDb' }, 'dB → Value')
  ]);
  body.appendChild(tabs);

  const panel = el('div', { class:'calc-card-panel' });
  const typeRow = el('div', { class:'radio-group' }, Object.keys(TYPE_META).map(k=>
    el('button', { type:'button', class:'radio-chip'+(k===type?' active':''), 'data-key':k }, TYPE_META[k].label)
  ));
  panel.appendChild(el('div', { class:'field-group' }, [ el('label', null, 'Gain type'), typeRow ]));
  const fieldsWrap = el('div', null);
  panel.appendChild(fieldsWrap);
  body.appendChild(panel);
  const result = resultPanel();
  body.appendChild(result);

  function rebuild(){
    fieldsWrap.innerHTML='';
    const meta = TYPE_META[type];
    if (dir==='toDb'){
      fieldsWrap.appendChild(fieldGroup({ id:'db_p1', label:meta.label.split(' ')[0]+' 1 (reference, '+meta.unit+')', placeholder:'' }));
      fieldsWrap.appendChild(fieldGroup({ id:'db_p2', label:meta.label.split(' ')[0]+' 2 (measured, '+meta.unit+')', placeholder:'' }));
    } else {
      fieldsWrap.appendChild(fieldGroup({ id:'db_db', label:'Gain (dB)', placeholder:'e.g. 3, -6, 20' }));
      fieldsWrap.appendChild(fieldGroup({ id:'db_p1', label:meta.label.split(' ')[0]+' 1 (reference, '+meta.unit+')', placeholder:'' }));
    }
    hideResult(result);
  }
  rebuild();

  typeRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.radio-chip'); if (!btn) return;
    type = btn.dataset.key;
    $$('.radio-chip', typeRow).forEach(b=>b.classList.toggle('active', b===btn));
    rebuild();
  });
  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('.calc-tab'); if (!btn) return;
    dir = btn.dataset.dir;
    $$('.calc-tab', tabs).forEach(b=>b.classList.toggle('active', b===btn));
    rebuild();
  });

  function calc(){
    const meta = TYPE_META[type];
    if (dir==='toDb'){
      const p1input=$('#db_p1'), p2input=$('#db_p2');
      const p1 = readNum(p1input), p2 = readNum(p2input);
      const g1 = p1input.closest('.field-group'), g2 = p2input.closest('.field-group');
      if (!validateFields([{raw:p1,group:g1},{raw:p2,group:g2}], { mustBePositive:true })) return;
      const db = meta.mult * Math.log10(p2/p1);
      showResult(result, {
        formula: meta.formula, calcText:'dB = '+meta.mult+' × log10('+fmt(p2)+' / '+fmt(p1)+')',
        resultMain: fmt(db,5), resultUnit:'dB', copyText: fmt(db,5)+' dB',
        note: db>=0 ? 'Positive dB = gain (amplification).' : 'Negative dB = attenuation (loss).'
      });
      saveCalcHistory(getCalc('decibel'), meta.label+' → '+fmt(db,5)+' dB');
    } else {
      const dbInput = $('#db_db'), p1input=$('#db_p1');
      const dbv = readNum(dbInput), p1 = readNum(p1input);
      const g1 = dbInput.closest('.field-group'), g2 = p1input.closest('.field-group');
      if (isNaN(dbv)){ setFieldError(g1,'Enter a dB value.'); return; } else clearFieldError(g1);
      if (!validateFields([{raw:p1,group:g2}], { mustBePositive:true })) return;
      const p2 = p1 * Math.pow(10, dbv/meta.mult);
      showResult(result, {
        formula: meta.unit+'2 = '+meta.unit+'1 × 10^(dB / '+meta.mult+')',
        calcText: meta.unit+'2 = '+fmt(p1)+' × 10^('+fmt(dbv)+' / '+meta.mult+')',
        resultMain: fmt(p2,5), resultUnit: meta.unit, copyText: fmt(p2,5)+' '+meta.unit
      });
      saveCalcHistory(getCalc('decibel'), meta.label+' reverse → '+fmt(p2,5)+' '+meta.unit);
    }
  }
  function reset(){ $$('input', fieldsWrap).forEach(i=>i.value=''); $$('.field-group', fieldsWrap).forEach(clearFieldError); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
});


/* ---------- 22. BATTERY RUNTIME ---------- */
registerRenderer('battery-runtime', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fcap = fieldGroup({ id:'br_cap', label:'Battery capacity', unitOptions:[{value:'mAh',label:'mAh'},{value:'Ah',label:'Ah'}], defaultUnit:'mAh' });
  const fload = fieldGroup({ id:'br_load', label:'Load current', unitOptions:UNITS_I, defaultUnit:'m' });
  const feff = fieldGroup({ id:'br_eff', label:'Efficiency (%)', placeholder:'100', help:'Accounts for real-world losses. Use 100 for ideal case.' });
  panel.appendChild(fcap); panel.appendChild(fload); panel.appendChild(feff);
  const result = resultPanel();
  function calc(){
    const capInput = $('#br_cap'), capUnit = $('#br_cap_unit');
    const capRaw = readNum(capInput);
    const capAh = capUnit.value==='mAh' ? capRaw/1000 : capRaw;
    const load = getUnitValue('br_load');
    const effInput = $('#br_eff');
    let eff = effInput.value.trim()==='' ? 100 : Number(effInput.value);

    const capGroup = capInput.closest('.field-group');
    const ok1 = validateFields([{raw:capRaw, group:capGroup}], { mustBePositive:true });
    const ok2 = validateFields([load], { mustBePositive:true });
    const effGroup = effInput.closest('.field-group');
    clearFieldError(effGroup);
    if (isNaN(eff) || eff<=0 || eff>100){ setFieldError(effGroup,'Enter efficiency between 1 and 100.'); return; }
    if (!ok1 || !ok2) return;

    const loadA = load.base;
    const runtimeHours = (capAh * (eff/100)) / loadA;
    const hours = Math.floor(runtimeHours);
    const minutes = Math.round((runtimeHours - hours) * 60);
    showResult(result, {
      formula:'Runtime (h) = Capacity (Ah) × Efficiency / Load current (A)',
      calcText:'Runtime = '+fmt(capAh)+' Ah × '+eff+'% / '+fmt(load.raw)+' '+unitLabel('br_load_unit'),
      resultMain: hours+'h '+minutes+'m', resultUnit:'', copyText: hours+'h '+minutes+'m ('+fmt(runtimeHours,4)+' hours)',
      note:'≈ '+fmt(runtimeHours,4)+' hours. Real-world runtime varies with temperature, discharge rate and battery age — treat this as an estimate.'
    });
    saveCalcHistory(getCalc('battery-runtime'), hours+'h '+minutes+'m');
  }
  function reset(){ [fcap,fload,feff].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 23. BATTERY ENERGY ---------- */
registerRenderer('battery-energy', function(body){
  const panel = el('div', { class:'calc-card-panel' });
  const fv = fieldGroup({ id:'be_v', label:'Battery voltage', unitOptions:UNITS_V, defaultUnit:'' });
  const fcap = fieldGroup({ id:'be_cap', label:'Capacity', unitOptions:[{value:'mAh',label:'mAh'},{value:'Ah',label:'Ah'}], defaultUnit:'mAh' });
  panel.appendChild(fv); panel.appendChild(fcap);
  const result = resultPanel();
  function calc(){
    const v = getUnitValue('be_v');
    const capInput = $('#be_cap'), capUnit = $('#be_cap_unit');
    const capRaw = readNum(capInput);
    const capGroup = capInput.closest('.field-group');
    const ok = validateFields([v, {raw:capRaw, group:capGroup}], { mustBePositive:true });
    if (!ok) return;
    const capAh = capUnit.value==='mAh' ? capRaw/1000 : capRaw;
    const wh = v.base * capAh;
    const sc = autoScale(wh, 'Wh');
    showResult(result, {
      formula:'Wh = V × Ah', calcText:'Wh = '+fmt(v.raw)+' V × '+fmt(capAh)+' Ah',
      resultMain: fmt(sc.value), resultUnit: sc.unit, copyText: sc.text
    });
    saveCalcHistory(getCalc('battery-energy'), 'Energy → '+sc.text);
  }
  function reset(){ [fv,fcap].forEach(f=>{ f.querySelector('input').value=''; clearFieldError(f); }); hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});

/* ---------- 24. ELECTRONICS UNIT CONVERTER ---------- */
registerRenderer('unit-converter', function(body){
  const QUANTITIES = {
    voltage:   { label:'Voltage', base:'V', units:[['T','TV'],['G','GV'],['M','MV'],['k','kV'],['','V'],['m','mV'],['µ','µV'],['n','nV']] },
    current:   { label:'Current', base:'A', units:[['','A'],['m','mA'],['µ','µA'],['n','nA'],['p','pA']] },
    resistance:{ label:'Resistance', base:'Ω', units:[['G','GΩ'],['M','MΩ'],['k','kΩ'],['','Ω'],['m','mΩ']] },
    capacitance:{ label:'Capacitance', base:'F', units:[['','F'],['m','mF'],['µ','µF'],['n','nF'],['p','pF']] },
    inductance:{ label:'Inductance', base:'H', units:[['','H'],['m','mH'],['µ','µH'],['n','nH']] },
    frequency: { label:'Frequency', base:'Hz', units:[['G','GHz'],['M','MHz'],['k','kHz'],['','Hz']] },
    power:     { label:'Power', base:'W', units:[['M','MW'],['k','kW'],['','W'],['m','mW'],['µ','µW']] },
    energy:    { label:'Energy', base:'J', units:[['k','kJ'],['','J']], special:'energy' }
  };

  const panel = el('div', { class:'calc-card-panel' });
  const qtyGroup = el('div', { class:'field-group' });
  qtyGroup.appendChild(el('label', { for:'uc_qty' }, 'Quantity'));
  const qtySelect = el('select', { id:'uc_qty' }, Object.keys(QUANTITIES).map(k=> el('option', { value:k }, QUANTITIES[k].label)));
  qtyGroup.appendChild(qtySelect);
  panel.appendChild(qtyGroup);

  const row = el('div', { class:'field-row' });
  panel.appendChild(row);
  const result = resultPanel();

  const ENERGY_UNITS = [['J','J',1],['Wh','Wh',3600],['kWh','kWh',3600000],['kJ','kJ',1000]];

  function build(){
    row.innerHTML = '';
    const qty = qtySelect.value;
    const meta = QUANTITIES[qty];
    if (meta.special === 'energy'){
      const fromGroup = el('div', { class:'field-group' });
      fromGroup.appendChild(el('label', null, 'From'));
      const fromRow = el('div', { class:'input-unit-wrap' }, [
        el('input', { type:'number', id:'uc_from', step:'any' }),
        el('select', { id:'uc_from_unit' }, ENERGY_UNITS.map(u=>el('option',{value:u[0]}, u[1])))
      ]);
      fromGroup.appendChild(fromRow); fromGroup.appendChild(el('div',{class:'field-error'},''));
      const toGroup = el('div', { class:'field-group' });
      toGroup.appendChild(el('label', null, 'To'));
      const toSelect = el('select', { id:'uc_to_unit' }, ENERGY_UNITS.map(u=>el('option',{value:u[0]}, u[1])));
      toGroup.appendChild(toSelect);
      row.appendChild(fromGroup); row.appendChild(toGroup);
      $('#uc_to_unit').value = 'Wh';
      return;
    }
    const fromGroup = el('div', { class:'field-group' });
    fromGroup.appendChild(el('label', null, 'From'));
    const fromRow = el('div', { class:'input-unit-wrap' }, [
      el('input', { type:'number', id:'uc_from', step:'any' }),
      el('select', { id:'uc_from_unit' }, meta.units.map(u=>el('option',{value:u[0]}, u[1])))
    ]);
    fromGroup.appendChild(fromRow); fromGroup.appendChild(el('div',{class:'field-error'},''));
    const toGroup = el('div', { class:'field-group' });
    toGroup.appendChild(el('label', null, 'To'));
    const toSelect = el('select', { id:'uc_to_unit' }, meta.units.map(u=>el('option',{value:u[0]}, u[1])));
    toGroup.appendChild(toSelect);
    row.appendChild(fromGroup); row.appendChild(toGroup);
    // sensible default "to" different from "from"
    if (meta.units.length>1) toSelect.selectedIndex = 1;
  }
  build();
  qtySelect.addEventListener('change', ()=>{ build(); hideResult(result); });

  function calc(){
    const qty = qtySelect.value;
    const meta = QUANTITIES[qty];
    const input = $('#uc_from');
    const raw = readNum(input);
    const group = input.closest('.field-group');
    if (!validateFields([{raw, group}])) return;
    const fromUnit = $('#uc_from_unit').value, toUnit = $('#uc_to_unit').value;

    if (meta.special === 'energy'){
      const fromMult = ENERGY_UNITS.find(u=>u[0]===fromUnit)[2];
      const toMult = ENERGY_UNITS.find(u=>u[0]===toUnit)[2];
      const joules = raw * fromMult;
      const out = joules / toMult;
      showResult(result, {
        formula:'Convert via base unit (joules)', calcText: fmt(raw)+' '+fromUnit+' = '+fmt(raw*fromMult)+' J',
        resultMain: fmt(out,6), resultUnit: toUnit, copyText: fmt(out,6)+' '+toUnit
      });
      saveCalcHistory(getCalc('unit-converter'), fmt(raw)+' '+fromUnit+' → '+fmt(out,6)+' '+toUnit);
      return;
    }
    const baseVal = toBase(raw, fromUnit);
    const toMult = UNIT_MULT[toUnit] ?? 1;
    const out = baseVal / toMult;
    const fromLabel = meta.units.find(u=>u[0]===fromUnit)[1];
    const toLabel = meta.units.find(u=>u[0]===toUnit)[1];
    showResult(result, {
      formula:'Convert via base unit ('+meta.base+')', calcText: fmt(raw)+' '+fromLabel+' = '+fmt(baseVal)+' '+meta.base,
      resultMain: fmt(out,6), resultUnit: toLabel, copyText: fmt(out,6)+' '+toLabel
    });
    saveCalcHistory(getCalc('unit-converter'), fmt(raw)+' '+fromLabel+' → '+fmt(out,6)+' '+toLabel);
  }
  function reset(){ $('#uc_from').value=''; hideResult(result); }
  panel.appendChild(buttonRow(calc, reset));
  body.appendChild(panel); body.appendChild(result);
});


/* =========================================================
   14. GLOBAL SEARCH
========================================================= */

function searchCalculators(query){
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CALCULATORS.filter(c=>{
    const cat = CATEGORIES.find(cc=>cc.id===c.category);
    const hay = [c.name, c.short, cat ? cat.name : '', ...(c.keywords||[])].join(' ').toLowerCase();
    return hay.includes(q);
  }).slice(0, 8);
}

function wireSearch(inputEl, resultsEl){
  if (!inputEl) return;
  inputEl.addEventListener('input', ()=>{
    const q = inputEl.value;
    if (!q.trim()){ if (resultsEl){ resultsEl.hidden = true; resultsEl.innerHTML=''; } return; }
    const matches = searchCalculators(q);
    if (!resultsEl) return;
    resultsEl.hidden = false;
    resultsEl.innerHTML = '';
    if (!matches.length){
      resultsEl.appendChild(el('div', { class:'search-empty' }, 'No calculators found for "'+q+'".'));
      return;
    }
    matches.forEach(c=>{
      const cat = CATEGORIES.find(cc=>cc.id===c.category);
      const item = el('div', { class:'sr-item', tabindex:'0', role:'button' }, [
        el('div', null, [ el('div', { class:'sr-name' }, c.name), el('div', { class:'sr-cat' }, cat?cat.name:'') ]),
        el('span', null, '→')
      ]);
      item.addEventListener('click', ()=>{ goTo('#/calc/'+c.id); inputEl.value=''; resultsEl.hidden = true; });
      item.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ item.click(); } });
      resultsEl.appendChild(item);
    });
  });
  inputEl.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){
      const matches = searchCalculators(inputEl.value);
      if (matches.length){ goTo('#/calc/'+matches[0].id); inputEl.value=''; if (resultsEl){ resultsEl.hidden = true; } }
    }
    if (e.key === 'Escape' && resultsEl){ resultsEl.hidden = true; }
  });
  document.addEventListener('click', (e)=>{
    if (resultsEl && !resultsEl.hidden && !resultsEl.contains(e.target) && e.target !== inputEl){
      resultsEl.hidden = true;
    }
  });
}

/* =========================================================
   15. NAVIGATION: dropdown, mobile menu, theme
========================================================= */

function buildCategoriesPanel(){
  const panel = $('#categoriesPanel');
  panel.innerHTML = '';
  CATEGORIES.forEach(cat=>{
    const a = el('a', { href: cat.isFormulaLink ? '#/formulas' : '#/category/'+cat.id }, cat.name);
    panel.appendChild(a);
  });
}

function buildMobileMenu(){
  const wrap = $('#mobileMenuLinks');
  wrap.innerHTML = '';
  wrap.appendChild(el('a', { href:'#/home', class:'cat-heading' }, 'Navigate'));
  wrap.appendChild(el('a', { href:'#/home' }, 'Home'));
  wrap.appendChild(el('a', { href:'#/favorites' }, 'Favorites'));
  wrap.appendChild(el('a', { href:'#/history' }, 'History'));
  wrap.appendChild(el('a', { href:'#/formulas' }, 'Formula Reference'));
  wrap.appendChild(el('a', { href:'#/home', class:'cat-heading' }, 'Categories'));
  CATEGORIES.filter(c=>!c.isFormulaLink).forEach(cat=>{
    wrap.appendChild(el('a', { href:'#/category/'+cat.id }, cat.name));
  });
}

function closeMobileMenu(){
  $('#mobileMenu').classList.remove('open');
  $('#hamburgerBtn').classList.remove('open');
  $('#hamburgerBtn').setAttribute('aria-expanded','false');
}
function closeCategoriesPanel(){
  $('#categoriesPanel').classList.remove('open');
  $('#categoriesBtn').setAttribute('aria-expanded','false');
}

function initNav(){
  buildCategoriesPanel();
  buildMobileMenu();

  const hamburger = $('#hamburgerBtn');
  hamburger.addEventListener('click', ()=>{
    const open = !$('#mobileMenu').classList.contains('open');
    $('#mobileMenu').classList.toggle('open', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  });

  const catBtn = $('#categoriesBtn');
  catBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open = !$('#categoriesPanel').classList.contains('open');
    $('#categoriesPanel').classList.toggle('open', open);
    catBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e)=>{
    if (!e.target.closest('.nav-dropdown')) closeCategoriesPanel();
  });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape'){ closeCategoriesPanel(); closeMobileMenu(); } });

  // theme
  const savedTheme = lsGet(STORE_KEYS.theme, 'olive');
  document.body.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'olive');
  $('#themeToggle').addEventListener('click', ()=>{
    const current = document.body.getAttribute('data-theme');
    const next = current === 'light' ? 'olive' : 'light';
    document.body.setAttribute('data-theme', next);
    lsSet(STORE_KEYS.theme, next);
  });

  wireSearch($('#heroSearchInput'), $('#searchResults'));
  wireSearch($('#mobileSearchInput'), null);
  const mobileSearch = $('#mobileSearchInput');
  if (mobileSearch){
    mobileSearch.addEventListener('keydown', (e)=>{
      if (e.key==='Enter'){
        const matches = searchCalculators(mobileSearch.value);
        if (matches.length){ goTo('#/calc/'+matches[0].id); mobileSearch.value=''; closeMobileMenu(); }
      }
    });
  }
  $$('.mobile-menu-links a, .nav-dropdown-panel a').forEach(a=>{
    a.addEventListener('click', ()=>{ closeMobileMenu(); closeCategoriesPanel(); });
  });
}

/* =========================================================
   16. INIT
========================================================= */

function init(){
  initNav();
  window.addEventListener('hashchange', router);
  router();
}

document.addEventListener('DOMContentLoaded', init);

})();
