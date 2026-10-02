/* ============================================================
   board-app.js — приложение: инструменты, панель, i18n,
   модальное окно акцента, обработка событий.
   ============================================================ */
(function(){
'use strict';

const boardEl     = document.getElementById('board');
const world       = document.getElementById('world');
const previewPath = document.getElementById('preview-path');
const softBlur    = document.querySelector('#soft-blur feGaussianBlur');
const settingsEl  = document.getElementById('settings');
const hintEl      = document.getElementById('hint');
const zValEl      = document.getElementById('z-val');

const core = new window.BoardCore({ boardEl, world, previewPath, softBlur });

/* ============================================================
   СОСТОЯНИЕ
============================================================ */
const THEME_DEFAULTS = {
  light: { brush:'#1b1f2a', text:'#1b1f2a' },
  dark:  { brush:'#ffffff', text:'#ffffff' }
};
const DEFAULT_ACCENT = '#6d7dff';

const app = {
  tool: 'brush',
  lang: 'ru',
  accentColor: DEFAULT_ACCENT,
  textStyle: {
    fontSize: 36,
    fontFamily: "Inter, system-ui, sans-serif",
    color: '#1b1f2a',
    bold: false,
    italic: false
  },
  boardTheme: 'light',
  gridStyle: 'dots'
};

const PALETTE = [
  '#000000','#374151','#6b7280','#cbd5e1',
  '#ffffff','#ef4444','#f97316','#f59e0b',
  '#10b981','#06b6d4','#3b82f6','#8b5cf6',
  '#ec4899','#a3e635','#14b8a6','#a78bfa'
];

const ACCENT_PRESETS = [
  '#6d7dff','#8b5cf6','#a855f7','#ec4899','#f43f5e','#ef4444',
  '#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981',
  '#14b8a6','#06b6d4','#0ea5e9','#3b82f6','#64748b','#1e293b'
];

/* ============================================================
   АКЦЕНТ — HSL-математика для accent2 и rgb
============================================================ */
function hexToHsl(hex){
  hex = (hex||'').replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0,2),16)/255;
  const g = parseInt(hex.slice(2,4),16)/255;
  const b = parseInt(hex.slice(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max+min)/2;
  if (max !== min){
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h *= 60;
  }
  return [h, s*100, l*100];
}
function hslToHex(h, s, l){
  h = ((h % 360)+360) % 360;
  s = Math.max(0, Math.min(100, s))/100;
  l = Math.max(0, Math.min(100, l))/100;
  const c = (1 - Math.abs(2*l-1)) * s;
  const x = c * (1 - Math.abs(((h/60)%2)-1));
  const m = l - c/2;
  let r,g,b;
  if (h<60){ r=c; g=x; b=0; }
  else if (h<120){ r=x; g=c; b=0; }
  else if (h<180){ r=0; g=c; b=x; }
  else if (h<240){ r=0; g=x; b=c; }
  else if (h<300){ r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
  return '#' + toHex(r)+toHex(g)+toHex(b);
}
function hexToRgbStr(hex){
  hex = (hex||'').replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  return `${r}, ${g}, ${b}`;
}
function deriveAccent2(hex){
  const [h,s,l] = hexToHsl(hex);
  return hslToHex(h + 28, Math.min(100, s+6), Math.min(78, l+8));
}
function isValidHex(v){
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}
function applyAccent(color){
  if (!isValidHex(color)) return;
  app.accentColor = color;
  const c2 = deriveAccent2(color);
  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent2', c2);
  root.style.setProperty('--accent-rgb', hexToRgbStr(color));
}

/* ============================================================
   PERSISTENCE
============================================================ */
const STORAGE_KEY = 'myboard_bmc_v1';
let saveTimer = null;
let isLoading = false;

function saveState(){
  if (isLoading) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = {
        v: 1, ts: Date.now(),
        objects: core.objects.map(o => core.serializeOne(o)),
        pan: { x: core.panX, y: core.panY },
        zoom: core.zoom,
        uid: core.uid,
        app: {
          lang: app.lang,
          accentColor: app.accentColor,
          boardTheme: app.boardTheme,
          gridStyle: app.gridStyle,
          tool: app.tool,
          brush: { ...core.brush },
          textStyle: { ...app.textStyle }
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch(err){ console.warn('Save failed:', err); }
  }, 250);
}
function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch(err){ console.warn('Load failed:', err); return null; }
}

/* ============================================================
   i18n
============================================================ */
const I18N = {
  ru: {
    brush:'Кисть', text:'Текст', clear:'Очистить',
    size:'Размер', opacity:'Непрозрачность', softness:'Мягкость', color:'Цвет',
    fontSize:'Размер', fontFamily:'Шрифт', style:'Стиль', textColor:'Цвет текста',
    palette:'Палитра', board:'Доска', grid:'Сетка',
    light:'Светлая', dark:'Тёмная',
    dots:'Точки', lines:'Линии', none:'Нет',
    actions:'Действия',
    duplicate:'Дублировать', front:'Вперёд', back:'Назад', del:'Удалить',
    accent_title:'Акцент приложения',
    accent_preview:'My Board BMC',
    accent_custom:'Свой цвет',
    accent_presets:'Готовые пресеты',
    accent_reset:'По умолчанию',
    accent_done:'Готово',
    tip_select:'Выбрать / двигать (V)',
    tip_brush:'Кисть (B)',
    tip_eraser:'Ластик (E)',
    tip_text:'Текст (T)',
    tip_image:'Вставить картинку',
    tip_accent:'Настроить акцентный цвет',
    tip_undo:'Отменить (Ctrl+Z)',
    tip_redo:'Повторить (Ctrl+Shift+Z)',
    tip_clear:'Очистить доску',
    hint:'<kbd>Колесо</kbd> — зум · <kbd>Пробел</kbd>+ЛКМ / <kbd>СКМ</kbd> — двигать · <kbd>Ctrl</kbd>+<kbd>V</kbd> — картинка · <kbd>Ctrl</kbd>+<kbd>D</kbd> — дубликат · Двойной клик — редактировать'
  },
  en: {
    brush:'Brush', text:'Text', clear:'Clear',
    size:'Size', opacity:'Opacity', softness:'Softness', color:'Color',
    fontSize:'Size', fontFamily:'Font', style:'Style', textColor:'Text color',
    palette:'Palette', board:'Board', grid:'Grid',
    light:'Light', dark:'Dark',
    dots:'Dots', lines:'Lines', none:'None',
    actions:'Actions',
    duplicate:'Duplicate', front:'Front', back:'Back', del:'Delete',
    accent_title:'App accent',
    accent_preview:'My Board BMC',
    accent_custom:'Custom color',
    accent_presets:'Presets',
    accent_reset:'Reset',
    accent_done:'Done',
    tip_select:'Select / move (V)',
    tip_brush:'Brush (B)',
    tip_eraser:'Eraser (E)',
    tip_text:'Text (T)',
    tip_image:'Insert image',
    tip_accent:'Customize accent color',
    tip_undo:'Undo (Ctrl+Z)',
    tip_redo:'Redo (Ctrl+Shift+Z)',
    tip_clear:'Clear board',
    hint:'<kbd>Wheel</kbd> — zoom · <kbd>Space</kbd>+LMB / <kbd>MMB</kbd> — pan · <kbd>Ctrl</kbd>+<kbd>V</kbd> — paste · <kbd>Ctrl</kbd>+<kbd>D</kbd> — duplicate · Double-click to edit'
  },
  uk: {
    brush:'Пензель', text:'Текст', clear:'Очистити',
    size:'Розмір', opacity:'Прозорість', softness:"М'якість", color:'Колір',
    fontSize:'Розмір', fontFamily:'Шрифт', style:'Стиль', textColor:'Колір тексту',
    palette:'Палітра', board:'Дошка', grid:'Сітка',
    light:'Світла', dark:'Темна',
    dots:'Точки', lines:'Лінії', none:'Немає',
    actions:'Дії',
    duplicate:'Дублювати', front:'Вперед', back:'Назад', del:'Видалити',
    accent_title:'Акцент застосунку',
    accent_preview:'My Board BMC',
    accent_custom:'Власний колір',
    accent_presets:'Пресети',
    accent_reset:'За замовчуванням',
    accent_done:'Готово',
    tip_select:'Вибрати / рухати (V)',
    tip_brush:'Пензель (B)',
    tip_eraser:'Гумка (E)',
    tip_text:'Текст (T)',
    tip_image:'Вставити зображення',
    tip_accent:'Налаштувати акцент',
    tip_undo:'Скасувати (Ctrl+Z)',
    tip_redo:'Повторити (Ctrl+Shift+Z)',
    tip_clear:'Очистити дошку',
    hint:'<kbd>Колесо</kbd> — зум · <kbd>Пробіл</kbd>+ЛКМ / <kbd>СКМ</kbd> — рухати · <kbd>Ctrl</kbd>+<kbd>V</kbd> — вставити · <kbd>Ctrl</kbd>+<kbd>D</kbd> — дублікат · Подвійний клік — редагувати'
  }
};
const t = k => (I18N[app.lang] && I18N[app.lang][k]) || k;

/* ============================================================
   DOM-хелпер
============================================================ */
function el(tag, props, children){
  const e = document.createElement(tag);
  if (props) for (const k in props){
    if (k === 'style') Object.assign(e.style, props[k]);
    else if (k === 'html') e.innerHTML = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else e.setAttribute(k, props[k]);
  }
  (children || []).forEach(c => e.appendChild(c));
  return e;
}

/* ============================================================
   SETTINGS PANEL
============================================================ */
function renderSettings(){
  settingsEl.innerHTML = '';
  if (app.tool === 'eraser'){ settingsEl.style.display='none'; return; }
  settingsEl.style.display = 'flex';

  const showBrush   = app.tool === 'brush';
  const showText    = app.tool === 'text' || (core.selected && core.selected.type === 'text');
  const showActions = !!core.selected;

  /* КИСТЬ */
  if (showBrush){
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'group-title', html: t('brush')})
    ]));

    const vSize = el('span', {class:'val', html:String(core.brush.size)});
    const rSize = el('input', {type:'range', min:'1', max:'120', value:String(core.brush.size)});
    rSize.addEventListener('input', () => {
      core.brush.size = +rSize.value;
      vSize.textContent = rSize.value;
      updateSliderFill(rSize);
      saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('size')}), vSize]), rSize
    ]));

    const vOp = el('span', {class:'val', html:Math.round(core.brush.opacity*100)+'%'});
    const rOp = el('input', {type:'range', min:'5', max:'100', value:String(Math.round(core.brush.opacity*100))});
    rOp.addEventListener('input', () => {
      core.brush.opacity = +rOp.value / 100;
      vOp.textContent = rOp.value + '%';
      updateSliderFill(rOp);
      saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('opacity')}), vOp]), rOp
    ]));

    const vSoft = el('span', {class:'val', html:String(core.brush.softness)});
    const rSoft = el('input', {type:'range', min:'0', max:'60', value:String(core.brush.softness)});
    rSoft.addEventListener('input', () => {
      core.brush.softness = +rSoft.value;
      vSoft.textContent = rSoft.value;
      updateSliderFill(rSoft);
      saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('softness')}), vSoft]), rSoft
    ]));

    const colorInput = el('input', {type:'color', value:core.brush.color});
    colorInput.addEventListener('input', () => {
      core.brush.color = colorInput.value;
      saveState();
      const cur = core.brush.color.toLowerCase();
      settingsEl.querySelectorAll('.swatch[data-c]').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.c === cur);
      });
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('color')}), colorInput]),
      el('div', {class:'group-title', html:t('palette')}),
      buildPalette(core.brush.color, c => {
        core.brush.color = c; colorInput.value = c;
        saveState(); renderSettings();
      })
    ]));
  }

  /* ТЕКСТ */
  if (showText){
    const style = (core.selected && core.selected.type === 'text')
      ? { fontSize:core.selected.fontSize, fontFamily:core.selected.fontFamily,
          color:core.selected.color, bold:!!core.selected.bold, italic:!!core.selected.italic }
      : app.textStyle;

    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'group-title', html: t('text')})
    ]));

    const vFs = el('span', {class:'val', html:String(Math.round(style.fontSize))});
    const rFs = el('input', {type:'range', min:'8', max:'200', value:String(Math.round(style.fontSize))});
    rFs.addEventListener('input', () => {
      app.textStyle.fontSize = +rFs.value;
      vFs.textContent = rFs.value;
      updateSliderFill(rFs);
      applyTextToSelection(); saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('fontSize')}), vFs]), rFs
    ]));

    const sFont = el('select');
    [
      ['Inter, system-ui, sans-serif', 'Sans (Inter)'],
      ["Georgia, 'Times New Roman', serif", 'Serif (Georgia)'],
      ["'Courier New', monospace", 'Mono'],
      ["'Comic Sans MS', 'Segoe Script', cursive", 'Cursive'],
      ["Impact, 'Arial Black', sans-serif", 'Impact']
    ].forEach(([v, label]) => {
      const opt = el('option', {value:v, html:label});
      if (v === style.fontFamily) opt.selected = true;
      sFont.appendChild(opt);
    });
    sFont.addEventListener('change', () => {
      app.textStyle.fontFamily = sFont.value;
      applyTextToSelection(); saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('fontFamily')})]), sFont
    ]));

    const bBold = el('button', {class: style.bold ? 'on' : '', html:'<b>B</b>'});
    bBold.addEventListener('click', () => {
      app.textStyle.bold = !app.textStyle.bold;
      bBold.classList.toggle('on', app.textStyle.bold);
      applyTextToSelection(); saveState();
    });
    const bItal = el('button', {class: style.italic ? 'on' : '', html:'<i>I</i>'});
    bItal.addEventListener('click', () => {
      app.textStyle.italic = !app.textStyle.italic;
      bItal.classList.toggle('on', app.textStyle.italic);
      applyTextToSelection(); saveState();
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('style')})]),
      el('div', {class:'btn-group'}, [bBold, bItal])
    ]));

    const colorInput = el('input', {type:'color', value:style.color});
    colorInput.addEventListener('input', () => {
      app.textStyle.color = colorInput.value;
      applyTextToSelection(); saveState();
      const cur = colorInput.value.toLowerCase();
      settingsEl.querySelectorAll('.swatch[data-c]').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.c === cur);
      });
    });
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'row'}, [el('label', {html:t('textColor')}), colorInput]),
      el('div', {class:'group-title', html:t('palette')}),
      buildPalette(style.color, c => {
        app.textStyle.color = c; colorInput.value = c;
        applyTextToSelection(); saveState(); renderSettings();
      })
    ]));
  }

  /* ДЕЙСТВИЯ */
  if (showActions){
    const mk = (label, cls, fn) => {
      const b = el('button', {class:'action-btn' + (cls ? ' '+cls : ''), html: label});
      b.addEventListener('click', fn);
      return b;
    };
    settingsEl.appendChild(el('div', {class:'group'}, [
      el('div', {class:'group-title', html: t('actions')}),
      el('div', {class:'action-grid'}, [
        mk(t('duplicate'), '', () => { core.pushHistory(); core.duplicate(core.selected); }),
        mk(t('del'), 'danger', () => { core.pushHistory(); core.removeObject(core.selected); }),
        mk(t('front'), '', () => { core.bringToFront(core.selected); saveState(); }),
        mk(t('back'), '', () => { core.sendToBack(core.selected); saveState(); })
      ])
    ]));
  }

  /* ДОСКА */
  settingsEl.appendChild(buildBoardGroup());

  // обновить заливку слайдеров после рендера
  settingsEl.querySelectorAll('input[type=range]').forEach(updateSliderFill);
}

function updateSliderFill(rangeEl){
  const min = +rangeEl.min || 0, max = +rangeEl.max || 100;
  const val = +rangeEl.value;
  const p = ((val - min) / (max - min)) * 100;
  rangeEl.style.background =
    `linear-gradient(90deg,
      rgba(var(--accent-rgb),.7) 0%,
      rgba(var(--accent-rgb),.7) ${p}%,
      rgba(255,255,255,.08) ${p}%,
      rgba(255,255,255,.08) 100%)`;
}

function buildPalette(current, onPick){
  const wrap = el('div', {class:'palette'});
  const cur = (current || '').toLowerCase();
  PALETTE.forEach(c => {
    const sw = el('div', {class:'swatch'});
    sw.dataset.c = c.toLowerCase();
    sw.style.background = c;
    if (c.toLowerCase() === cur) sw.classList.add('active');
    sw.addEventListener('click', () => onPick(c));
    wrap.appendChild(sw);
  });
  return wrap;
}

function buildBoardGroup(){
  const g = el('div', {class:'group'});
  g.appendChild(el('div', {class:'group-title', html: t('board')}));

  const bLight = el('button', {class:'theme-btn'+(app.boardTheme==='light'?' on':''), html:t('light')});
  const bDark  = el('button', {class:'theme-btn'+(app.boardTheme==='dark'?' on':''),  html:t('dark')});
  bLight.addEventListener('click', () => switchTheme('light'));
  bDark .addEventListener('click', () => switchTheme('dark'));
  g.appendChild(el('div', {class:'theme-row'}, [bLight, bDark]));

  g.appendChild(el('div', {class:'group-title', style:{marginTop:'8px'}, html:t('grid')}));
  const gDots  = el('button', {class:'theme-btn'+(app.gridStyle==='dots'?' on':''),  html:t('dots')});
  const gLines = el('button', {class:'theme-btn'+(app.gridStyle==='lines'?' on':''), html:t('lines')});
  const gNone  = el('button', {class:'theme-btn'+(app.gridStyle==='none'?' on':''),  html:t('none')});
  gDots .addEventListener('click', () => { app.gridStyle='dots';  applyGrid(); saveState(); renderSettings(); });
  gLines.addEventListener('click', () => { app.gridStyle='lines'; applyGrid(); saveState(); renderSettings(); });
  gNone .addEventListener('click', () => { app.gridStyle='none';  applyGrid(); saveState(); renderSettings(); });
  g.appendChild(el('div', {class:'theme-row'}, [gDots, gLines, gNone]));
  return g;
}

function applyThemeVisual(){ boardEl.dataset.theme = app.boardTheme; }
function applyGrid(){ boardEl.dataset.grid = app.gridStyle; }

function switchTheme(theme){
  app.boardTheme = theme;
  applyThemeVisual();
  const def = THEME_DEFAULTS[theme];
  core.brush.color = def.brush;
  app.textStyle.color = def.text;
  if (core.selected && core.selected.type === 'text'){
    core.selected.color = def.text;
    core.applyTextStyle(core.selected);
  }
  saveState();
  renderSettings();
}

function applyTextToSelection(){
  const obj = core.selected;
  if (!obj || obj.type !== 'text') return;
  obj.fontSize   = app.textStyle.fontSize;
  obj.fontFamily = app.textStyle.fontFamily;
  obj.color      = app.textStyle.color;
  obj.bold       = app.textStyle.bold;
  obj.italic     = app.textStyle.italic;
  core.applyTextStyle(obj);
  obj.h = obj.el.offsetHeight;
  core.applyTransform(obj);
}

/* ============================================================
   ACCENT MODAL
============================================================ */
const accentModal   = document.getElementById('accent-modal');
const accentColorIn = document.getElementById('accent-color-input');
const accentHexIn   = document.getElementById('accent-hex-input');
const accentPresets = document.getElementById('accent-presets');

function buildAccentPresets(){
  accentPresets.innerHTML = '';
  ACCENT_PRESETS.forEach(c => {
    const p = el('div', {class:'accent-preset'});
    p.style.background = c;
    p.dataset.c = c.toLowerCase();
    if (c.toLowerCase() === app.accentColor.toLowerCase()) p.classList.add('active');
    p.addEventListener('click', () => {
      applyAccent(c);
      accentColorIn.value = c;
      accentHexIn.value = c;
      refreshAccentPresets();
      saveState();
    });
    accentPresets.appendChild(p);
  });
}
function refreshAccentPresets(){
  const cur = app.accentColor.toLowerCase();
  accentPresets.querySelectorAll('.accent-preset').forEach(p => {
    p.classList.toggle('active', p.dataset.c === cur);
  });
}
function openAccentModal(){
  accentColorIn.value = app.accentColor;
  accentHexIn.value = app.accentColor;
  refreshAccentPresets();
  accentModal.classList.add('show');
}
function closeAccentModal(){
  accentModal.classList.remove('show');
}

document.getElementById('btn-accent').addEventListener('click', openAccentModal);
document.getElementById('accent-close').addEventListener('click', closeAccentModal);
document.getElementById('accent-done').addEventListener('click', closeAccentModal);
document.getElementById('accent-reset').addEventListener('click', () => {
  applyAccent(DEFAULT_ACCENT);
  accentColorIn.value = DEFAULT_ACCENT;
  accentHexIn.value = DEFAULT_ACCENT;
  refreshAccentPresets();
  saveState();
});
accentColorIn.addEventListener('input', () => {
  applyAccent(accentColorIn.value);
  accentHexIn.value = accentColorIn.value;
  refreshAccentPresets();
  saveState();
});
accentHexIn.addEventListener('input', () => {
  let v = accentHexIn.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (isValidHex(v)){
    applyAccent(v);
    accentColorIn.value = v.length === 4
      ? '#' + v.slice(1).split('').map(c => c + c).join('')
      : v;
    refreshAccentPresets();
    saveState();
  }
});
accentModal.addEventListener('pointerdown', e => {
  if (e.target === accentModal) closeAccentModal();
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && accentModal.classList.contains('show')){
    closeAccentModal();
  }
});

/* ============================================================
   ПАН
============================================================ */
let spaceHeld = false;
let isPanning = false, panStart = null;
let drag = null;

function updateCursor(){
  if (isPanning){ boardEl.style.cursor = 'grabbing'; return; }
  if (spaceHeld){ boardEl.style.cursor = 'grab'; return; }
  boardEl.style.cursor =
    (app.tool === 'brush' || app.tool === 'eraser') ? 'crosshair' :
    (app.tool === 'text') ? 'text' : 'default';
}
function beginPan(e){
  isPanning = true;
  panStart = { x:e.clientX, y:e.clientY, px:core.panX, py:core.panY };
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', onPanUp, { once:true });
  updateCursor();
}
function onPanMove(e){
  if (!isPanning) return;
  core.panX = panStart.px + (e.clientX - panStart.x);
  core.panY = panStart.py + (e.clientY - panStart.y);
  core.updateWorld();
}
function onPanUp(){
  isPanning = false;
  window.removeEventListener('pointermove', onPanMove);
  updateCursor();
  saveState();
}

/* ============================================================
   ZOOM
============================================================ */
function updateZoomIndicator(){
  zValEl.textContent = Math.round(core.zoom * 100) + '%';
}
function zoomBy(factor, cx, cy){
  if (cx == null){
    const r = boardEl.getBoundingClientRect();
    cx = r.left + r.width/2; cy = r.top + r.height/2;
  }
  core.setZoomAt(core.zoom * factor, cx, cy);
  updateZoomIndicator();
  saveState();
}
document.getElementById('z-in') .addEventListener('click', () => zoomBy(1.25));
document.getElementById('z-out').addEventListener('click', () => zoomBy(1/1.25));
zValEl.addEventListener('click', () => {
  const r = boardEl.getBoundingClientRect();
  core.setZoomAt(1, r.left + r.width/2, r.top + r.height/2);
  updateZoomIndicator(); saveState();
});
boardEl.addEventListener('wheel', e => {
  if (e.target.closest('#settings')) return;
  if (e.target.closest('.zoombar')) return;
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  core.setZoomAt(core.zoom * factor, e.clientX, e.clientY);
  updateZoomIndicator();
  saveState();
}, { passive:false });

/* ============================================================
   ПРЕВЬЮ ШТРИХА
============================================================ */
function setupPreviewBrush(){
  previewPath.setAttribute('stroke', core.brush.color);
  previewPath.setAttribute('stroke-width', core.brush.size * core.zoom);
  previewPath.setAttribute('opacity', core.brush.opacity);
  if (core.brush.softness > 0){
    softBlur.setAttribute('stdDeviation', core.brush.softness * core.zoom);
    previewPath.setAttribute('filter', 'url(#soft-blur)');
  } else {
    previewPath.removeAttribute('filter');
  }
}
function updatePreview(points){
  if (!points || !points.length){ previewPath.setAttribute('d',''); return; }
  const s = points.map(p => core.worldToScreen(p));
  let d = '';
  if (s.length === 1){
    d = `M ${s[0].x} ${s[0].y} L ${s[0].x+0.01} ${s[0].y}`;
  } else {
    d = `M ${s[0].x} ${s[0].y}`;
    for (let i = 1; i < s.length-1; i++){
      const p = s[i], n = s[i+1];
      d += ` Q ${p.x} ${p.y} ${(p.x+n.x)/2} ${(p.y+n.y)/2}`;
    }
    d += ` L ${s[s.length-1].x} ${s[s.length-1].y}`;
  }
  previewPath.setAttribute('d', d);
}

/* ============================================================
   ШТРИХ
============================================================ */
let currentStroke = null;
function onStrokeMove(e){
  if (!currentStroke || !currentStroke.points) return;
  const p = core.screenToWorld(e.clientX, e.clientY);
  const last = currentStroke.points[currentStroke.points.length-1];
  if (Math.hypot(p.x-last.x, p.y-last.y) < 1.2 / core.zoom) return;
  currentStroke.points.push(p);
  updatePreview(currentStroke.points);
}
function onStrokeUp(){
  window.removeEventListener('pointermove', onStrokeMove);
  if (!currentStroke || !currentStroke.points){ currentStroke = null; return; }
  const pts = currentStroke.points;
  currentStroke = null;
  previewPath.setAttribute('d','');
  if (!pts.length) return;
  core.pushHistory();
  const obj = core.createStroke(pts, core.brush);
  core.addObject(obj);
}

/* ============================================================
   ЛАСТИК
============================================================ */
let erasePushed = false;
function onEraseMove(e){
  const p = core.screenToWorld(e.clientX, e.clientY);
  const hit = core.hitTest(p, 1 / core.zoom);
  if (hit){
    if (!erasePushed){ core.pushHistory(); erasePushed = true; }
    core.removeObject(hit);
  }
}
function onEraseUp(){
  window.removeEventListener('pointermove', onEraseMove);
  erasePushed = false;
}

/* ============================================================
   TRANSFORM
============================================================ */
function beginTransform(e, obj, mode, dir){
  const p = core.screenToWorld(e.clientX, e.clientY);
  const cx = obj.x + obj.w/2;
  const cy = obj.y + obj.h/2;

  drag = {
    obj, mode, dir, startP:p,
    startX:obj.x, startY:obj.y, startW:obj.w, startH:obj.h,
    startRot:obj.rot || 0, startFont:obj.fontSize || 0,
    cx, cy,
    startAngle: Math.atan2(p.y-cy, p.x-cx) * 180/Math.PI,
    moved:false, anchorWorld:null, cosR:1, sinR:0, signX:1, signY:1
  };

  if (mode === 'resize'){
    const rotRad = ((obj.rot || 0) * Math.PI) / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const signX = dir.includes('e') ? 1 : -1;
    const signY = dir.includes('s') ? 1 : -1;
    const aLx = -signX * obj.w/2;
    const aLy = -signY * obj.h/2;
    drag.anchorWorld = {
      x: cx + aLx*cosR - aLy*sinR,
      y: cy + aLx*sinR + aLy*cosR
    };
    drag.cosR = cosR; drag.sinR = sinR;
    drag.signX = signX; drag.signY = signY;
  }

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp, { once:true });
}
function onDragMove(e){
  const d = drag; if (!d) return;
  const p = core.screenToWorld(e.clientX, e.clientY);

  if (!d.moved){
    if (Math.hypot(p.x-d.startP.x, p.y-d.startP.y) < 2 / core.zoom) return;
    d.moved = true;
    core.pushHistory();
  }
  const obj = d.obj;

  if (d.mode === 'move'){
    obj.x = d.startX + (p.x - d.startP.x);
    obj.y = d.startY + (p.y - d.startP.y);
  }
  else if (d.mode === 'rot'){
    const ang = Math.atan2(p.y-d.cy, p.x-d.cx) * 180/Math.PI;
    let rot = d.startRot + (ang - d.startAngle);
    if (e.shiftKey) rot = Math.round(rot/15)*15;
    obj.rot = rot;
  }
  else if (d.mode === 'resize'){
    if (obj.type === 'text'){
      const d0 = Math.hypot(d.startP.x-d.cx, d.startP.y-d.cy) || 1;
      const d1 = Math.hypot(p.x-d.cx, p.y-d.cy);
      const s = Math.max(0.1, d1/d0);
      obj.fontSize = Math.max(6, Math.min(400, d.startFont * s));
      obj.el_text.style.fontSize = obj.fontSize + 'px';
      obj.w = Math.max(80, d.startW * s);
      obj.h = obj.el.offsetHeight;
      obj.x = d.cx - obj.w/2;
      obj.y = d.cy - obj.h/2;
      core.applyTransform(obj);
      return;
    }
    const dx = p.x - d.anchorWorld.x;
    const dy = p.y - d.anchorWorld.y;
    const lx =  dx * d.cosR + dy * d.sinR;
    const ly = -dx * d.sinR + dy * d.cosR;
    let nw = d.signX * lx;
    let nh = d.signY * ly;
    const keep = e.shiftKey || obj.type === 'stroke';
    if (keep){
      const ratio = d.startW / d.startH;
      if (nw/nh > ratio) nw = nh*ratio; else nh = nw/ratio;
    }
    nw = Math.max(20, nw); nh = Math.max(20, nh);
    obj.w = nw; obj.h = nh;
    const rotRad = ((obj.rot || 0) * Math.PI) / 180;
    const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
    const aLx = -d.signX * nw/2;
    const aLy = -d.signY * nh/2;
    const ncx = d.anchorWorld.x - (aLx*cosR - aLy*sinR);
    const ncy = d.anchorWorld.y - (aLx*sinR + aLy*cosR);
    obj.x = ncx - nw/2;
    obj.y = ncy - nh/2;
  }
  core.applyTransform(obj);
}
function onDragUp(){
  window.removeEventListener('pointermove', onDragMove);
  drag = null;
  saveState();
}

/* ============================================================
   ГЛАВНЫЙ POINTERDOWN
============================================================ */
boardEl.addEventListener('pointerdown', e => {
  if (e.target.closest('#settings')) return;
  if (e.target.closest('.zoombar')) return;

  if (e.button === 1 || spaceHeld){
    e.preventDefault(); beginPan(e); return;
  }
  if (e.button !== 0) return;

  const worldPt = core.screenToWorld(e.clientX, e.clientY);
  const objEl = e.target.closest('.obj');
  const obj = objEl ? core.objects.find(o => o.id === objEl.dataset.id) : null;

  if (app.tool === 'brush'){
    e.preventDefault();
    currentStroke = { points:[worldPt] };
    setupPreviewBrush();
    updatePreview(currentStroke.points);
    window.addEventListener('pointermove', onStrokeMove);
    window.addEventListener('pointerup', onStrokeUp, { once:true });
    return;
  }
  if (app.tool === 'eraser'){
    e.preventDefault();
    erasePushed = false;
    onEraseMove(e);
    window.addEventListener('pointermove', onEraseMove);
    window.addEventListener('pointerup', onEraseUp, { once:true });
    return;
  }
  if (app.tool === 'text'){
    e.preventDefault();
    if (obj && obj.type === 'text'){ core.select(obj); startEditing(obj); return; }
    if (obj) return;
    core.pushHistory();
    const t2 = core.createText(worldPt, app.textStyle);
    core.addObject(t2, { select:true });
    requestAnimationFrame(() => startEditing(t2));
    return;
  }
  if (app.tool === 'select'){
    if (obj){
      e.preventDefault();
      const handleEl = e.target.closest('.handle, .rot-handle');
      core.select(obj);
      if (handleEl){
        const dir = handleEl.dataset.dir;
        beginTransform(e, obj, dir === 'rot' ? 'rot' : 'resize', dir);
      } else {
        beginTransform(e, obj, 'move', null);
      }
      return;
    }
    core.select(null);
  }
});

/* ============================================================
   ТЕКСТ — редактирование
============================================================ */
function startEditing(obj){
  const t2 = obj.el_text;
  if (!t2) return;
  t2.contentEditable = 'true';
  t2.focus({ preventScroll:true });
  const range = document.createRange();
  range.selectNodeContents(t2);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
world.addEventListener('input', e => {
  const t2 = e.target.closest('.text-content');
  if (!t2) return;
  const obj = core.objects.find(o => o.id === t2.closest('.obj').dataset.id);
  if (obj) obj.text = t2.innerText;
}, true);
world.addEventListener('blur', e => {
  const t2 = e.target.closest && e.target.closest('.text-content');
  if (!t2 || !t2.isContentEditable) return;
  t2.contentEditable = 'false';
  const obj = core.objects.find(o => o.id === t2.closest('.obj').dataset.id);
  if (!obj) return;
  obj.text = t2.innerText.replace(/\n+$/, '');
  if (!obj.text.trim()) core.removeObject(obj);
  else {
    obj.h = obj.el.offsetHeight;
    core.applyTransform(obj);
    saveState();
  }
  renderSettings();
}, true);
world.addEventListener('keydown', e => {
  if (e.target.closest('.text-content')){
    e.stopPropagation();
    if (e.key === 'Escape') e.target.blur();
  }
}, true);
world.addEventListener('pointerdown', e => {
  const t2 = e.target.closest('.text-content');
  if (t2 && t2.isContentEditable) e.stopPropagation();
}, true);
boardEl.addEventListener('dblclick', e => {
  const objEl = e.target.closest('.obj');
  if (!objEl) return;
  const obj = core.objects.find(o => o.id === objEl.dataset.id);
  if (!obj || obj.type !== 'text') return;
  const t2 = obj.el_text;
  if (t2 && t2.isContentEditable) return;
  core.select(obj); startEditing(obj);
});

/* ============================================================
   КАРТИНКИ
============================================================ */
window.addEventListener('paste', e => {
  const ae = document.activeElement;
  if (ae && ae.isContentEditable) return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  let handled = false;
  for (const it of items){
    if (it.type && it.type.startsWith('image/')){
      const f = it.getAsFile();
      if (f){ addImageFile(f); handled = true; }
    }
  }
  if (handled){ e.preventDefault(); hideHint(); }
});
['dragenter','dragover'].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));
window.addEventListener('drop', e => {
  e.preventDefault();
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files) return;
  for (const f of files) if (f.type.startsWith('image/')) addImageFile(f);
  hideHint();
});
document.getElementById('btn-image').addEventListener('click', () => {
  document.getElementById('file-input').click();
});
document.getElementById('file-input').addEventListener('change', e => {
  for (const f of e.target.files) if (f.type.startsWith('image/')) addImageFile(f);
  e.target.value = '';
});
function addImageFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const img = new Image();
    img.onload = () => {
      const maxW = 800, maxH = 800;
      let w = img.naturalWidth || 400;
      let h = img.naturalHeight || 300;
      const k = Math.min(1, maxW/w, maxH/h);
      w = Math.round(w*k); h = Math.round(h*k);
      const r = boardEl.getBoundingClientRect();
      const center = core.screenToWorld(r.left + r.width/2, r.top + r.height/2);
      core.pushHistory();
      const obj = core.createImage(dataUrl,
        center.x + (Math.random()*80-40),
        center.y + (Math.random()*80-40), w, h);
      core.addObject(obj, { select:true });
      setTool('select');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   ИНСТРУМЕНТЫ
============================================================ */
function setTool(name){
  const ae = document.activeElement;
  if (ae && ae.isContentEditable) ae.blur();
  if (currentStroke){ currentStroke = null; previewPath.setAttribute('d',''); }

  app.tool = name;
  document.querySelectorAll('.tool[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === name);
  });
  const isDraw = (name === 'brush' || name === 'eraser');
  boardEl.classList.toggle('board-drawing', isDraw);
  updateCursor();
  renderSettings();
  saveState();
}
document.querySelectorAll('.tool[data-tool]').forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});

/* ============================================================
   ИСТОРИЯ / CLEAR
============================================================ */
document.getElementById('btn-undo').addEventListener('click', () => { core.undo(); saveState(); });
document.getElementById('btn-redo').addEventListener('click', () => { core.redo(); saveState(); });
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!core.objects.length && core.panX === 0 && core.panY === 0 && core.zoom === 1) return;
  core.pushHistory();
  core.clear();
  core.panX = 0; core.panY = 0; core.zoom = 1;
  core.updateWorld(); updateZoomIndicator(); saveState();
});

/* ============================================================
   КЛАВИАТУРА
============================================================ */
function isEditable(el){
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' ||
         el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}
window.addEventListener('keydown', e => {
  const ae = document.activeElement;
  const editing = isEditable(ae);

  if (e.key === 'Escape' && accentModal.classList.contains('show')) return;

  if (e.code === 'Space' && !editing && !spaceHeld){
    spaceHeld = true; updateCursor(); e.preventDefault(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
    if (editing) return;
    e.preventDefault();
    if (e.shiftKey) core.redo(); else core.undo();
    saveState(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){
    if (editing) return;
    e.preventDefault(); core.redo(); saveState(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd'){
    if (editing || !core.selected) return;
    e.preventDefault();
    core.pushHistory(); core.duplicate(core.selected);
    renderSettings(); saveState(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '0'){
    if (editing) return;
    e.preventDefault();
    const r = boardEl.getBoundingClientRect();
    core.setZoomAt(1, r.left + r.width/2, r.top + r.height/2);
    updateZoomIndicator(); saveState(); return;
  }
  if (editing) return;

  if (e.key === 'Delete' || e.key === 'Backspace'){
    if (core.selected){
      e.preventDefault(); core.pushHistory();
      core.removeObject(core.selected); saveState();
    }
    return;
  }
  if (e.key === 'Escape'){ core.select(null); setTool('select'); return; }

  const k = e.key.toLowerCase();
  if (k === 'v') setTool('select');
  else if (k === 'b') setTool('brush');
  else if (k === 'e') setTool('eraser');
  else if (k === 't') setTool('text');
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space'){ spaceHeld = false; if (!isPanning) updateCursor(); }
});

/* ============================================================
   i18n
============================================================ */
function applyLang(lang){
  app.lang = lang;
  document.documentElement.lang = lang;
  document.getElementById('lang-sel').value = lang;

  document.querySelectorAll('[data-i18n-title]').forEach(el2 => {
    const k = el2.dataset.i18nTitle;
    if (I18N[lang][k]) el2.title = I18N[lang][k];
  });
  document.querySelectorAll('[data-i18n]').forEach(el2 => {
    const k = el2.dataset.i18n;
    if (I18N[lang][k]) el2.textContent = I18N[lang][k];
  });
  hintEl.innerHTML = I18N[lang].hint;
  renderSettings();
}
document.getElementById('lang-sel').addEventListener('change', e => {
  applyLang(e.target.value); saveState();
});

/* ============================================================
   КОЛБЭКИ ДВИЖКА
============================================================ */
core.onSelectionChange = () => {
  if (core.selected && core.selected.type === 'text'){
    const o = core.selected;
    app.textStyle.fontSize   = o.fontSize;
    app.textStyle.fontFamily = o.fontFamily;
    app.textStyle.color      = o.color;
    app.textStyle.bold       = !!o.bold;
    app.textStyle.italic     = !!o.italic;
  }
  renderSettings();
};
core.onObjectsChange = () => saveState();

/* ============================================================
   ХИНТ
============================================================ */
let hintHidden = false;
function hideHint(){
  if (hintHidden) return;
  hintHidden = true;
  hintEl.style.opacity = '0';
  setTimeout(() => { if (hintEl.parentNode) hintEl.remove(); }, 800);
}
setTimeout(hideHint, 16000);

/* ============================================================
   INIT
============================================================ */
(function init(){
  const saved = loadState();

  if (saved){
    isLoading = true;
    if (saved.app){
      const a = saved.app;
      if (a.lang)         app.lang = a.lang;
      if (a.accentColor)  app.accentColor = a.accentColor;
      if (a.boardTheme)   app.boardTheme = a.boardTheme;
      if (a.gridStyle)    app.gridStyle = a.gridStyle;
      if (a.tool)         app.tool = a.tool;
      if (a.brush)        Object.assign(core.brush, a.brush);
      if (a.textStyle)    Object.assign(app.textStyle, a.textStyle);
    }
    applyAccent(app.accentColor);
    applyThemeVisual();
    applyGrid();

    if (saved.pan){ core.panX = saved.pan.x || 0; core.panY = saved.pan.y || 0; }
    if (typeof saved.zoom === 'number')
      core.zoom = Math.max(core.ZOOM_MIN, Math.min(core.ZOOM_MAX, saved.zoom));
    if (typeof saved.uid === 'number') core.uid = saved.uid;

    if (Array.isArray(saved.objects)){
      saved.objects.forEach(data => {
        const obj = core.deserializeOne(data);
        core.world.appendChild(obj.el);
        core.objects.push(obj);
      });
    }
    core.updateWorld();

    document.documentElement.lang = app.lang;
    document.getElementById('lang-sel').value = app.lang;
    document.querySelectorAll('[data-i18n-title]').forEach(el2 => {
      const k = el2.dataset.i18nTitle;
      if (I18N[app.lang][k]) el2.title = I18N[app.lang][k];
    });
    document.querySelectorAll('[data-i18n]').forEach(el2 => {
      const k = el2.dataset.i18n;
      if (I18N[app.lang][k]) el2.textContent = I18N[app.lang][k];
    });
    hintEl.innerHTML = I18N[app.lang].hint;
    isLoading = false;
  } else {
    applyAccent(app.accentColor);
    applyThemeVisual();
    applyGrid();
  }

  buildAccentPresets();
  accentColorIn.value = app.accentColor;
  accentHexIn.value = app.accentColor;

  document.querySelectorAll('.tool[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === app.tool);
  });
  const isDraw = (app.tool === 'brush' || app.tool === 'eraser');
  boardEl.classList.toggle('board-drawing', isDraw);

  updateCursor();
  updateZoomIndicator();
  renderSettings();
})();

})();