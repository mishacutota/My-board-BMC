/* ============================================================
   board-core.js — движок доски.
   Объекты, история, координаты, рендер штрихов, hit-test.
   Не знает ничего о UI. Общается с приложением через колбэки.
   ============================================================ */
(function(){
'use strict';

class BoardCore {
  constructor(opts){
    this.boardEl     = opts.boardEl;
    this.world       = opts.world;
    this.previewPath = opts.previewPath;
    this.softBlur    = opts.softBlur;

    this.objects  = [];
    this.selected = null;
    this.uid      = 0;

    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.ZOOM_MIN = 0.15;
    this.ZOOM_MAX = 8;

    this.history    = [];
    this.redoStack  = [];
    this.HISTORY_MAX = 30;

    this.brush = { color:'#1b1f2a', size:6, opacity:1, softness:0 };

    this.onSelectionChange = null;
    this.onObjectsChange   = null;

    this.dpr = () => window.devicePixelRatio || 1;
  }

  /* ---------- координаты ---------- */
  screenToWorld(cx, cy){
    const r = this.boardEl.getBoundingClientRect();
    return {
      x: (cx - r.left - this.panX) / this.zoom,
      y: (cy - r.top  - this.panY) / this.zoom
    };
  }
  worldToScreen(p){
    return { x: p.x * this.zoom + this.panX, y: p.y * this.zoom + this.panY };
  }
  pan(dx, dy){
    this.panX += dx; this.panY += dy;
    this.updateWorld();
  }
  setZoomAt(newZoom, screenCx, screenCy){
    newZoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, newZoom));
    const r = this.boardEl.getBoundingClientRect();
    const cx = screenCx - r.left;
    const cy = screenCy - r.top;
    const wx = (cx - this.panX) / this.zoom;
    const wy = (cy - this.panY) / this.zoom;
    this.zoom = newZoom;
    this.panX = cx - wx * newZoom;
    this.panY = cy - wy * newZoom;
    this.updateWorld();
  }
  updateWorld(){
    this.world.style.transform =
      `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const gs = 24 * this.zoom;
    this.boardEl.style.backgroundSize = `${gs}px ${gs}px`;
    this.boardEl.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
    this.boardEl.style.setProperty('--zoom', this.zoom);
  }

  newId(){ return 'o' + (++this.uid); }

  /* ---------- рендер штриха в свой canvas ---------- */
  renderStroke(obj){
    const c = obj.canvasEl;
    if (!c) return;
    const dpr = this.dpr();
    const W = Math.max(1, Math.round(obj.w * dpr));
    const H = Math.max(1, Math.round(obj.h * dpr));
    if (c.width  !== W) c.width  = W;
    if (c.height !== H) c.height = H;

    const g = c.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,c.width,c.height);

    const scale = obj.w / obj.baseW;
    g.setTransform(dpr*scale, 0, 0, dpr*scale, 0, 0);

    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = obj.size;
    g.strokeStyle = obj.color;
    g.fillStyle = obj.color;
    g.globalAlpha = obj.opacity;
    g.filter = obj.softness > 0 ? `blur(${obj.softness}px)` : 'none';

    const pts = obj.points;
    if (!pts || !pts.length) return;
    if (pts.length === 1){
      g.beginPath();
      g.arc(pts[0].x, pts[0].y, Math.max(0.5, obj.size/2), 0, Math.PI*2);
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++){
      const p = pts[i], n = pts[i+1];
      g.quadraticCurveTo(p.x, p.y, (p.x+n.x)/2, (p.y+n.y)/2);
    }
    const last = pts[pts.length-1];
    g.lineTo(last.x, last.y);
    g.stroke();
  }

  /* ---------- конструкторы ---------- */
  createStroke(points, brush){
    const pad = brush.size/2 + brush.softness*2 + 4;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const p of points){
      if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y;
      if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y;
    }
    minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
    const w = Math.max(2, maxX-minX);
    const h = Math.max(2, maxY-minY);
    return {
      id: this.newId(), type: 'stroke',
      x: minX, y: minY, w, h, baseW: w, baseH: h, rot: 0,
      points: points.map(p => ({ x: p.x-minX, y: p.y-minY })),
      color: brush.color, size: brush.size,
      opacity: brush.opacity, softness: brush.softness
    };
  }
  createImage(src, cx, cy, w, h){
    return { id:this.newId(), type:'image', src,
             x: cx - w/2, y: cy - h/2, w, h, rot:0 };
  }
  createText(worldPt, style){
    return {
      id:this.newId(), type:'text',
      x: Math.round(worldPt.x - 10), y: Math.round(worldPt.y - 20),
      w: 280, h: 44, rot: 0,
      text: '',
      fontSize: style.fontSize, fontFamily: style.fontFamily,
      color: style.color, bold: style.bold, italic: style.italic
    };
  }

  /* ---------- DOM объектов ---------- */
  makeEl(obj){
    const el = document.createElement('div');
    el.className = 'obj';
    el.dataset.id = obj.id;
    el.style.left  = obj.x + 'px';
    el.style.top   = obj.y + 'px';
    el.style.width = obj.w + 'px';
    el.style.transform = `rotate(${obj.rot || 0}deg)`;

    if (obj.type === 'image'){
      el.style.height = obj.h + 'px';
      const img = document.createElement('img');
      img.src = obj.src; img.draggable = false;
      el.appendChild(img);
    }
    else if (obj.type === 'stroke'){
      el.style.height = obj.h + 'px';
      const c = document.createElement('canvas');
      c.style.width='100%'; c.style.height='100%';
      c.style.display='block'; c.style.pointerEvents='none';
      el.appendChild(c);
      obj.canvasEl = c;
      this.renderStroke(obj);
    }
    else if (obj.type === 'text'){
      const t = document.createElement('div');
      t.className = 'text-content';
      t.textContent = obj.text || '';
      t.spellcheck = false;
      this.applyTextStyle(obj, t);
      el.appendChild(t);
      obj.el_text = t;
    }

    const hwrap = document.createElement('div');
    hwrap.className = 'handles';
    ['nw','ne','se','sw'].forEach(d => {
      const hh = document.createElement('div');
      hh.className = 'handle ' + d; hh.dataset.dir = d;
      hwrap.appendChild(hh);
    });
    const rot = document.createElement('div');
    rot.className = 'rot-handle'; rot.dataset.dir = 'rot';
    hwrap.appendChild(rot);
    el.appendChild(hwrap);

    obj.el = el;
    return el;
  }

  applyTextStyle(obj, t){
    t = t || obj.el_text;
    if (!t) return;
    t.style.fontSize   = obj.fontSize + 'px';
    t.style.fontFamily = obj.fontFamily;
    t.style.color      = obj.color;
    t.style.fontWeight = obj.bold ? '700' : '400';
    t.style.fontStyle  = obj.italic ? 'italic' : 'normal';
  }

  applyTransform(obj){
    const el = obj.el;
    if (!el) return;
    el.style.left  = obj.x + 'px';
    el.style.top   = obj.y + 'px';
    el.style.width = obj.w + 'px';
    el.style.transform = `rotate(${obj.rot || 0}deg)`;
    if (obj.type === 'image' || obj.type === 'stroke') el.style.height = obj.h + 'px';
    if (obj.type === 'stroke') this.renderStroke(obj);
  }

  /* ---------- add/remove/clear ---------- */
  addObject(obj, opts){
    obj.el = this.makeEl(obj);
    this.world.appendChild(obj.el);
    this.objects.push(obj);
    if (opts && opts.select) this.select(obj);
    if (this.onObjectsChange) this.onObjectsChange();
    return obj;
  }
  removeObject(obj){
    if (!obj) return;
    if (obj.el && obj.el.parentNode) obj.el.remove();
    this.objects = this.objects.filter(o => o !== obj);
    if (this.selected === obj) this.select(null);
    if (this.onObjectsChange) this.onObjectsChange();
  }
  clear(){
    this.world.innerHTML = '';
    this.objects = [];
    this.select(null);
    if (this.onObjectsChange) this.onObjectsChange();
  }

  /* ---------- выбор ---------- */
  select(obj){
    if (this.selected === obj){
      if (this.onSelectionChange) this.onSelectionChange();
      return;
    }
    if (this.selected && this.selected.el) this.selected.el.classList.remove('selected');
    this.selected = obj;
    if (obj && obj.el) obj.el.classList.add('selected');
    if (this.onSelectionChange) this.onSelectionChange();
  }

  /* ---------- z-order ---------- */
  bringToFront(obj){
    const i = this.objects.indexOf(obj); if (i<0) return;
    this.objects.splice(i,1); this.objects.push(obj);
    this.world.appendChild(obj.el);
  }
  sendToBack(obj){
    const i = this.objects.indexOf(obj); if (i<0) return;
    this.objects.splice(i,1); this.objects.unshift(obj);
    this.world.insertBefore(obj.el, this.world.firstChild);
  }

  duplicate(obj){
    const data = this.serializeOne(obj);
    data.id = this.newId();
    data.x += 24; data.y += 24;
    const clone = this.deserializeOne(data);
    return this.addObject(clone, { select: true });
  }

  /* ---------- сериализация ---------- */
  serializeOne(o){
    const base = { id:o.id, type:o.type,
                   x:o.x, y:o.y, w:o.w, h:o.h, rot:o.rot || 0 };
    if (o.type === 'image') base.src = o.src;
    if (o.type === 'stroke'){
      base.points = o.points.map(p => ({ x:p.x, y:p.y }));
      base.baseW = o.baseW; base.baseH = o.baseH;
      base.color = o.color; base.size = o.size;
      base.opacity = o.opacity; base.softness = o.softness;
    }
    if (o.type === 'text'){
      base.text = o.text; base.fontSize = o.fontSize;
      base.fontFamily = o.fontFamily; base.color = o.color;
      base.bold = o.bold; base.italic = o.italic;
    }
    return base;
  }
  deserializeOne(data){
    const obj = Object.assign({}, data);
    obj.el = this.makeEl(obj);
    return obj;
  }
  snapshot(){ return { objects: this.objects.map(o => this.serializeOne(o)) }; }

  /* ---------- история ---------- */
  pushHistory(){
    this.history.push(this.snapshot());
    if (this.history.length > this.HISTORY_MAX) this.history.shift();
    this.redoStack.length = 0;
  }
  restore(snap){
    this.world.innerHTML = '';
    this.objects = [];
    this.select(null);
    snap.objects.forEach(data => {
      const obj = this.deserializeOne(data);
      this.world.appendChild(obj.el);
      this.objects.push(obj);
    });
    if (this.onObjectsChange) this.onObjectsChange();
  }
  undo(){
    if (!this.history.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.history.pop());
  }
  redo(){
    if (!this.redoStack.length) return;
    this.history.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  /* ---------- hit test ---------- */
  hitTest(worldPt, tol){
    tol = tol || 0;
    for (let i = this.objects.length - 1; i >= 0; i--){
      const o = this.objects[i];
      if (worldPt.x >= o.x - tol && worldPt.x <= o.x + o.w + tol &&
          worldPt.y >= o.y - tol && worldPt.y <= o.y + o.h + tol){
        return o;
      }
    }
    return null;
  }
}

window.BoardCore = BoardCore;
})();