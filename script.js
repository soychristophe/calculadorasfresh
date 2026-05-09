import { productsData } from './products.js';

/* ═══════════════════════════════════════════════════════
   SERVICE WORKER
════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* ═══════════════════════════════════════════════════════
   DOM — cached once at startup, never queried again
════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const SW_CACHE_NAME = 'Christophe_v3';

const el = {
  display:         $('display'),
  preview:         $('preview'),
  screen:          $('screen'),
  miniTotal:       $('mini-total'),
  miniFull:        $('mini-full'),
  miniRest:        $('mini-rest'),
  miniFormula:     $('mini-formula'),
  histContent:     $('histContent'),
  offlineBadge:    $('offline-badge'),
  copyToast:       $('copy-toast'),
  installBanner:   $('install-banner'),
  installBtn:      $('install-btn'),
  dismissBtn:      $('dismiss-btn'),
  overlay:         $('msj-overlay'),
  msjText:         $('msj-text'),
  spedBarcode:     $('sped-barcode'),
  spedQty:         $('sped-qty'),
  spedSuggestions: $('sped-suggestions'),
  spedProductName: $('sped-product-name'),
  spedProductInfo: $('sped-product-info'),
  spedError1:      $('sped-error-step1'),
  spedError2:      $('sped-error-step2'),
  spedStep1:       $('sped-step1'),
  spedStep2:       $('sped-step2'),
  secMain:         $('sec-main'),
  secHist:         $('sec-hist'),
  secMsj:          $('sec-msj'),
  secSped:         $('sec-sped'),
  cacheWatermark:  $('cache-watermark'),
  // NUEVOS ELEMENTOS
  spedStep3:           $('sped-step3'),
  pullQty:             $('pull-qty'),
  pullErrorStep3:      $('pull-error-step3'),
  spedProductInfoPull: $('sped-product-info-pull'),
  spedCalcResult:      $('sped-calc-result'),
  spedPullResult:      $('sped-pull-result')
};

/* ═══════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════ */
const STORAGE_KEY = { calc: 'fw_calc_v9', hist: 'fw_hist_v9' };
const MAX_HISTORY = 50;

const state = {
  mode:            'calc',
  calcVal:         localStorage.getItem(STORAGE_KEY.calc) || '0',
  boxVal:          '0',
  history:         JSON.parse(localStorage.getItem(STORAGE_KEY.hist)) || [],
  selectedProduct: null,
  msjAngle:        90,
  deferredPrompt:  null,
  pendingSpedInfo: null,
  spedOriginalCalc: null
};

/* ═══════════════════════════════════════════════════════
   STATIC CONFIG
════════════════════════════════════════════════════════ */
const OPS = new Set(['+', '-', '*', '/']);

const TAB_CONFIG = {
  calc: { sectionKey: 'secMain', display: 'flex'  },
  box:  { sectionKey: 'secMain', display: 'flex'  },
  hist: { sectionKey: 'secHist', display: 'flex',  onEnter: () => renderHist()  },
  msj:  { sectionKey: 'secMsj',  display: 'block' },
  sped: { sectionKey: 'secSped', display: 'flex',  onEnter: () => resetSped()   },
};

const FKEY_TABS = { F8: 'sped', F9: 'calc', F10: 'box', F11: 'hist', F12: 'msj' };
const FKEY_OPS  = { F1: '+', F2: '-', F3: '*', F4: '/' };

const MSJ_CONFIG = {
  F1:  { text: 'SHORT',           bg: '#ff0000', color: '#fff' },
  F2:  { text: "It's OK",         bg: '#2ec4b6', color: '#fff' },
  F3:  { text: 'EXTRA',           bg: '#4361ee', color: '#fff' },
  F4:  { text: 'WAIT !!!',        bg: '#f72585', color: '#fff' },
  F5:  { text: 'NOT SCAN',        bg: '#6a0dad', color: '#fff' },
  F6:  { text: 'WHEELS',          bg: '#ffeb3b', color: '#000' },
  F7:  { text: 'CRATE',           bg: '#ff9f1c', color: '#fff' },
  F8:  { text: 'DOCUMENT ORDERS', bg: '#008080', color: '#fff' },
  F9:  { text: 'URGENT',          bg: '#c0ed38', color: '#000' },
  F10: { text: 'STOP',            bg: '#000000', color: '#fff', border: '10px solid red' },
};

/* ═══════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════ */
const haptic = () => navigator.vibrate?.(15);
const round1 = n => Math.round(n * 10)  / 10;
const round2 = n => Math.round(n * 100) / 100;

function safeEval(expr) {
  if (!/^[\d+\-*/.() ]+$/.test(String(expr))) return NaN;
  try {
    const result = Function('"use strict"; return (' + expr + ')')();
    return typeof result === 'number' && isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

function make(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showToast(ms = 2000) {
  el.copyToast.classList.add('show');
  setTimeout(() => el.copyToast.classList.remove('show'), ms);
}

function copyToClipboard(text) {
  const clean = String(text ?? '').replace(/^= /, '').trim();
  if (!clean) return;
  navigator.clipboard.writeText(clean).then(() => { haptic(); showToast(); }).catch(() => {});
}

/* ═══════════════════════════════════════════════════════
   PWA INSTALL BANNER & ONLINE STATUS
════════════════════════════════════════════════════════ */
const hideBanner = () => {
  el.installBanner.classList.remove('visible');
  state.deferredPrompt = null;
};

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredPrompt = e;
  el.installBanner.classList.add('visible');
});

el.installBtn.addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  const prompt = state.deferredPrompt;
  hideBanner();
  prompt.prompt();
  await prompt.userChoice;
});

el.dismissBtn.addEventListener('click', hideBanner);
window.addEventListener('appinstalled', hideBanner);

const updateOnlineStatus = () =>
  el.offlineBadge.classList.toggle('visible', !navigator.onLine);

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

/* ═══════════════════════════════════════════════════════
   TAB NAVIGATION
════════════════════════════════════════════════════════ */
const ALL_SECTION_KEYS = [...new Set(Object.values(TAB_CONFIG).map(c => c.sectionKey))];

function switchTab(t) {
  haptic();
  const cfg = TAB_CONFIG[t];
  if (!cfg) return;

  state.mode = t;

  document.querySelectorAll('.top-nav button').forEach(b => b.classList.remove('active'));
  $('tab-' + t)?.classList.add('active');

  ALL_SECTION_KEYS.forEach(key => { el[key].style.display = 'none'; });
  el[cfg.sectionKey].style.display = cfg.display;

  el.screen.classList.toggle('box-active', t === 'box');
  cfg.onEnter?.();

  el.display.textContent = t === 'box' ? state.boxVal : state.calcVal;
  adjustFontSize();

  if (el.spedCalcResult) el.spedCalcResult.style.display = 'none';
  if (el.spedPullResult) el.spedPullResult.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════
   CALCULATOR
════════════════════════════════════════════════════════ */
function press(v) {
  haptic();

  if (state.mode === 'box') {
    if (!isNaN(v) || v === '.') {
      if (v === '.' && state.boxVal.includes('.')) return;
      state.boxVal = (state.boxVal === '0' && v !== '.') ? v : state.boxVal + v;
      refresh();
    }
    return;
  }

  if (OPS.has(v)) {
    state.calcVal = OPS.has(state.calcVal.slice(-1))
      ? state.calcVal.slice(0, -1) + v
      : state.calcVal + v;
  } else {
    if (v === '.') {
      const lastNum = state.calcVal.split(/[\+\-\*\/]/).pop();
      if (lastNum.includes('.')) return;
    }
    state.calcVal = (state.calcVal === '0' && !isNaN(v))
      ? v
      : state.calcVal + v;
  }

  refresh();
}

function del() {
  haptic();
  if (state.mode === 'box') {
    state.boxVal = state.boxVal.slice(0, -1) || '0';
  } else {
    state.calcVal = state.calcVal.slice(0, -1) || '0';
  }
  refresh();
}

function cls() {
  haptic();
  if (state.mode === 'box') {
    state.boxVal = '0';
  } else {
    state.calcVal = '0';
  }
  refresh();
}

function evalCalc() {
  const result = safeEval(state.calcVal);
  return isNaN(result) ? 0 : round1(result);
}

function renderPreview(result) {
  el.preview.textContent =
    result && result.toString() !== state.calcVal ? '= ' + result : '';
}

function renderBoxDisplay(divisor) {
  const total = parseFloat(state.boxVal);
  el.miniTotal.textContent = state.boxVal;

  if (total > 0 && divisor > 0) {
    const full = Math.floor(total / divisor);
    const rest = round2(total % divisor);
    el.miniFull.textContent = full;
    el.miniRest.textContent = rest;

    let formula = '';
    if (state.calcVal.includes('*')) {
      const first = parseFloat(state.calcVal.split('*')[0]);
      if (first > 0) {
        formula = '(' + first + 'x' + Math.floor(rest / first) + ')+' + round2(rest % first);
      }
    }
    el.miniFormula.textContent = formula;
    return { total, divisor, full, rest };
  }

  el.miniFull.textContent    = '0';
  el.miniRest.textContent    = '0';
  el.miniFormula.textContent = '';
  return null;
}

function persist(result, boxData) {
  localStorage.setItem(STORAGE_KEY.calc, state.calcVal);
  if (OPS.has(state.calcVal.slice(-1))) return;

  let entry;
  if (state.pendingSpedInfo && boxData) {
    const { barcode, name, qty, formula } = state.pendingSpedInfo;
    entry = `${barcode} ${name} | Cant: ${qty} | ${formula} = ${boxData.full} [R: ${boxData.rest}]`;
    state.pendingSpedInfo = null;
  } else if (boxData) {
    entry = `Box: ${boxData.total} / (${state.calcVal}) = ${boxData.full} [R: ${boxData.rest}]`;
  } else {
    entry = `${state.calcVal} = ${result}`;
  }

  saveHist(entry);
}

function refresh() {
  const result  = evalCalc();
  renderPreview(result);
  const boxData = renderBoxDisplay(result);
  persist(result, boxData);

  if (state.mode !== 'box') {
    el.display.textContent = state.calcVal;
    adjustFontSize();
  }
}

/* ═══════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════ */
function saveHist(entry) {
  if (entry.length < 3) return;
  const lhs = entry.split('=')[0];
  if (state.history.length && state.history[0].split('=')[0] === lhs) {
    state.history[0] = entry;
  } else {
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.pop();
  }
  localStorage.setItem(STORAGE_KEY.hist, JSON.stringify(state.history));
}

function renderHist() {
  el.histContent.replaceChildren();

  if (!state.history.length) {
    el.histContent.appendChild(
      make('p', { textContent: 'No history', style: 'text-align:center;color:#999;margin-top:40px;' })
    );
    return;
  }

  const frag = document.createDocumentFragment();
  state.history.forEach(h =>
    frag.appendChild(make('div', { className: 'hist-item', textContent: h }))
  );
  el.histContent.appendChild(frag);
  el.histContent.scrollTop = 0;
}

function clearHist() {
  haptic();
  state.history = [];
  localStorage.removeItem(STORAGE_KEY.hist);
  renderHist();
}

/* ═══════════════════════════════════════════════════════
   FONT SIZE
════════════════════════════════════════════════════════ */
function adjustFontSize() {
  if (state.mode === 'box') { el.display.style.fontSize = '1.5rem'; return; }
  el.display.style.fontSize = '2.7rem';

  requestAnimationFrame(() => {
    if (el.display.scrollWidth <= el.display.clientWidth) return;

    let lo = 12, hi = 27;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      el.display.style.fontSize = (mid / 10) + 'rem';
      if (el.display.scrollWidth <= el.display.clientWidth) lo = mid;
      else hi = mid - 1;
    }
    el.display.style.fontSize = (lo / 10) + 'rem';
  });
}

/* ═══════════════════════════════════════════════════════
   MSJ OVERLAY
════════════════════════════════════════════════════════ */
function resizeText() {
  const maxPx = Math.max(window.innerWidth, window.innerHeight) * 1.5;
  let lo = 10, hi = Math.floor(maxPx);

  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    el.msjText.style.fontSize = mid + 'px';
    void el.msjText.offsetHeight;
    const fits =
      el.msjText.scrollHeight <= el.msjText.clientHeight &&
      el.msjText.scrollWidth  <= el.msjText.clientWidth;
    if (fits) lo = mid; else hi = mid - 1;
  }
  el.msjText.style.fontSize = lo + 'px';
}

function applyRotation() {
  const isVertical = (Math.abs(state.msjAngle) / 90) % 2 !== 0;
  el.msjText.style.setProperty('--angle', state.msjAngle + 'deg');
  el.msjText.style.setProperty('--tw', isVertical ? '100vh' : '100vw');
  el.msjText.style.setProperty('--th', isVertical ? '100vw' : '100vh');
  resizeText();
}

function showMsj(key) {
  const cfg = MSJ_CONFIG[key];
  if (!cfg) return;
  el.overlay.style.cssText = `background:${cfg.bg};color:${cfg.color};border:${cfg.border ?? 'none'};`;
  el.msjText.textContent   = cfg.text;
  el.overlay.classList.add('active');
  el.overlay.onclick = closeMsj;
  document.documentElement.requestFullscreen?.().catch(() => {});
  applyRotation();
}

function closeMsj() {
  el.overlay.classList.remove('active');
  document.fullscreenElement && document.exitFullscreen().catch(() => {});
}

function toggleRotation(e) {
  e?.stopPropagation();
  state.msjAngle -= 90;
  applyRotation();
}

window.addEventListener('resize', () => {
  if (el.overlay.classList.contains('active')) resizeText();
});

el.overlay.addEventListener('keydown', e => {
  if (/^F\d+$/.test(e.key)) e.preventDefault();
  if (e.key === 'Escape')   { closeMsj(); return; }
  if (/^[0-9]$/.test(e.key)) {
    el.msjText.textContent += el.msjText.textContent.includes(':') ? e.key : ': ' + e.key;
    resizeText();
  }
  if (e.key === 'Backspace') { el.msjText.textContent = el.msjText.textContent.slice(0, -1); resizeText(); }
});

/* ═══════════════════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════════════════════ */
window.addEventListener('keydown', e => {
  const { key } = e;

  if (el.overlay.classList.contains('active')) return;

  if (FKEY_TABS[key]) { e.preventDefault(); switchTab(FKEY_TABS[key]); return; }
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (FKEY_OPS[key])                           { e.preventDefault(); press(FKEY_OPS[key]); return; }
  if (!isNaN(key) || key === '.')              { press(key);          return; }
  if (OPS.has(key))                            { press(key);          return; }
  if (key === 'Backspace' || key === 'Delete') { e.preventDefault(); del(); return; }
  if (key === 'Escape'    || key === 'End')    { e.preventDefault(); cls(); return; }
});

/* ═══════════════════════════════════════════════════════
   SPED — product search, formula selection, Pull Forward
════════════════════════════════════════════════════════ */
const spedError = (errEl, msg) => {
  errEl.textContent   = msg ?? '';
  errEl.style.display = msg ? 'block' : 'none';
};

function resetSped() {
  el.spedBarcode.value           = '';
  el.spedQty.value               = '';
  el.spedProductName.textContent = '';
  el.spedSuggestions.replaceChildren();
  el.spedProductInfo.replaceChildren();
  if (el.spedProductInfoPull) el.spedProductInfoPull.replaceChildren();
  spedError(el.spedError1);
  spedError(el.spedError2);
  if (el.pullErrorStep3) spedError(el.pullErrorStep3, '');
  el.spedStep1.style.display = 'flex';
  el.spedStep2.style.display = 'none';
  if (el.spedStep3) el.spedStep3.style.display = 'none';
  if (el.spedCalcResult) el.spedCalcResult.style.display = 'none';
  if (el.spedPullResult) el.spedPullResult.style.display = 'none';
  state.selectedProduct = null;
  state.pendingSpedInfo = null;
  state.spedOriginalCalc = null;
  // Limpiar también el campo pullQty al reiniciar todo el proceso
  if (el.pullQty) el.pullQty.value = '';
  setTimeout(() => el.spedBarcode.focus(), 100);
}

function cancelSped() { haptic(); switchTab('calc'); }

function nextSped() {
  const barcode = el.spedBarcode.value.trim();
  spedError(el.spedError1);
  if (!barcode) { spedError(el.spedError1, 'Introduce un código de barras.'); return; }

  const product = productsData.find(p => String(p.id).trim() === barcode);
  if (!product) { spedError(el.spedError1, 'Producto no encontrado: ' + barcode); return; }

  state.selectedProduct      = product;
  el.spedStep1.style.display = 'none';
  el.spedStep2.style.display = 'flex';
  el.spedQty.focus();
  renderSpedProductInfo();
}

function renderSpedProductInfo() {
  const { name = 'Sin nombre', values = [] } = state.selectedProduct ?? {};
  el.spedProductInfo.replaceChildren(
    make('h4', { textContent: name }),
    values.length
      ? make('div', { className: 'sped-formulas' },
          ...values.map(v => make('span', { className: 'sped-formula-tag', textContent: v }))
        )
      : make('p', {
          textContent: 'No defined formulas',
          style: 'color:#999;font-size:0.9rem;margin:5px 0 0 0;',
        })
  );
  if (el.spedProductInfoPull) {
    el.spedProductInfoPull.replaceChildren(
      make('h4', { textContent: name }),
      values.length
        ? make('div', { className: 'sped-formulas' },
            ...values.map(v => make('span', { className: 'sped-formula-tag', textContent: v }))
          )
        : make('p', {
            textContent: 'No defined formulas',
            style: 'color:#999;font-size:0.9rem;margin:5px 0 0 0;',
          })
    );
  }
}

function backSped() {
  el.spedStep2.style.display = 'none';
  el.spedStep1.style.display = 'flex';
  spedError(el.spedError2);
  el.spedBarcode.focus();
}

function pickBestFormula(values, qty) {
  let bestFormula = null;
  let bestTotalBoxes = Infinity;
  let bestDivisor = Infinity;
  for (const val of values) {
    const divisor = safeEval(val);
    if (isNaN(divisor) || divisor <= 0) continue;
    const totalBoxes = Math.ceil(qty / divisor);
    if (totalBoxes < bestTotalBoxes ||
        (totalBoxes === bestTotalBoxes && divisor < bestDivisor)) {
      bestFormula = val;
      bestTotalBoxes = totalBoxes;
      bestDivisor = divisor;
    }
  }
  return bestFormula;
}

function computeProductCalculation(formula, qty) {
  const divisor = safeEval(formula);
  if (isNaN(divisor) || divisor <= 0) return null;
  const full = Math.floor(qty / divisor);
  const rem = round2(qty % divisor);
  return { divisor, full, rem };
}

// ⭐ PROCESAR CALCULATE (CON ACTUALIZACIÓN DE CALCU Y BOX)
function processSped() {
  spedError(el.spedError2);
  const qty = parseFloat(el.spedQty.value);

  if (!state.selectedProduct) { spedError(el.spedError2, 'Error interno: no hay producto seleccionado.'); return; }
  if (isNaN(qty) || qty <= 0) { spedError(el.spedError2, 'Introduce una cantidad válida.'); return; }

  const best = pickBestFormula(state.selectedProduct.values, qty);
  if (!best) {
    spedError(el.spedError2, 'No se pudo calcular una disposición.');
    return;
  }

  const calc = computeProductCalculation(best, qty);
  if (!calc) {
    spedError(el.spedError2, 'La fórmula no es válida.');
    return;
  }

  // ✅ Restaurar funcionalidad original: actualizar CALCU y BOX
  state.calcVal = best;
  state.boxVal  = qty.toString();
  refresh();  // esto actualiza display, preview, mini displays y guarda en localStorage

  // Guardar para Pull Forward
  state.spedOriginalCalc = {
    product: state.selectedProduct,
    totalUnits: qty,
    formula: best,
    divisor: calc.divisor,
    full: calc.full,
    rem: calc.rem
  };

  // Mostrar ventana de resultados (adicional)
  const remFormula = getRemainderFormula(best, calc.rem);
  document.getElementById('calc-rem-formula').innerText = remFormula ? `${remFormula}` : '';
  document.getElementById('calc-product-name').innerText = state.selectedProduct.name || state.selectedProduct.id;
  const formulaResult = safeEval(best);
  document.getElementById('calc-formula').innerText = `${best} = ${formulaResult}`;

  document.getElementById('calc-total-units').innerText = qty;
  document.getElementById('calc-full').innerText = calc.full;
  document.getElementById('calc-rem').innerText = calc.rem;

  el.spedStep2.style.display = 'none';
  el.spedCalcResult.style.display = 'flex';
}

// PULL FORWARD
function pullForward() {
  const qty = parseFloat(el.spedQty.value);
  if (!state.selectedProduct) {
    spedError(el.spedError2, 'Primero completa el paso del producto.');
    return;
  }
  if (isNaN(qty) || qty <= 0) {
    spedError(el.spedError2, 'Debes ingresar una cantidad válida antes de usar Pull Forward.');
    return;
  }

  // Se elimina la condición "if (!state.spedOriginalCalc)" para forzar 
  // la actualización de los datos base con el valor actual del input
  const best = pickBestFormula(state.selectedProduct.values, qty);
  if (!best) {
    spedError(el.spedError2, 'No hay fórmula disponible para este producto.');
    return;
  }
  const calc = computeProductCalculation(best, qty);
  if (!calc) {
    spedError(el.spedError2, 'Fórmula inválida.');
    return;
  }

  state.spedOriginalCalc = {
    product: state.selectedProduct,
    totalUnits: qty,
    formula: best,
    divisor: calc.divisor,
    full: calc.full,
    rem: calc.rem
  };

  spedError(el.spedError2, '');
  el.spedStep2.style.display = 'none';
  el.spedStep3.style.display = 'flex';
  if (el.pullErrorStep3) el.pullErrorStep3.style.display = 'none';
  renderSpedProductInfo();
  if (el.pullQty) el.pullQty.focus();
}

function backFromPull() {
  el.spedStep3.style.display = 'none';
  el.spedStep2.style.display = 'flex';
  if (el.pullErrorStep3) el.pullErrorStep3.style.display = 'none';
  // Limpiar campo pull quantity al regresar a TOTAL AMOUNT
  if (el.pullQty) el.pullQty.value = '';
}

function processPullForward() {
  const pullQtyVal = parseFloat(el.pullQty.value);
  
  if (!state.spedOriginalCalc) {
    if (el.pullErrorStep3) {
      el.pullErrorStep3.textContent = 'There is no base calculation. Go back and press CALCULATE first.';
      el.pullErrorStep3.style.display = 'block';
    }
    return;
  }
  
  if (isNaN(pullQtyVal) || pullQtyVal <= 0) {
    if (el.pullErrorStep3) {
      el.pullErrorStep3.textContent = 'Enter a valid amount for the Pull Forward.';
      el.pullErrorStep3.style.display = 'block';
    }
    return;
  }

  const { product, totalUnits, formula: originalFormula, full: originalFull, rem: originalRem } = state.spedOriginalCalc;

  // NUEVO: Calcular la mejor fórmula específicamente para la cantidad de Pull Forward
  const pullFormula = pickBestFormula(product.values, pullQtyVal);
  
  if (!pullFormula) {
    if (el.pullErrorStep3) {
      el.pullErrorStep3.textContent = 'A valid formula for the Pull could not be found.';
      el.pullErrorStep3.style.display = 'block';
    }
    return;
  }

  const pullCalc = computeProductCalculation(pullFormula, pullQtyVal);
  
  if (!pullCalc) {
    if (el.pullErrorStep3) {
      el.pullErrorStep3.textContent = 'Error calculating with Pull formula.';
      el.pullErrorStep3.style.display = 'block';
    }
    return;
  }

  // Generar fórmulas de residuo usando sus respectivas fórmulas independientes
  const todayRemFormula = getRemainderFormula(originalFormula, originalRem);
  const pullRemFormula = getRemainderFormula(pullFormula, pullCalc.rem);

  document.getElementById('pull-today-rem-formula').innerText = todayRemFormula ? `${todayRemFormula}` : '';
  document.getElementById('pull-pull-rem-formula').innerText = pullRemFormula ? `${pullRemFormula}` : '';

  // Datos TODAY
  document.getElementById('pull-today-product').innerText = product.name || product.id;
  // ✅ Mostrar fórmula evaluada (ej: 3*4 = 12)
  document.getElementById('pull-today-formula').innerText = `${originalFormula} = ${safeEval(originalFormula)}`;
  document.getElementById('pull-today-units').innerText = totalUnits;
  document.getElementById('pull-today-full').innerText = originalFull;
  document.getElementById('pull-today-rem').innerText = originalRem;

  // Datos PULL (Ahora independientes)
  document.getElementById('pull-pull-product').innerText = product.name || product.id;
  // ✅ Mostrar fórmula evaluada
  document.getElementById('pull-pull-formula').innerText = `${pullFormula} = ${safeEval(pullFormula)}`;
  document.getElementById('pull-pull-units').innerText = pullQtyVal;
  document.getElementById('pull-pull-full').innerText = pullCalc.full;
  document.getElementById('pull-pull-rem').innerText = pullCalc.rem;

  el.spedStep3.style.display = 'none';
  el.spedPullResult.style.display = 'flex';
}

// Eventos de búsqueda y sugerencias
el.spedBarcode.addEventListener('keydown', e => { if (e.key === 'Enter') nextSped(); });
el.spedQty.addEventListener('keydown', e => { if (e.key === 'Enter') processSped(); });

el.spedBarcode.addEventListener('input', () => {
  const query = el.spedBarcode.value.trim();
  el.spedSuggestions.replaceChildren();
  el.spedProductName.textContent = '';
  if (!query) return;

  const exact = productsData.find(p => String(p.id).trim() === query);
  if (exact) { copyToClipboard(exact.id); nextSped(); return; }

  const matches = productsData.filter(p => p.id.includes(query)).slice(0, 20);
  const frag = document.createDocumentFragment();
  matches.forEach(match => {
    const div = make('div', {
      className:   'suggestion-item',
      textContent: match.id + (match.name ? ' – ' + match.name : ''),
    });
    div.addEventListener('click', () => {
      el.spedBarcode.value           = match.id;
      el.spedProductName.textContent = match.name ?? '';
      el.spedSuggestions.replaceChildren();
      copyToClipboard(match.id);
      nextSped();
    });
    frag.appendChild(div);
  });
  el.spedSuggestions.appendChild(frag);
});

document.addEventListener('click', e => {
  if (!el.spedBarcode.contains(e.target) && !el.spedSuggestions.contains(e.target)) {
    el.spedSuggestions.replaceChildren();
  }
});

/* ═══════════════════════════════════════════════════════
   FUNCIONES DE NAVEGACIÓN ENTRE RESULTADOS
════════════════════════════════════════════════════════ */
function getRemainderFormula(formula, remainder) {
  if (formula.includes('*')) {
    const firstFactor = parseFloat(formula.split('*')[0]);
    if (!isNaN(firstFactor) && firstFactor > 0 && remainder > 0) {
      const extraBoxes = Math.floor(remainder / firstFactor);
      const remaining = round2(remainder % firstFactor);
      return `(${firstFactor} x ${extraBoxes}) + ${remaining}`;
    }
  }
  return remainder > 0 ? `Remainder: ${remainder}` : '';
}

function backToStep2FromCalcResult() {
  el.spedCalcResult.style.display = 'none';
  el.spedStep2.style.display = 'flex';
  el.spedQty.focus();
  // Limpiar pullQty porque se vuelve a la pantalla de cantidad total desde el resultado
  if (el.pullQty) el.pullQty.value = '';
}

function goToPullForwardFromCalcResult() {
  pullForward();
}

function backToStep3FromPullResult() {
  el.spedPullResult.style.display = 'none';
  el.spedStep3.style.display = 'flex';
  if (el.pullQty) el.pullQty.focus();
  // NO se limpia pullQty (se conserva)
}

function backToStep2FromPullResult() {
  el.spedPullResult.style.display = 'none';
  el.spedStep2.style.display = 'flex';
  el.spedQty.focus();
  // NO se limpia pullQty (según tu petición)
}

/* ═══════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  el.display.textContent = state.calcVal;
  el.cacheWatermark.textContent = SW_CACHE_NAME;
  refresh();
});

/* Exponer funciones globales */
Object.assign(window, {
  switchTab, press, del, cls,
  copyToClipboard, clearHist,
  showMsj, toggleRotation,
  cancelSped, nextSped, backSped, processSped,
  pasteClipboard, resetSped,
  pullForward, backFromPull, processPullForward,
  backToStep2FromCalcResult, goToPullForwardFromCalcResult,
  backToStep3FromPullResult, backToStep2FromPullResult
});

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    el.spedBarcode.value = text.trim();
    const exact = productsData.find(p => String(p.id).trim() === text.trim());
    if (exact) {
      copyToClipboard(exact.id);
      nextSped();
    }
  } catch { /* silencioso */ }
}