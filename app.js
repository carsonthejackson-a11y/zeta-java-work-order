/* ---------- storage ---------- */
const LS = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v==null?d:v; } catch(e){ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
const DEFAULT_MANUFACTURERS = [
  'BUNN','La Marzocco','Rancilio','Franke','Astoria','Nuova Simonelli','Wilbur Curtis','Curtis',
  'Grindmaster','Cecilware','Bloomfield','Newco','Fetco','Marco','Schaerer','WMF','Jura','Bravilor',
  'Animo','Crem','Egro','Thermoplan','Cimbali','La Cimbali','Faema','Saeco','Bezzera','ECM',
  'Victoria Arduino','Mahlkonig','Mazzer','Ditting','Anfim','Manitowoc','Hoshizaki','Scotsman',
  'Ice-O-Matic','Follett','Vitamix','Blendtec','Hamilton Beach',
];
const DEFAULT_SETTINGS = { techName:'', nextWO:1, laborRate:65, otRate:97.5, mileRate:0.67, taxRate:8.25, manufacturers: DEFAULT_MANUFACTURERS.slice() };
let settings = LS.get('wo_settings', DEFAULT_SETTINGS);
if (!Array.isArray(settings.manufacturers) || !settings.manufacturers.length){
  settings.manufacturers = DEFAULT_MANUFACTURERS.slice();
}
let customers = LS.get('wo_customers', []);
let equipment = LS.get('wo_equipment', []);

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- toast ---------- */
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ---------- settings panel ---------- */
const settingsToggle = document.getElementById('settingsToggle');
const settingsBody = document.getElementById('settingsBody');
settingsToggle.addEventListener('click', ()=> settingsBody.classList.toggle('open'));

function loadSettingsForm(){
  document.getElementById('setTechName').value = settings.techName;
  document.getElementById('setNextWO').value = settings.nextWO;
  document.getElementById('setLaborRate').value = settings.laborRate;
  document.getElementById('setOtRate').value = settings.otRate;
  document.getElementById('setMileRate').value = settings.mileRate;
  document.getElementById('setTaxRate').value = settings.taxRate;
  document.getElementById('setManufacturers').value = settings.manufacturers.join(', ');
}
document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
  const manufacturers = document.getElementById('setManufacturers').value
    .split(',').map(s=>s.trim()).filter(Boolean);
  settings = {
    techName: document.getElementById('setTechName').value.trim(),
    nextWO: parseInt(document.getElementById('setNextWO').value) || 1,
    laborRate: parseFloat(document.getElementById('setLaborRate').value) || 0,
    otRate: parseFloat(document.getElementById('setOtRate').value) || 0,
    mileRate: parseFloat(document.getElementById('setMileRate').value) || 0,
    taxRate: parseFloat(document.getElementById('setTaxRate').value) || 0,
    manufacturers: manufacturers.length ? manufacturers : DEFAULT_MANUFACTURERS.slice(),
  };
  LS.set('wo_settings', settings);
  document.getElementById('techSignName').value = settings.techName;
  document.getElementById('woNumber').value = padWO(settings.nextWO);
  toast('Settings saved');
  settingsBody.classList.remove('open');
  recalc();
});

function padWO(n){ return String(n).padStart(6,'0'); }

/* ---------- customers ---------- */
const customerSelect = document.getElementById('customerSelect');
function refreshCustomerSelect(selId){
  customerSelect.innerHTML = '<option value="">— New customer —</option>' +
    customers.map(c => `<option value="${c.id}">${escapeHtml(c.name||c.acctName)}</option>`).join('');
  if (selId) customerSelect.value = selId;
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

customerSelect.addEventListener('change', ()=>{
  const c = customers.find(x=>x.id===customerSelect.value);
  document.getElementById('deleteCustomerBtn').style.display = c ? 'inline-block' : 'none';
  if (!c) return;
  document.getElementById('acctName').value = c.acctName||'';
  document.getElementById('address').value = c.address||'';
  document.getElementById('city').value = c.city||'';
  document.getElementById('state').value = c.state||'';
  document.getElementById('zip').value = c.zip||'';
  document.getElementById('contactName').value = c.contactName||'';
  document.getElementById('phone1').value = c.phone1||'';
  document.getElementById('phone2').value = c.phone2||'';
  document.getElementById('custSignName').value = c.contactName||'';
  document.getElementById('customerSaveName').value = c.name||c.acctName||'';
  refreshEquipSelect('', c.id);
});

document.getElementById('saveCustomerBtn').addEventListener('click', ()=>{
  const name = document.getElementById('customerSaveName').value.trim() || document.getElementById('acctName').value.trim();
  if (!name){ toast('Enter a name to save under'); return; }
  const existingId = customerSelect.value;
  const rec = {
    id: existingId || uid(),
    name,
    acctName: document.getElementById('acctName').value.trim(),
    address: document.getElementById('address').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value.trim().toUpperCase(),
    zip: document.getElementById('zip').value.trim(),
    contactName: document.getElementById('contactName').value.trim(),
    phone1: document.getElementById('phone1').value.trim(),
    phone2: document.getElementById('phone2').value.trim(),
  };
  const idx = customers.findIndex(c=>c.id===rec.id);
  if (idx>=0) customers[idx]=rec; else customers.push(rec);
  LS.set('wo_customers', customers);
  refreshCustomerSelect(rec.id);
  document.getElementById('deleteCustomerBtn').style.display='inline-block';
  toast('Customer saved');
});
document.getElementById('deleteCustomerBtn').addEventListener('click', ()=>{
  const id = customerSelect.value;
  if (!id) return;
  customers = customers.filter(c=>c.id!==id);
  LS.set('wo_customers', customers);
  refreshCustomerSelect();
  document.getElementById('deleteCustomerBtn').style.display='none';
  toast('Customer deleted');
});

/* ---------- equipment ---------- */
const equipSelect = document.getElementById('equipSelect');
function refreshEquipSelect(selId, customerId){
  const list = customerId ? equipment.filter(e=>e.customerId===customerId) : equipment;
  equipSelect.innerHTML = '<option value="">— New equipment —</option>' +
    list.map(e => `<option value="${e.id}">${escapeHtml(e.name||e.description||e.model||'Equipment')}</option>`).join('');
  if (selId) equipSelect.value = selId;
}
equipSelect.addEventListener('change', ()=>{
  const e = equipment.find(x=>x.id===equipSelect.value);
  document.getElementById('deleteEquipBtn').style.display = e ? 'inline-block' : 'none';
  if (!e) return;
  document.getElementById('equipDesc').value = e.description||'';
  document.getElementById('manufacturer').value = e.manufacturer||'';
  document.getElementById('model').value = e.model||'';
  document.getElementById('serial').value = e.serial||'';
  document.getElementById('voltsRated').value = e.voltsRated||'';
  document.getElementById('voltsSupplied').value = e.voltsSupplied||'';
  document.getElementById('equipSaveName').value = e.name||e.description||'';
});
document.getElementById('saveEquipBtn').addEventListener('click', ()=>{
  const name = document.getElementById('equipSaveName').value.trim() || document.getElementById('equipDesc').value.trim();
  if (!name){ toast('Enter a name to save under'); return; }
  const existingId = equipSelect.value;
  const rec = {
    id: existingId || uid(),
    name,
    customerId: customerSelect.value || null,
    description: document.getElementById('equipDesc').value.trim(),
    manufacturer: document.getElementById('manufacturer').value.trim(),
    model: document.getElementById('model').value.trim(),
    serial: document.getElementById('serial').value.trim(),
    voltsRated: document.getElementById('voltsRated').value.trim(),
    voltsSupplied: document.getElementById('voltsSupplied').value.trim(),
  };
  const idx = equipment.findIndex(e=>e.id===rec.id);
  if (idx>=0) equipment[idx]=rec; else equipment.push(rec);
  LS.set('wo_equipment', equipment);
  refreshEquipSelect(rec.id, customerSelect.value || null);
  document.getElementById('deleteEquipBtn').style.display='inline-block';
  toast('Equipment saved');
});
document.getElementById('deleteEquipBtn').addEventListener('click', ()=>{
  const id = equipSelect.value;
  if (!id) return;
  equipment = equipment.filter(e=>e.id!==id);
  LS.set('wo_equipment', equipment);
  refreshEquipSelect();
  document.getElementById('deleteEquipBtn').style.display='none';
  toast('Equipment deleted');
});

/* ---------- service type chips ---------- */
document.querySelectorAll('#serviceTypeChips .chip').forEach(chip=>{
  chip.addEventListener('click', ()=> chip.classList.toggle('on'));
});
function getServiceTypes(){
  return Array.from(document.querySelectorAll('#serviceTypeChips .chip.on')).map(c=>c.dataset.val);
}

/* ---------- parts lines ---------- */
const partsList = document.getElementById('partsList');
let partRows = [];
function addPartRow(data){
  if (partRows.length >= 6){ toast('Max 6 lines on this form'); return; }
  const id = uid();
  partRows.push(id);
  const div = document.createElement('div');
  div.className = 'part-row';
  div.dataset.id = id;
  div.innerHTML = `
    <button class="remove" data-remove="${id}">Remove</button>
    <div class="grid2">
      <div><label>Part No.</label><input type="text" class="p-partno"></div>
      <div><label>Qty</label><input type="number" class="p-qty" step="0.01"></div>
    </div>
    <label>Description</label><input type="text" class="p-desc">
    <div class="grid2">
      <div><label>Unit $</label><input type="number" class="p-unit" step="0.01"></div>
      <div><label>Line total</label><input type="text" class="p-total" disabled></div>
    </div>
  `;
  partsList.appendChild(div);
  const qtyEl = div.querySelector('.p-qty'), unitEl = div.querySelector('.p-unit'), totEl = div.querySelector('.p-total');
  function upd(){
    const q = parseFloat(qtyEl.value)||0, u = parseFloat(unitEl.value)||0;
    totEl.value = (q*u).toFixed(2);
    recalc();
  }
  qtyEl.addEventListener('input', upd);
  unitEl.addEventListener('input', upd);
  div.querySelector('[data-remove]').addEventListener('click', ()=>{
    partRows = partRows.filter(x=>x!==id);
    div.remove();
    recalc();
  });
  if (data){
    div.querySelector('.p-partno').value = data.partNo||'';
    div.querySelector('.p-desc').value = data.desc||'';
    qtyEl.value = data.qty||''; unitEl.value = data.unit||'';
    upd();
  }
}
document.getElementById('addPartBtn').addEventListener('click', ()=>addPartRow());

function getPartsData(){
  return Array.from(partsList.children).map(div=>({
    partNo: div.querySelector('.p-partno').value.trim(),
    desc: div.querySelector('.p-desc').value.trim(),
    qty: parseFloat(div.querySelector('.p-qty').value)||0,
    unit: parseFloat(div.querySelector('.p-unit').value)||0,
  })).filter(r=>r.partNo||r.desc||r.qty||r.unit);
}

/* ---------- labor rows ---------- */
const laborList = document.getElementById('laborList');
let laborRows = [];
function addLaborRow(data){
  if (laborRows.length >= 2){ toast('Max 2 rows on this form'); return; }
  const id = uid();
  laborRows.push(id);
  const div = document.createElement('div');
  div.className = 'labor-row';
  div.dataset.id = id;
  const today = new Date().toISOString().slice(0,10);
  div.innerHTML = `
    <button class="remove" data-remove="${id}">Remove</button>
    <div class="grid2">
      <div><label>Date</label><input type="date" class="l-date" value="${today}"></div>
      <div><label>Technician</label><input type="text" class="l-tech" value="${escapeHtml(settings.techName)}"></div>
    </div>
    <div class="grid3">
      <div><label>Miles</label><input type="number" class="l-miles" step="0.1"></div>
      <div><label>Start</label><input type="time" class="l-start"></div>
      <div><label>End</label><input type="time" class="l-end"></div>
    </div>
    <div class="grid2">
      <div><label>Arrive</label><input type="time" class="l-arrive"></div>
      <div><label>Total hrs</label><input type="number" class="l-total" step="0.01"></div>
    </div>
    <div class="chip-select">
      <div class="chip l-reg on" data-kind="reg">Regular</div>
      <div class="chip l-ot" data-kind="ot">Overtime</div>
    </div>
  `;
  laborList.appendChild(div);
  const startEl=div.querySelector('.l-start'), endEl=div.querySelector('.l-end'), totEl=div.querySelector('.l-total');
  function autoHours(){
    if (startEl.value && endEl.value){
      const [sh,sm]=startEl.value.split(':').map(Number);
      const [eh,em]=endEl.value.split(':').map(Number);
      let mins = (eh*60+em)-(sh*60+sm);
      if (mins<0) mins += 24*60;
      totEl.value = (mins/60).toFixed(2);
      recalc();
    }
  }
  startEl.addEventListener('change', autoHours);
  endEl.addEventListener('change', autoHours);
  totEl.addEventListener('input', recalc);
  const regChip = div.querySelector('.l-reg'), otChip = div.querySelector('.l-ot');
  regChip.addEventListener('click', ()=>{ regChip.classList.add('on'); otChip.classList.remove('on'); recalc(); });
  otChip.addEventListener('click', ()=>{ otChip.classList.add('on'); regChip.classList.remove('on'); recalc(); });
  div.querySelector('.l-miles').addEventListener('input', recalc);
  div.querySelector('[data-remove]').addEventListener('click', ()=>{
    laborRows = laborRows.filter(x=>x!==id);
    div.remove();
    recalc();
  });
  if (data){
    div.querySelector('.l-date').value = data.date||today;
    div.querySelector('.l-tech').value = data.tech||settings.techName;
    div.querySelector('.l-miles').value = data.miles||'';
    startEl.value = data.start||''; endEl.value = data.end||'';
    div.querySelector('.l-arrive').value = data.arrive||'';
    totEl.value = data.total||'';
    if (data.overtime){ otChip.classList.add('on'); regChip.classList.remove('on'); }
  }
}
document.getElementById('addLaborBtn').addEventListener('click', ()=>addLaborRow());

function getLaborData(){
  return Array.from(laborList.children).map(div=>({
    date: div.querySelector('.l-date').value,
    tech: div.querySelector('.l-tech').value.trim(),
    miles: parseFloat(div.querySelector('.l-miles').value)||0,
    start: div.querySelector('.l-start').value,
    arrive: div.querySelector('.l-arrive').value,
    end: div.querySelector('.l-end').value,
    total: parseFloat(div.querySelector('.l-total').value)||0,
    overtime: div.querySelector('.l-ot').classList.contains('on'),
  })).filter(r=>r.tech||r.miles||r.start||r.end||r.total);
}

/* ---------- totals ---------- */
function fmt(n){ return '$' + (Math.round(n*100)/100).toFixed(2); }
let taxManuallyEdited = false;
document.getElementById('taxAmt').addEventListener('input', ()=>{ taxManuallyEdited = true; recalc(); });
document.getElementById('miscAmt').addEventListener('input', recalc);
document.getElementById('freightAmt').addEventListener('input', recalc);

function recalc(){
  const parts = getPartsData();
  const partsTotal = parts.reduce((s,r)=>s+r.qty*r.unit,0);
  const labor = getLaborData();
  const laborTotal = labor.reduce((s,r)=> s + r.total * (r.overtime? settings.otRate : settings.laborRate), 0);
  const travelTotal = labor.reduce((s,r)=> s + r.miles * settings.mileRate, 0);
  const misc = parseFloat(document.getElementById('miscAmt').value)||0;
  const freight = parseFloat(document.getElementById('freightAmt').value)||0;
  if (!taxManuallyEdited){
    document.getElementById('taxAmt').value = (partsTotal * settings.taxRate/100).toFixed(2);
  }
  const tax = parseFloat(document.getElementById('taxAmt').value)||0;
  const grand = laborTotal+travelTotal+partsTotal+misc+freight+tax;
  document.getElementById('totLabor').textContent = fmt(laborTotal);
  document.getElementById('totTravel').textContent = fmt(travelTotal);
  document.getElementById('totParts').textContent = fmt(partsTotal);
  document.getElementById('totGrand').textContent = fmt(grand);
  return {partsTotal, laborTotal, travelTotal, misc, freight, tax, grand};
}

/* ---------- signature pads ----------
   Canvases are sized from getBoundingClientRect(), which returns 0x0 for anything inside a
   display:none container. Since the signature canvases start out hidden (import step shows
   first), setting them up naively at page load left them permanently 0x0 — signing silently did
   nothing, and any stray toDataURL() on a 0x0 canvas could hand pdf-lib invalid PNG bytes and
   crash PDF generation. makeSignaturePad() below skips (rather than corrupts) a resize while
   hidden, and callers must re-resize once a canvas actually becomes visible. */
const signatureData = {}; // canvasId -> dataURL (or undefined if empty)

function makeSignaturePad(canvas, hint, opts={}){
  const ctx = canvas.getContext('2d');
  let drawing = false, hasInk = false, last = null;

  function resize(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false; // hidden/not laid out yet — don't corrupt
    const ratio = window.devicePixelRatio || 1;
    const prevData = hasInk ? canvas.toDataURL() : null;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    if (prevData){
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = prevData;
    }
    return true;
  }
  window.addEventListener('resize', resize);

  function pos(evt){
    const rect = canvas.getBoundingClientRect();
    const t = evt.touches ? evt.touches[0] : evt;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(evt){
    evt.preventDefault();
    drawing = true;
    last = pos(evt);
    if (hint) hint.style.display = 'none';
  }
  function move(evt){
    if (!drawing) return;
    evt.preventDefault();
    const p = pos(evt);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    hasInk = true;
  }
  function end(){
    if (!drawing) return;
    drawing = false;
    if (opts.onChange) opts.onChange();
  }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end);

  return {
    resize,
    hasInk: () => hasInk,
    // Crops to just the drawn ink (plus a small margin) before exporting. Without this, a
    // signature drawn on a tall portrait canvas (like the expand modal, which fills the phone
    // screen) keeps that tall/narrow shape — fitting it into the form's wide/short signature box
    // then shrinks it down to a barely-visible sliver to satisfy the height constraint.
    dataURL(){
      if (canvas.width <= 1 || canvas.height <= 1 || !hasInk) return null;
      const w = canvas.width, h = canvas.height;
      const imgData = ctx.getImageData(0, 0, w, h).data;
      let minX=w, minY=h, maxX=-1, maxY=-1;
      for (let y=0; y<h; y++){
        const rowStart = y*w*4;
        for (let x=0; x<w; x++){
          if (imgData[rowStart + x*4 + 3] > 10){
            if (x<minX) minX=x; if (x>maxX) maxX=x;
            if (y<minY) minY=y; if (y>maxY) maxY=y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return null;
      const pad = Math.round(Math.max(w,h)*0.015);
      minX = Math.max(0, minX-pad); minY = Math.max(0, minY-pad);
      maxX = Math.min(w-1, maxX+pad); maxY = Math.min(h-1, maxY+pad);
      const cw = maxX-minX+1, ch = maxY-minY+1;
      const out = document.createElement('canvas');
      out.width = cw; out.height = ch;
      out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
      return out.toDataURL('image/png');
    },
    clear(){
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);
      hasInk = false;
      if (hint) hint.style.display = 'block';
    },
    // Draws a (possibly already-cropped) signature image centered and aspect-fit into the
    // canvas, rather than stretching it to fill — stretching would distort a cropped wide/short
    // signature when it's reloaded into a tall portrait canvas (e.g. reopening the expand modal).
    loadFrom(dataUrl){
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(rect.width/img.width, rect.height/img.height, 1) * 0.85;
        const w = img.width*scale, h = img.height*scale;
        ctx.drawImage(img, (rect.width-w)/2, (rect.height-h)/2, w, h);
        hasInk = true;
        if (hint) hint.style.display = 'none';
      };
      img.src = dataUrl;
    },
  };
}

const sigPads = {
  custSigCanvas: makeSignaturePad(
    document.getElementById('custSigCanvas'), document.getElementById('custSigHint'),
    { onChange: () => { signatureData.custSigCanvas = sigPads.custSigCanvas.dataURL(); } }
  ),
  techSigCanvas: makeSignaturePad(
    document.getElementById('techSigCanvas'), document.getElementById('techSigHint'),
    { onChange: () => { signatureData.techSigCanvas = sigPads.techSigCanvas.dataURL(); } }
  ),
};
document.querySelectorAll('[data-clear-sig]').forEach(btn=>{
  btn.addEventListener('click', ()=> { sigPads[btn.dataset.clearSig].clear(); delete signatureData[btn.dataset.clearSig]; });
});

/* ---------- expand-to-sign modal ---------- */
const sigModal = document.getElementById('sigModal');
const sigModalPad = makeSignaturePad(
  document.getElementById('sigModalCanvas'), document.getElementById('sigModalHint'),
  { lineWidth: 3 }
);
let sigModalTarget = null;
document.querySelectorAll('[data-expand-sig]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    sigModalTarget = btn.dataset.expandSig;
    document.getElementById('sigModalTitle').textContent =
      sigModalTarget === 'custSigCanvas' ? 'Customer signature' : 'Tech signature';
    sigModal.classList.add('open');
    sigModalPad.clear();
    requestAnimationFrame(() => {
      sigModalPad.resize();
      sigModalPad.loadFrom(signatureData[sigModalTarget]);
    });
  });
});
function closeSigModal(){
  sigModal.classList.remove('open');
  sigModalTarget = null;
}
document.getElementById('sigModalCancel').addEventListener('click', closeSigModal);
document.getElementById('sigModalClear').addEventListener('click', ()=> sigModalPad.clear());
document.getElementById('sigModalDone').addEventListener('click', ()=>{
  if (!sigModalTarget) return;
  const url = sigModalPad.dataURL();
  if (url){
    signatureData[sigModalTarget] = url;
    sigPads[sigModalTarget].clear();
    sigPads[sigModalTarget].loadFrom(url);
  }
  closeSigModal();
});

/* ---------- quick fill / autofill import ---------- */
if (window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs.worker.min.js';
}

function fillIfEmpty(id, val){
  if (!val) return false;
  const el = document.getElementById(id);
  if (!el || el.value.trim()) return false;
  el.value = String(val).trim();
  return true;
}

/* ---------- PDF text extraction, sorted by true visual position ----------
   Auto-generated tickets (ServiceNow print-to-PDF, browser-printed job tickets) often store
   text in an internal stream order that does NOT match reading order — label and value can be
   scrambled. Sorting every text run by (Y position, then X position) reconstructs the actual
   visual layout regardless of stream order. A " | " marker is inserted for big horizontal gaps
   so multi-column tables don't get glued into one run-on line. */
async function extractPdfText(pdf){
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const words = content.items
      .map(it => ({ str: it.str, x0: it.transform[4], x1: it.transform[4] + it.width, y: it.transform[5] }))
      .filter(w => w.str.trim().length > 0);
    words.sort((a,b) => b.y - a.y || a.x0 - b.x0);

    const lines = [];
    let current = null;
    for (const w of words){
      if (!current || Math.abs(w.y - current.refY) > 3){
        current = { refY: w.y, items: [] };
        lines.push(current);
      }
      current.items.push(w);
    }
    for (const line of lines) line.items.sort((a,b)=>a.x0-b.x0);

    const pageLines = lines.map(line => {
      let text = '';
      let prevX1 = null;
      for (const w of line.items){
        if (prevX1 !== null) text += (w.x0 - prevX1 > 25) ? ' | ' : ' ';
        text += w.str;
        prevX1 = w.x1;
      }
      return text;
    });
    fullText += pageLines.join('\n') + '\n\n';
  }
  return fullText;
}

/* ---------- shared extraction helpers ---------- */

// Finds a label, then returns its value: same line first (stopping at the next label/newline/
// column-break), otherwise the first non-empty column segment of the next line. Handles both
// "Label: value" and "Label\nvalue" (stacked) layouts.
function findLabelValue(text, labelSource){
  const re = new RegExp(labelSource, 'i');
  const m = re.exec(text);
  if (!m) return null;
  const isMarker = s => /^[*•·\-]+$/.test(s); // required-field asterisk/bullet, not a real value
  const after = text.slice(m.index + m[0].length);
  const nl = after.indexOf('\n');
  const pipe = after.indexOf('|');
  const cands = [nl, pipe].filter(x => x >= 0);
  const boundary = cands.length ? Math.min(...cands) : after.length;
  const sameLine = after.slice(0, boundary).trim();
  // If the label's own line already has content, that's the value — a bare marker there means
  // this field's value area is genuinely empty (the marker belongs visually to the NEXT field),
  // so stop rather than searching further and grabbing the next field's content.
  if (sameLine) return isMarker(sameLine) ? null : sameLine;
  for (const rawLine of after.split('\n')){
    const line = rawLine.trim();
    if (!line || isMarker(line)) continue;
    const seg = line.split(/\s*\|\s*/)[0].trim();
    if (seg && !isMarker(seg)) return seg;
  }
  return null;
}

function windowAfter(text, re, chars){
  const m = re.exec(text);
  if (!m) return null;
  return text.slice(m.index + m[0].length, m.index + m[0].length + chars);
}

function findBlock(text, startRe, endRe){
  const s = startRe.exec(text);
  if (!s) return null;
  const from = s.index + s[0].length;
  const rest = text.slice(from);
  const e = endRe.exec(rest);
  return rest.slice(0, e ? e.index : rest.length);
}

const STREET_SUFFIX = /\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|ct|court|suite|ste|pkwy|parkway|hwy|highway)\b/i;

function findAddressLine(text){
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.find(l => /^\d+\s+\S/.test(l) && STREET_SUFFIX.test(l)) || null;
}

// Same as findAddressLine but scoped to a window after a label, so it can't grab an unrelated
// street address that happens to appear earlier in the document (e.g. a vendor's letterhead).
function findAddressLineNear(text, labelRe, windowChars){
  const w = windowAfter(text, labelRe, windowChars);
  if (!w) return null;
  const line = w.split('\n').map(l => l.trim()).find(l => /^\d+\s+\S/.test(l) && STREET_SUFFIX.test(l));
  return line ? line.split('|')[0].trim() : null;
}

// Finds a phone number within a window after a label, avoiding unrelated numbers elsewhere
// in the document (e.g. a vendor's own letterhead phone/fax).
function findPhoneNear(text, labelRe, windowChars){
  const w = windowAfter(text, labelRe, windowChars);
  const m = w && w.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
  return m ? m[0] : null;
}

// Finds an ALL-CAPS multi-word name (a site/business name) within a window after a label,
// skipping section-header-style noise words that are also all-caps.
function findAllCapsNameNear(text, labelRe, windowChars){
  const w = windowAfter(text, labelRe, windowChars);
  if (!w) return null;
  const noise = /^(SERVICE|CATEGORY|SUBCATEGORY|INFORMATION|REQUESTED|ESTIMATE|WARRANTY|EMERGENCY|EQUIPMENT|NATURE|RESOLUTION|REPAIR|ACTIONS|TAKEN|BILLING|TERMS|RETURN)\b/;
  for (const rawLine of w.split('\n')){
    for (const seg of rawLine.split('|')){
      const s = seg.trim();
      if (s.length>=4 && s.length<=40 && /^[A-Z][A-Z&'.\s]+$/.test(s) && /\s/.test(s) && !noise.test(s)){
        return s;
      }
    }
  }
  return null;
}

function findCityStateZip(text){
  return text.match(/^\s*([A-Za-z][A-Za-z .]{1,30}?)\s*[,|]\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/m);
}

function titleCase(s){
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Only splits "Manufacturer Model" when the first word looks like a real brand word (letters
// only, no digits) — a code like "H5X" or "S700" is left alone rather than misread as a brand.
function guessManufacturerModel(desc){
  const words = desc.trim().split(/\s+/);
  if (words.length < 2) return {};
  if (/^[A-Za-z][A-Za-z'&.]{2,}$/.test(words[0])){
    return { manufacturer: words[0], model: words.slice(1).join(' ') };
  }
  return {};
}

// Checks the equipment description against the user's known-manufacturers list (Settings) first —
// a real match there is far more reliable than guessing from word shape. Falls back to the guess
// heuristic only if nothing on the list is found. Longer brand names are checked first so e.g.
// "La Marzocco" wins over a shorter unrelated partial match.
function splitManufacturerModel(desc){
  const list = (settings.manufacturers && settings.manufacturers.length ? settings.manufacturers : DEFAULT_MANUFACTURERS)
    .slice().sort((a,b)=>b.length-a.length);
  const lower = desc.toLowerCase();
  for (const brand of list){
    const bLower = brand.toLowerCase();
    const idx = lower.indexOf(bLower);
    if (idx === -1) continue;
    const beforeOk = idx === 0 || /[\s(]/.test(desc[idx-1]);
    const afterIdx = idx + brand.length;
    const afterOk = afterIdx >= desc.length || /[\s),]/.test(desc[afterIdx]);
    if (!beforeOk || !afterOk) continue;
    const model = (desc.slice(0, idx) + desc.slice(afterIdx)).replace(/\s+/g, ' ').trim();
    return { manufacturer: brand, model: model || null };
  }
  return guessManufacturerModel(desc);
}

/* ---------- generic fallback parser (unrecognized formats / free-typed paste) ---------- */
function parseGeneric(text){
  let filled = 0;
  const set = (id, val) => { if (val && fillIfEmpty(id, val)) filled++; };
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

  const labelHeaders = [
    [String.raw`\b(?:account|customer|business|company)(?: name)?\s*[:\-]\s*`, 'acctName'],
    [String.raw`\b(?:contact|attn|attention)(?: name)?\s*[:\-]\s*`, 'contactName'],
    [String.raw`\baddress\s*[:\-]\s*`, 'address'],
    [String.raw`\b(?:equipment|equip(?:ment)? description|unit)\s*[:\-]\s*`, 'equipDesc'],
    [String.raw`\b(?:manufacturer|make|brand)\s*[:\-]\s*`, 'manufacturer'],
    [String.raw`\bmodel\s*[:\-]\s*`, 'model'],
    [String.raw`\b(?:serial(?: ?#| ?number)?|s\/n)\s*[:\-]\s*`, 'serial'],
    [String.raw`\bvolts?\s*rated\s*[:\-]\s*`, 'voltsRated'],
    [String.raw`\bvolts?\s*supplied\s*[:\-]\s*`, 'voltsSupplied'],
    [String.raw`\b(?:po|purchase order)\s*#?\s*[:\-]\s*`, 'poNumber'],
  ];
  const found = [];
  for (const [src, id] of labelHeaders){
    const g = new RegExp(src, 'gi');
    let m;
    while ((m = g.exec(text)) !== null) found.push({ start: m.index, end: m.index + m[0].length, id });
  }
  found.sort((a,b)=>a.start-b.start);
  for (let i=0; i<found.length; i++){
    const cur = found[i];
    const nextStart = i+1 < found.length ? found[i+1].start : text.length;
    const nextNewline = text.indexOf('\n', cur.end);
    const boundary = nextNewline !== -1 ? Math.min(nextStart, nextNewline) : nextStart;
    let val = text.slice(cur.end, boundary).trim();
    if (val.length > 80) val = val.slice(0, 80).trim();
    set(cur.id, val);
  }

  const csz = findCityStateZip(text);
  if (csz){ set('city', csz[1]); set('state', csz[2]); set('zip', csz[3]); }

  if (!document.getElementById('address').value.trim()){
    const addrLine = findAddressLine(text);
    if (addrLine) set('address', addrLine);
  }

  const phones = [...text.matchAll(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)].map(m=>m[0]);
  if (phones[0]) set('phone1', phones[0]);
  if (phones[1]) set('phone2', phones[1]);

  return filled;
}

/* ---------- Panera / ServiceNow Facilities Work Order ---------- */
function parsePaneraTicket(text){
  let filled = 0;
  const set = (id, val) => { if (val && fillIfEmpty(id, val)) filled++; };

  const ticket = text.match(/\bFWKD\d+\b/);
  if (ticket) set('poNumber', ticket[0]);

  const summary = findLabelValue(text, String.raw`\*?\s*Problem\s+Summary\s*[:\n]?\s*`);
  const desc = findLabelValue(text, String.raw`\*?\s*Problem\s+Description\s*\/?\s*Special\s+Instructions\s*[:\n]?\s*`);
  const notesParts = [summary, desc].filter(v => v && !/^Problem\b/i.test(v));
  if (notesParts.length) set('notes', notesParts.join(' — '));

  const cafeWindow = windowAfter(text, /\*?\s*Cafe\s*[:\n]?\s*/i, 150);
  const cafeMatch = cafeWindow && cafeWindow.match(/(\d{4,6}):\s*([^\n|]+)/);
  if (cafeMatch) set('acctName', cafeMatch[2].trim());

  const fullAddr = findLabelValue(text, String.raw`Full\s+address\s*[:\n]?\s*`);
  if (fullAddr){
    const m = fullAddr.match(/^(.+?)\s*-\s*([A-Za-z .]+),\s*([A-Z]{2})\s+(\d{5})/);
    if (m){ set('address', m[1]); set('city', m[2]); set('state', m[3]); set('zip', m[4]); }
    else set('address', fullAddr);
  }

  const assetMatch = text.match(/\b\d{4,6}-([A-Za-z][^\n|]{2,60})/);
  if (assetMatch) set('equipDesc', assetMatch[1].trim());

  set('serial', findLabelValue(text, String.raw`Serial\s+Number\s*[:\n]?\s*`));
  set('model', findLabelValue(text, String.raw`Asset\s+Model\s*[:\n]?\s*`));
  set('phone1', findLabelValue(text, String.raw`Cafe\s+Contact\s+Number\s*[:\n]?\s*`));

  const reportedWindow = windowAfter(text, /\*?\s*Reported\s+By\s*[:\n]?\s*/i, 150);
  const nameMatch = reportedWindow && reportedWindow.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
  if (nameMatch) set('contactName', nameMatch[1]);

  const techWindow = windowAfter(text, /\*?\s*Vendor\s+Technician\s*[:\n]?\s*/i, 100);
  const techMatch = techWindow && techWindow.match(/\b([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)?)\b/);
  const firstLaborTech = laborList.firstElementChild && laborList.firstElementChild.querySelector('.l-tech');
  if (techMatch && firstLaborTech && !firstLaborTech.value.trim()){
    firstLaborTech.value = techMatch[1];
    filled++;
  }

  return filled;
}

/* ---------- Duke Service Co. "Total Coffee Equipment Care" Job Ticket ---------- */
function parseDukeTicket(text){
  let filled = 0;
  const set = (id, val) => { if (val && fillIfEmpty(id, val)) filled++; };

  const cs = text.match(/\bCS\d{5,}\b/);
  set('poNumber', cs ? cs[0] : null);

  const locationLabel = /Location\s+Name\s*[:\n]?\s*/i;
  set('acctName', findAllCapsNameNear(text, locationLabel, 250));

  const addrLine = findAddressLineNear(text, /\bAddr\b\s*[:\n]?\s*/i, 200);
  if (addrLine) set('address', addrLine);

  const csz = findCityStateZip(text);
  if (csz){ set('city', csz[1]); set('state', csz[2]); set('zip', csz[3]); }

  const contactMatch = text.match(/\b([A-Z][A-Z']+(?:\s+[A-Z][A-Z']+){1,3})\s+(MGR|MANAGER|GM|OWNER|CHEF|DIRECTOR|SUPERVISOR)\b/);
  if (contactMatch) set('contactName', titleCase(`${contactMatch[1]} ${contactMatch[2]}`));

  const phone = findPhoneNear(text, /\bPhone\b(?!\s*In\b)\s*[:\n]?\s*/i, 300);
  if (phone) set('phone1', phone);

  const servicesBlock = findBlock(text, /4\)\s*NATURE\s+OF\s+SERVICES\s+REQUESTED/i, /Service\s+Agent\s+Assigned|6\)\s*PART\s+USAGE/i);
  let equipDesc = null;
  const equipMatch = text.match(/\b((?:[A-Z]{2,}\s+)?[A-Z0-9][\w-]*\s+(?:WATER\s+BOILER|ESPRESSO\s+MACHINE|COFFEE\s+(?:BREWER|MACHINE|GRINDER)|GRINDER|BREWER|WARMER|ICE\s+MACHINE|DISHWASHER|OVEN|FRYER|MACHINE|BOILER))\b/i);
  if (equipMatch){
    equipDesc = equipMatch[1].replace(/\s+/g, ' ').trim();
    set('equipDesc', equipDesc);
    const guess = splitManufacturerModel(equipDesc);
    if (guess.manufacturer) set('manufacturer', guess.manufacturer);
    if (guess.model) set('model', guess.model);
  }
  if (servicesBlock){
    const sentences = servicesBlock.split(/\n|\|/).map(s=>s.trim())
      .filter(s => s.length>18 && s.toUpperCase() !== (equipDesc||'').toUpperCase());
    if (sentences.length) set('notes', sentences.join(' '));
  }

  const volts = text.match(/\b(\d{2,3})\s?V\b/);
  if (volts) set('voltsRated', volts[1] + 'V');

  return filled;
}

/* ---------- Franke / equipment-manufacturer forwarded service-request email ---------- */
function parseFrankeEmail(text){
  let filled = 0;
  const set = (id, val) => { if (val && fillIfEmpty(id, val)) filled++; };

  set('acctName', findLabelValue(text, String.raw`Location\s*:\s*`));

  const addrLine = findAddressLine(text);
  if (addrLine) set('address', addrLine);

  const csz = findCityStateZip(text);
  if (csz){
    set('city', csz[1]); set('state', csz[2]); set('zip', csz[3]);
    const afterCsz = text.slice(text.indexOf(csz[0]) + csz[0].length);
    const nextLine = afterCsz.split('\n').map(l=>l.trim()).find(l => l && !/^(phone|mobile|work order|machine)\b/i.test(l));
    if (nextLine) set('contactName', nextLine);
  }

  const phones = [...text.matchAll(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)].map(m=>m[0]);
  if (phones[0]) set('phone1', phones[0]);

  set('poNumber', findLabelValue(text, String.raw`Work\s+Order\s+Number\s*:\s*`));

  const machine = findLabelValue(text, String.raw`Machine\s*:\s*`);
  if (machine){
    set('equipDesc', machine);
    // The email is always from Franke Coffee Systems, so the manufacturer is known even though
    // "Franke" doesn't appear in the machine description text itself.
    const list = (settings.manufacturers && settings.manufacturers.length ? settings.manufacturers : DEFAULT_MANUFACTURERS);
    const frankeName = list.find(b => b.toLowerCase() === 'franke') || 'Franke';
    set('manufacturer', frankeName);
    set('model', machine);
    const afterMachine = text.slice(text.indexOf(machine) + machine.length);
    const serialLine = afterMachine.split('\n').map(l=>l.trim()).find(l=>/^\d{6,}$/.test(l));
    if (serialLine) set('serial', serialLine);
  }

  const block = findBlock(text, /Service\s+Request:\s*/i, /Technician\s+Instructions:/i);
  if (block){
    const cleaned = block.split('\n').map(l=>l.trim()).filter(Boolean).join(' ');
    if (cleaned) set('notes', cleaned.slice(0, 600));
  }

  return filled;
}

/* ---------- format detection + dispatcher ---------- */
function detectTicketFormat(text){
  if (/Facilities\s+Work\s+Orders/i.test(text)) return 'panera';
  if (/Total\s+Coffee\s+Equipment\s+Care/i.test(text) || /dukeservices\.com/i.test(text)) return 'duke';
  if (/franke\.com/i.test(text) || /Franke\s+Coffee\s+Systems/i.test(text)) return 'franke';
  return null;
}

function parseAndAutofill(text){
  if (!text || !text.trim()){ toast('Nothing to import'); return; }
  const fmt = detectTicketFormat(text);
  let filled;
  if (fmt === 'panera') filled = parsePaneraTicket(text);
  else if (fmt === 'duke') filled = parseDukeTicket(text);
  else if (fmt === 'franke') filled = parseFrankeEmail(text);
  else filled = parseGeneric(text);

  if (filled > 0) toast(`Imported ${filled} field${filled===1?'':'s'} — please review`);
  else toast('No matching fields found — you can enter details manually');
}

/* ---------- import step navigation ---------- */
function showMainForm(){
  document.getElementById('importStep').style.display = 'none';
  document.getElementById('mainForm').style.display = '';
  document.getElementById('mainFoot').style.display = '';
  document.getElementById('importAgainBtn').style.display = 'inline-block';
  document.getElementById('headerSubtitle').textContent = 'Fill fast, generate the real PDF';
  window.scrollTo(0,0);
  // The signature canvases were hidden (display:none) until now, so their earlier resize()
  // calls were no-ops — size them for real now that they have actual layout dimensions.
  requestAnimationFrame(() => {
    sigPads.custSigCanvas.resize();
    sigPads.techSigCanvas.resize();
  });
}
function showImportStep(){
  document.getElementById('importStep').style.display = '';
  document.getElementById('mainForm').style.display = 'none';
  document.getElementById('mainFoot').style.display = 'none';
  window.scrollTo(0,0);
}
document.getElementById('importAgainBtn').addEventListener('click', showImportStep);

document.getElementById('importBtn').addEventListener('click', ()=>{
  const text = document.getElementById('importText').value;
  if (text && text.trim()) parseAndAutofill(text);
  showMainForm();
});
document.getElementById('skipImportBtn').addEventListener('click', showMainForm);

document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  if (!window.pdfjsLib){ toast('PDF reader not available'); return; }
  toast('Reading PDF…');
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const text = await extractPdfText(pdf);
    document.getElementById('importText').value = text;
    parseAndAutofill(text);
    showMainForm();
  } catch(err){
    console.error(err);
    toast('Could not read that PDF');
  } finally {
    e.target.value = '';
  }
});

/* ---------- clear form ----------
   Only clears this work order's own data — saved customers/equipment and Settings (technician
   name, rates, manufacturers list, next WO#) are untouched. */
function clearFormFields(){
  document.querySelectorAll('input[type=text], input[type=number], input[type=date], input[type=time], textarea').forEach(el=>{
    if (el.id==='woNumber') return;
    el.value='';
  });
  partsList.innerHTML=''; partRows=[];
  laborList.innerHTML=''; laborRows=[];
  document.querySelectorAll('#serviceTypeChips .chip').forEach(c=>c.classList.remove('on'));
  document.getElementById('emailInvoice').checked=false;
  customerSelect.value=''; equipSelect.value='';
  document.getElementById('deleteCustomerBtn').style.display='none';
  document.getElementById('deleteEquipBtn').style.display='none';
  taxManuallyEdited=false;
  addPartRow(); addLaborRow();
  document.getElementById('techSignName').value = settings.techName;
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('custSignDate').value = today;
  document.getElementById('techSignDate').value = today;
  document.getElementById('importText').value = '';
  sigPads.custSigCanvas.clear();
  sigPads.techSigCanvas.clear();
  delete signatureData.custSigCanvas;
  delete signatureData.techSigCanvas;
  recalc();
}
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if (!confirm('Clear all fields on this work order? Saved customers/equipment/settings are kept.')) return;
  clearFormFields();
});
document.getElementById('newWorkOrderBtn').addEventListener('click', ()=>{
  if (!confirm('Start a new work order? This clears the current form (saved customers/equipment/settings are kept) and takes you back to the import step.')) return;
  clearFormFields();
  showImportStep();
});

/* ================= PDF GENERATION ================= */
function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function wrapText(str, font, size, maxWidth){
  const words = (str||'').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words){
    const test = cur ? cur+' '+w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur){
      lines.push(cur); cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function generatePdf(){
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const bytes = await fetch('template.pdf').then(r => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPages()[0];
  const H = 792;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const toY = (fromTop) => H - fromTop;

  function drawText(x, bottom, str, opts={}){
    if (!str) return;
    const size = opts.size||9;
    const useFont = opts.bold ? bold : font;
    let xx = x;
    if (opts.align==='right' && opts.maxX!=null){
      xx = opts.maxX - useFont.widthOfTextAtSize(str, size);
    } else if (opts.align==='center' && opts.maxX!=null){
      xx = opts.maxX - useFont.widthOfTextAtSize(str, size)/2;
    }
    page.drawText(str, { x: xx, y: toY(bottom), size, font: useFont, color: rgb(0,0,0) });
  }
  function whiteout(x0, top, x1, bottom, pad=1){
    page.drawRectangle({
      x: x0-pad, y: toY(bottom)-pad,
      width: (x1-x0)+2*pad, height: (bottom-top)+2*pad,
      color: rgb(1,1,1),
    });
  }
  function checkmark(x0, top, x1, bottom){
    const cx = (x0+x1)/2;
    const str = 'X';
    const size = 10;
    const w = bold.widthOfTextAtSize(str, size);
    page.drawText(str, { x: cx-w/2, y: toY(centerY(top, bottom, size)), size, font: bold, color: rgb(0,0,0) });
  }
  // True optical vertical centering: for text with no descenders, the visible glyph runs from
  // (baseline - capHeight) up to baseline, so centering it in a box means baseline = boxCenter +
  // capHeight/2. Helvetica's cap-height is ~0.7 of the font size.
  function centerY(top, bottom, size){
    return (top+bottom)/2 + 0.35*size;
  }

  // Work order # / PO #
  const woNumber = document.getElementById('woNumber').value.trim();
  const poNumber = document.getElementById('poNumber').value.trim();
  if (woNumber){
    whiteout(458.7, 34.0, 589, 51.3);
    drawText(0, centerY(34.0,51.3,12), woNumber, {align:'center', maxX:523.85, size:12, bold:true});
  }
  if (poNumber){
    drawText(0, centerY(68.6,85.3,11), poNumber, {align:'center', maxX:523.85, size:11});
  }
  if (document.getElementById('emailInvoice').checked){
    checkmark(482, 2, 492, 13.6);
  }

  // Service account — each value starts right after its OWN label (not a shared column) and is
  // vertically centered per row, matching a reference hand-filled form exactly.
  const F = 9.5; // standard field value size for these two sections
  const rowY = {
    r1: centerY(106.2,120.6,F), r2: centerY(120.6,135.0,F), r3: centerY(135.0,149.4,F),
    r4: centerY(149.4,163.8,F), r5: centerY(163.8,178.2,F),
  };
  drawText(60.5, rowY.r1, document.getElementById('acctName').value, {size:F});
  drawText(52.5, rowY.r2, document.getElementById('address').value, {size:F});
  drawText(41.2, rowY.r3, document.getElementById('city').value, {size:F});
  drawText(203.7, rowY.r3, document.getElementById('state').value, {size:F});
  drawText(278.0, rowY.r3, document.getElementById('zip').value, {size:F});
  drawText(69.7, rowY.r4, document.getElementById('contactName').value, {size:F});
  drawText(52.7, rowY.r5, document.getElementById('phone1').value, {size:F});
  drawText(212.0, rowY.r5, document.getElementById('phone2').value, {size:F});

  // Equipment
  drawText(409.9, rowY.r1, document.getElementById('equipDesc').value, {size:F});
  drawText(397.3, rowY.r2, document.getElementById('manufacturer').value, {size:F});
  drawText(379.2, rowY.r3, document.getElementById('model').value, {size:F});
  drawText(381.6, rowY.r4, document.getElementById('serial').value, {size:F});
  drawText(392.1, rowY.r5, document.getElementById('voltsRated').value, {size:F});
  drawText(518.2, rowY.r5, document.getElementById('voltsSupplied').value, {size:F});

  // Service type checkboxes
  const types = getServiceTypes();
  const boxes = {
    cleaning: [25.5,203.5,36.2,215.5],
    install: [138.9,203.5,149.6,215.5],
    scheduled: [207.2,203.5,217.9,215.5],
    emergency: [351.2,203.5,361.9,215.5],
    discussed: [459,203.5,470,215.5],
  };
  types.forEach(t => { if (boxes[t]) checkmark(...boxes[t]); });

  // Parts table
  const parts = getPartsData();
  const partRowEdges = [247.5,260.4,273.4,286.4,299.3,312.3,325.2];
  const partRowY = [];
  for (let i=0;i<6;i++) partRowY.push(centerY(partRowEdges[i], partRowEdges[i+1], 9));
  parts.slice(0,6).forEach((r, i)=>{
    const rb = partRowY[i];
    if (r.partNo) drawText(0, rb, r.partNo, {align:'center', maxX:62.35, size:9});
    if (r.desc) drawText(0, rb, r.desc, {align:'center', maxX:265.5, size:9});
    if (r.qty) drawText(0, rb, String(r.qty), {align:'center', maxX:463, size:9});
    if (r.unit) drawText(0, rb, r.unit.toFixed(2), {align:'right', maxX:530, size:9});
    const total = r.qty*r.unit;
    if (r.partNo||r.desc||r.qty||r.unit){
      whiteout(536.6, partRowEdges[i], 589, partRowEdges[i+1]);
      drawText(0, rb, '$'+total.toFixed(2), {align:'right', maxX:583, size:9});
    }
  });

  // Notes — small font matching the form's label size, preserving the author's own line breaks
  // (including blank lines between thoughts) rather than reflowing everything into one block.
  // Always leads with "Service Request: <nature of the request>" (from ticket import or typed
  // in); if there's a "Work performed" writeup, it follows two blank lines down, its own line
  // starting with "Work performed:".
  const serviceRequestVal = document.getElementById('notes').value.trim();
  const workPerformedVal = document.getElementById('workPerformed').value.trim();
  let notesText = 'Service Request: ' + serviceRequestVal;
  if (workPerformedVal) notesText += '\n\n\nWork performed: ' + workPerformedVal;
  {
    const NOTE_SIZE = 6.2;
    const renderLines = [];
    for (const rawLine of notesText.split('\n')){
      if (rawLine.trim() === ''){ renderLines.push(''); continue; }
      renderLines.push(...wrapText(rawLine, font, NOTE_SIZE, 545));
    }
    const noteLineY = centerY(337.5, 348.3, NOTE_SIZE);
    renderLines.slice(0,29).forEach((line,i)=> {
      if (line) drawText(28, noteLineY + i*10.8, line, {size:NOTE_SIZE});
    });
  }

  // Labor & travel — all values centered within their column and row
  const labor = getLaborData();
  const laborRowY = [centerY(680.8,696.35,7.6), centerY(696.35,711.9,7.6)];
  const cols = {
    date:   {c:39.45},
    tech:   {c:99.95},
    miles:  {c:160.7},
    start:  {c:194.1},
    arrive: {c:227.5},
    end:    {c:260.9},
    total:  {c:294.3},
  };
  function fmtTime(t){
    if (!t) return '';
    const [h,m] = t.split(':').map(Number);
    const ampm = h>=12 ? 'p':'a';
    let hh = h%12; if (hh===0) hh=12;
    return `${hh}:${String(m).padStart(2,'0')}${ampm}`;
  }
  const laborRowEdges = [680.8, 696.35, 711.9];
  labor.slice(0,2).forEach((r,i)=>{
    const rb = laborRowY[i];
    if (r.date){
      const d = new Date(r.date+'T00:00:00');
      drawText(0, rb, `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`, {size:7.6, align:'center', maxX:cols.date.c});
    }
    drawText(0, rb, r.tech, {size:7.6, align:'center', maxX:cols.tech.c});
    if (r.miles) drawText(0, rb, String(r.miles), {size:7.6, align:'center', maxX:cols.miles.c});
    drawText(0, rb, fmtTime(r.start), {size:7.6, align:'center', maxX:cols.start.c});
    drawText(0, rb, fmtTime(r.arrive), {size:7.6, align:'center', maxX:cols.arrive.c});
    drawText(0, rb, fmtTime(r.end), {size:7.6, align:'center', maxX:cols.end.c});
    if (r.total) drawText(0, rb, r.total.toFixed(2), {size:7.6, align:'center', maxX:cols.total.c});
    if (r.overtime) checkmark(345.25, laborRowEdges[i], 355.25, laborRowEdges[i+1]);
    else checkmark(318.25, laborRowEdges[i], 328.25, laborRowEdges[i+1]);
  });

  // Totals box (label positions approximate each row's center)
  const t = recalc();
  drawText(505, centerY(676.1,683.1,9), fmt(t.laborTotal), {align:'right', maxX:589});
  drawText(505, centerY(689.7,696.7,9), fmt(t.travelTotal), {align:'right', maxX:589});
  whiteout(531.8, 701.4, 557, 710.5);
  drawText(505, centerY(703.5,710.5,9), fmt(t.partsTotal), {align:'right', maxX:589});
  drawText(505, centerY(717.3,724.3,9), fmt(t.misc), {align:'right', maxX:589});
  drawText(505, centerY(731.0,738.0,9), fmt(t.freight), {align:'right', maxX:589});
  whiteout(531.8, 742.2, 558, 751.8);
  drawText(505, centerY(744.8,751.8,9), fmt(t.tax), {align:'right', maxX:589});
  whiteout(529.0, 756.3, 560, 767.5);
  drawText(505, centerY(758.4,767.4,11), fmt(t.grand), {align:'right', maxX:589, size:11, bold:true});

  // Signatures — print names left-aligned right after the label, larger size (matches reference)
  drawText(90, centerY(735.8,752.4,11.5), document.getElementById('custSignName').value, {size:11.5});
  drawText(97, centerY(752.4,769.0,11.5), document.getElementById('techSignName').value, {size:11.5});

  // Signature images (drawn onto the "Signature:" line of each row). Wrapped in try/catch so a
  // bad/empty capture skips just that signature instead of failing the whole PDF.
  async function drawSignature(canvasId, bottomLine){
    const dataUrl = signatureData[canvasId];
    if (!dataUrl) return;
    try {
      const pngBytes = b64ToBytes(dataUrl.split(',')[1]);
      if (pngBytes.length < 100) throw new Error('signature image too small/empty');
      const png = await pdfDoc.embedPng(pngBytes);
      const maxW = 145, maxH = 15;
      const scale = Math.min(maxW/png.width, maxH/png.height);
      const w = png.width*scale, h = png.height*scale;
      page.drawImage(png, { x: 239, y: toY(bottomLine)+1, width: w, height: h });
    } catch(err){
      console.error('Skipping signature (could not embed):', canvasId, err);
    }
  }
  await drawSignature('custSigCanvas', 752.4);
  await drawSignature('techSigCanvas', 769.0);

  const outBytes = await pdfDoc.save();
  return outBytes;
}

document.getElementById('generateBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('generateBtn');
  const orig = btn.textContent;
  btn.textContent = 'Generating…'; btn.disabled = true;
  try{
    const bytes = await generatePdf();
    const blob = new Blob([bytes], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const wo = document.getElementById('woNumber').value.trim() || 'workorder';
    const acct = document.getElementById('acctName').value.trim().replace(/[^a-z0-9]+/gi,'_') || 'customer';
    const filename = `WO_${wo}_${acct}.pdf`;

    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.open(url, '_blank');

    // bump next WO number
    const cur = parseInt(document.getElementById('woNumber').value) || settings.nextWO;
    settings.nextWO = cur + 1;
    LS.set('wo_settings', settings);
    document.getElementById('setNextWO').value = settings.nextWO;
    document.getElementById('woNumber').value = padWO(settings.nextWO);

    toast('PDF generated');
  } catch(e){
    console.error(e);
    toast('Error generating PDF — see console');
  } finally {
    btn.textContent = orig; btn.disabled = false;
  }
});

/* ---------- init ---------- */
function init(){
  loadSettingsForm();
  refreshCustomerSelect();
  refreshEquipSelect();
  document.getElementById('woNumber').value = padWO(settings.nextWO);
  document.getElementById('techSignName').value = settings.techName;
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('custSignDate').value = today;
  document.getElementById('techSignDate').value = today;
  addPartRow();
  addLaborRow();
  recalc();
}
init();
