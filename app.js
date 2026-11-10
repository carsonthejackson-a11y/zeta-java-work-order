/* Zeta Java work order. Plain JS, no build step, works offline.
   APP_VERSION must move together with CACHE_NAME in sw.js or phones keep serving the old files. */
const APP_VERSION = '6';

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');
// Local calendar date. toISOString() is UTC, which rolls over to tomorrow at 6-7pm Central.
function todayISO(){ const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function nowHM(){ const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmt(n){ return '$' + (Math.round(n*100)/100).toFixed(2); }
function trimNum(n){ return String(Math.round(n*100)/100); }
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* ---------- storage ---------- */
const LS = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v==null?d:v; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ console.error('Could not save', k, e); return false; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} },
};
const DEFAULT_MANUFACTURERS = [
  'BUNN','La Marzocco','Rancilio','Franke','Astoria','Nuova Simonelli','Wilbur Curtis','Curtis',
  'Grindmaster','Cecilware','Bloomfield','Newco','Fetco','Marco','Schaerer','WMF','Jura','Bravilor',
  'Animo','Crem','Egro','Thermoplan','Cimbali','La Cimbali','Faema','Saeco','Bezzera','ECM',
  'Victoria Arduino','Mahlkonig','Mazzer','Ditting','Anfim','Manitowoc','Hoshizaki','Scotsman',
  'Ice-O-Matic','Follett','Vitamix','Blendtec','Hamilton Beach',
];
const DEFAULT_SETTINGS = { techName:'', nextWO:1, laborRate:65, otRate:97.5, mileRate:0.67, taxRate:8.25, manufacturers: DEFAULT_MANUFACTURERS.slice(), rememberTechSig:false };
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('wo_settings', {}));
if (!Array.isArray(settings.manufacturers) || !settings.manufacturers.length){
  settings.manufacturers = DEFAULT_MANUFACTURERS.slice();
}
let customers = LS.get('wo_customers', []);
let equipment = LS.get('wo_equipment', []);

const mainForm = $('mainForm');
let booting = true;          // true while init/restore runs, so nothing autosaves half a form
let lastGenerated = null;    // { wo, at } once this work order has produced a PDF

/* ---------- toast (optionally with one action, e.g. Undo) ---------- */
function toast(msg, opts={}){
  const t = $('toast');
  const hide = () => t.classList.remove('show');
  t.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if (opts.action){
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = opts.action;
    b.addEventListener('click', () => { hide(); opts.onAction(); });
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(hide, opts.duration || (opts.action ? 7000 : 2400));
}

/* ---------- sheets (menu, settings, generated) ---------- */
let sheetReturnFocus = null;
function openSheet(id){
  sheetReturnFocus = document.activeElement;
  $(id).classList.add('open');
  document.body.classList.add('sheet-open');
  $(id).querySelector('.sheet-panel').focus({ preventScroll:true });   // keyboard and screen readers land inside
}
function closeSheet(id){
  if (!$(id).classList.contains('open')) return;
  $(id).classList.remove('open');
  if (!document.querySelector('.sheet.open, .sig-modal.open')) document.body.classList.remove('sheet-open');
  if (sheetReturnFocus && sheetReturnFocus.isConnected && !document.querySelector('.sheet.open')){
    sheetReturnFocus.focus({ preventScroll:true });
  }
  sheetReturnFocus = null;
}
document.querySelectorAll('.sheet').forEach(s => {
  s.addEventListener('click', (e) => {
    if (e.target === s || e.target.closest('[data-close-sheet]')) closeSheet(s.id);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('sigModal').classList.contains('open')){ closeSigModal(); return; }
  const open = document.querySelector('.sheet.open');
  if (open) closeSheet(open.id);
});
$('menuBtn').addEventListener('click', () => {
  const started = !mainForm.hidden;
  $('importAgainBtn').hidden = !started;
  $('resetBtn').hidden = !started;
  $('newWoHint').textContent = `Starts a blank form as #${padWO(settings.nextWO)}`;
  openSheet('menuSheet');
});

/* ---------- settings ---------- */
function padWO(n){ return String(n).padStart(6,'0'); }

function loadSettingsForm(){
  $('setTechName').value = settings.techName;
  $('setNextWO').value = settings.nextWO;
  $('setLaborRate').value = settings.laborRate;
  $('setOtRate').value = settings.otRate;
  $('setMileRate').value = settings.mileRate;
  $('setTaxRate').value = settings.taxRate;
  $('setManufacturers').value = settings.manufacturers.join(', ');
  $('versionText').textContent = `Version ${APP_VERSION}. Customers, equipment, settings and the current draft are stored on this device only.`;
}
function refreshMfrList(){
  $('mfrList').innerHTML = settings.manufacturers.map(m => `<option value="${escapeHtml(m)}">`).join('');
}
$('settingsToggle').addEventListener('click', () => {
  closeSheet('menuSheet');
  loadSettingsForm();
  openSheet('settingsSheet');
  autoGrow($('setManufacturers'));
});
$('saveSettingsBtn').addEventListener('click', () => {
  const manufacturers = $('setManufacturers').value.split(',').map(s=>s.trim()).filter(Boolean);
  const oldNext = settings.nextWO, oldTech = settings.techName;
  Object.assign(settings, {
    techName: $('setTechName').value.trim(),
    nextWO: parseInt($('setNextWO').value) || 1,
    laborRate: parseFloat($('setLaborRate').value) || 0,
    otRate: parseFloat($('setOtRate').value) || 0,
    mileRate: parseFloat($('setMileRate').value) || 0,
    taxRate: parseFloat($('setTaxRate').value) || 0,
    manufacturers: manufacturers.length ? manufacturers : DEFAULT_MANUFACTURERS.slice(),
  });
  LS.set('wo_settings', settings);
  // Carry a new name onto this work order wherever the old name (or nothing) is still sitting.
  const sign = $('techSignName');
  if (!sign.value.trim() || sign.value.trim() === oldTech) sign.value = settings.techName;
  laborList.querySelectorAll('.l-tech').forEach(el => {
    if (!el.value.trim() || el.value.trim() === oldTech) el.value = settings.techName;
  });
  // Only renumber the open work order when the counter itself was changed and this one
  // has not already gone out as a PDF under its current number.
  if (settings.nextWO !== oldNext && !isGenerated()) $('woNumber').value = padWO(settings.nextWO);
  refreshMfrList();
  closeSheet('settingsSheet');
  recalc(); updateHeader(); scheduleSave();
  toast('Settings saved');
});

/* ---------- customers ---------- */
const customerSelect = $('customerSelect');
function refreshCustomerSelect(selId){
  customerSelect.innerHTML = '<option value="">New customer</option>' +
    customers.map(c => `<option value="${c.id}">${escapeHtml(c.name||c.acctName)}</option>`).join('');
  customerSelect.value = selId && customers.some(c=>c.id===selId) ? selId : '';
  $('deleteCustomerBtn').hidden = !customerSelect.value;
}
customerSelect.addEventListener('change', () => {
  const c = customers.find(x=>x.id===customerSelect.value);
  $('deleteCustomerBtn').hidden = !c;
  refreshEquipSelect('', c ? c.id : null);
  if (!c) return;
  const map = { acctName:c.acctName, address:c.address, city:c.city, state:c.state, zip:c.zip,
    contactName:c.contactName, phone1:c.phone1, phone2:c.phone2, custSignName:c.contactName,
    customerSaveName:c.name||c.acctName };
  for (const id in map){ $(id).value = map[id] || ''; $(id).classList.remove('imported'); }
  scheduleSave();
});
$('saveCustomerBtn').addEventListener('click', () => {
  const name = $('customerSaveName').value.trim() || $('acctName').value.trim();
  if (!name){ toast('Add an account name first'); $('acctName').focus(); return; }
  const rec = {
    id: customerSelect.value || uid(),
    name,
    acctName: $('acctName').value.trim(),
    address: $('address').value.trim(),
    city: $('city').value.trim(),
    state: $('state').value.trim().toUpperCase(),
    zip: $('zip').value.trim(),
    contactName: $('contactName').value.trim(),
    phone1: $('phone1').value.trim(),
    phone2: $('phone2').value.trim(),
  };
  const idx = customers.findIndex(c=>c.id===rec.id);
  const isNew = idx < 0;
  if (isNew) customers.push(rec); else customers[idx] = rec;
  LS.set('wo_customers', customers);
  refreshCustomerSelect(rec.id);
  $('customerSaveName').value = name;
  scheduleSave();
  toast(isNew ? `Saved ${name}` : `Updated ${name}`);
});
$('deleteCustomerBtn').addEventListener('click', () => {
  const id = customerSelect.value;
  const idx = customers.findIndex(c=>c.id===id);
  if (idx < 0) return;
  const rec = customers[idx];
  customers.splice(idx, 1);
  LS.set('wo_customers', customers);
  refreshCustomerSelect();
  refreshEquipSelect('', null);
  scheduleSave();
  toast(`Deleted ${rec.name||'customer'} from saved customers`, { action:'Undo', onAction: () => {
    customers.splice(idx, 0, rec);
    LS.set('wo_customers', customers);
    refreshCustomerSelect(rec.id);
    refreshEquipSelect('', rec.id);
    scheduleSave();
  }});
});

/* ---------- equipment ---------- */
const equipSelect = $('equipSelect');
function refreshEquipSelect(selId, customerId){
  const list = customerId ? equipment.filter(e=>e.customerId===customerId) : equipment;
  equipSelect.innerHTML = '<option value="">New equipment</option>' +
    list.map(e => `<option value="${e.id}">${escapeHtml(e.name||e.description||e.model||'Equipment')}</option>`).join('');
  equipSelect.value = selId && list.some(e=>e.id===selId) ? selId : '';
  $('deleteEquipBtn').hidden = !equipSelect.value;
}
equipSelect.addEventListener('change', () => {
  const e = equipment.find(x=>x.id===equipSelect.value);
  $('deleteEquipBtn').hidden = !e;
  if (!e) return;
  const map = { equipDesc:e.description, manufacturer:e.manufacturer, model:e.model, serial:e.serial,
    voltsRated:e.voltsRated, voltsSupplied:e.voltsSupplied, equipSaveName:e.name||e.description };
  for (const id in map){ $(id).value = map[id] || ''; $(id).classList.remove('imported'); }
  scheduleSave();
});
$('saveEquipBtn').addEventListener('click', () => {
  const name = $('equipSaveName').value.trim() || $('equipDesc').value.trim() ||
    [$('manufacturer').value.trim(), $('model').value.trim()].filter(Boolean).join(' ');
  if (!name){ toast('Add an equipment description first'); $('equipDesc').focus(); return; }
  const rec = {
    id: equipSelect.value || uid(),
    name,
    customerId: customerSelect.value || null,
    description: $('equipDesc').value.trim(),
    manufacturer: $('manufacturer').value.trim(),
    model: $('model').value.trim(),
    serial: $('serial').value.trim(),
    voltsRated: $('voltsRated').value.trim(),
    voltsSupplied: $('voltsSupplied').value.trim(),
  };
  const idx = equipment.findIndex(e=>e.id===rec.id);
  const isNew = idx < 0;
  if (isNew) equipment.push(rec); else equipment[idx] = rec;
  LS.set('wo_equipment', equipment);
  refreshEquipSelect(rec.id, customerSelect.value || null);
  $('equipSaveName').value = name;
  scheduleSave();
  toast(isNew ? `Saved ${name}` : `Updated ${name}`);
});
$('deleteEquipBtn').addEventListener('click', () => {
  const id = equipSelect.value;
  const idx = equipment.findIndex(e=>e.id===id);
  if (idx < 0) return;
  const rec = equipment[idx];
  equipment.splice(idx, 1);
  LS.set('wo_equipment', equipment);
  refreshEquipSelect('', customerSelect.value || null);
  scheduleSave();
  toast(`Deleted ${rec.name||'equipment'} from saved equipment`, { action:'Undo', onAction: () => {
    equipment.splice(idx, 0, rec);
    LS.set('wo_equipment', equipment);
    refreshEquipSelect(rec.id, customerSelect.value || null);
    scheduleSave();
  }});
});

/* ---------- service type chips ---------- */
function setChip(chip, on){
  chip.classList.toggle('on', on);
  chip.setAttribute('aria-pressed', on ? 'true' : 'false');
}
document.querySelectorAll('#serviceTypeChips .chip').forEach(chip => {
  chip.addEventListener('click', () => { setChip(chip, !chip.classList.contains('on')); scheduleSave(); });
});
function getServiceTypes(){
  return Array.from(document.querySelectorAll('#serviceTypeChips .chip.on')).map(c=>c.dataset.val);
}

/* ---------- parts lines ---------- */
const MAX_PARTS = 6, MAX_LABOR = 2;   // what fits on the paper form
const partsList = $('partsList');

function insertRow(list, div, atIndex){
  const before = atIndex != null ? list.children[atIndex] : null;
  list.insertBefore(div, before || null);
}
function rowsChanged(){
  Array.from(partsList.children).forEach((d,i) => d.querySelector('.n').textContent = `Line ${i+1}`);
  Array.from(laborList.children).forEach((d,i) => d.querySelector('.n').textContent = `Row ${i+1}`);
  $('partsCount').textContent = `${partsList.children.length} of ${MAX_PARTS}`;
  $('laborCount').textContent = `${laborList.children.length} of ${MAX_LABOR}`;
  $('addPartBtn').disabled = partsList.children.length >= MAX_PARTS;
  $('addLaborBtn').disabled = laborList.children.length >= MAX_LABOR;
  recalc();
  scheduleSave();
}

function addPartRow(data, atIndex){
  if (partsList.children.length >= MAX_PARTS){ toast(`The form only has room for ${MAX_PARTS} lines`); return null; }
  const div = document.createElement('div');
  div.className = 'line-row part-row';
  div.innerHTML = `
    <div class="line-head">
      <span class="n"></span><span class="amt p-total">$0.00</span>
      <button type="button" class="iconbtn" data-remove aria-label="Remove this line">${ICON_X}</button>
    </div>
    <label class="field"><span class="lbl">Description</span><input type="text" class="p-desc" autocomplete="off" enterkeyhint="next"></label>
    <div class="g-part">
      <label class="field"><span class="lbl">Part no.</span><input type="text" class="p-partno" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="next"></label>
      <label class="field"><span class="lbl">Qty</span><input type="number" class="p-qty num" step="0.01" inputmode="decimal" enterkeyhint="next"></label>
      <label class="field"><span class="lbl">Unit $</span><input type="number" class="p-unit num" step="0.01" inputmode="decimal" enterkeyhint="next"></label>
    </div>`;
  insertRow(partsList, div, atIndex);
  const qtyEl = div.querySelector('.p-qty'), unitEl = div.querySelector('.p-unit'), totEl = div.querySelector('.p-total');
  function upd(){
    totEl.textContent = fmt((parseFloat(qtyEl.value)||0) * (parseFloat(unitEl.value)||0));
    recalc();
  }
  qtyEl.addEventListener('input', upd);
  unitEl.addEventListener('input', upd);
  div.querySelector('[data-remove]').addEventListener('click', () => {
    const saved = readPartRow(div);
    const idx = Array.from(partsList.children).indexOf(div);
    div.remove();
    rowsChanged();
    if (saved.partNo || saved.desc || saved.qty || saved.unit){
      toast('Line removed', { action:'Undo', onAction: () => { addPartRow(saved, idx); rowsChanged(); } });
    }
  });
  if (data){
    div.querySelector('.p-partno').value = data.partNo || '';
    div.querySelector('.p-desc').value = data.desc || '';
    qtyEl.value = data.qty || ''; unitEl.value = data.unit || '';
    totEl.textContent = fmt((parseFloat(qtyEl.value)||0) * (parseFloat(unitEl.value)||0));
  }
  return div;
}
$('addPartBtn').addEventListener('click', () => {
  const div = addPartRow();
  rowsChanged();
  if (div) div.querySelector('.p-desc').focus();
});

// Raw strings, every row: what the draft saves and what Undo puts back.
function readPartRow(div){
  return {
    partNo: div.querySelector('.p-partno').value.trim(),
    desc: div.querySelector('.p-desc').value.trim(),
    qty: div.querySelector('.p-qty').value,
    unit: div.querySelector('.p-unit').value,
  };
}
// Numbers, blank rows dropped: what the totals and the PDF use.
function getPartsData(){
  return Array.from(partsList.children).map(readPartRow)
    .map(r => ({ partNo:r.partNo, desc:r.desc, qty: parseFloat(r.qty)||0, unit: parseFloat(r.unit)||0 }))
    .filter(r => r.partNo || r.desc || r.qty || r.unit);
}

/* ---------- labor rows ---------- */
const laborList = $('laborList');

function timeField(rowId, key, label){
  return `<div class="field">
      <div class="lblrow"><label for="${rowId}-${key}">${label}</label><button type="button" class="nowbtn" data-now="${rowId}-${key}" aria-label="Set ${label} to now">Now</button></div>
      <input type="time" id="${rowId}-${key}" class="l-${key} num">
    </div>`;
}
function addLaborRow(data, atIndex){
  if (laborList.children.length >= MAX_LABOR){ toast(`The form only has room for ${MAX_LABOR} labor rows`); return null; }
  const id = 'l' + uid();
  const div = document.createElement('div');
  div.className = 'line-row labor-row';
  div.innerHTML = `
    <div class="line-head">
      <span class="n"></span><span class="amt l-amt"></span>
      <button type="button" class="iconbtn" data-remove aria-label="Remove this row">${ICON_X}</button>
    </div>
    <div class="g2">
      <label class="field"><span class="lbl">Date</span><input type="date" class="l-date"></label>
      <label class="field"><span class="lbl">Technician</span><input type="text" class="l-tech" autocomplete="off" autocapitalize="words"></label>
    </div>
    <div class="g2">${timeField(id,'start','Start')}${timeField(id,'arrive','Arrive')}</div>
    <div class="g2">
      ${timeField(id,'end','End')}
      <label class="field"><span class="lbl">Total hours</span><input type="number" class="l-total num" step="0.01" inputmode="decimal"></label>
    </div>
    <div class="g2">
      <label class="field"><span class="lbl">Miles</span><input type="number" class="l-miles num" step="0.1" inputmode="decimal"></label>
      <div class="field"><span class="lbl">Rate</span>
        <div class="seg" role="group" aria-label="Rate">
          <button type="button" class="l-reg on" aria-pressed="true">Regular</button>
          <button type="button" class="l-ot" aria-pressed="false">Overtime</button>
        </div>
      </div>
    </div>`;
  insertRow(laborList, div, atIndex);
  const startEl = div.querySelector('.l-start'), endEl = div.querySelector('.l-end'), totEl = div.querySelector('.l-total');
  function autoHours(){
    if (startEl.value && endEl.value){
      const [sh,sm] = startEl.value.split(':').map(Number);
      const [eh,em] = endEl.value.split(':').map(Number);
      let mins = (eh*60+em) - (sh*60+sm);
      if (mins < 0) mins += 24*60;
      totEl.value = (mins/60).toFixed(2);
      recalc();
    }
  }
  startEl.addEventListener('change', autoHours);
  endEl.addEventListener('change', autoHours);
  totEl.addEventListener('input', recalc);
  div.querySelector('.l-miles').addEventListener('input', recalc);
  div.querySelectorAll('[data-now]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = $(btn.dataset.now);
      el.value = nowHM();
      autoHours();
      scheduleSave();
    });
  });
  const regBtn = div.querySelector('.l-reg'), otBtn = div.querySelector('.l-ot');
  function setOt(ot){ setChip(otBtn, ot); setChip(regBtn, !ot); }
  regBtn.addEventListener('click', () => { setOt(false); recalc(); scheduleSave(); });
  otBtn.addEventListener('click', () => { setOt(true); recalc(); scheduleSave(); });
  div.querySelector('[data-remove]').addEventListener('click', () => {
    const saved = readLaborRow(div);
    const idx = Array.from(laborList.children).indexOf(div);
    div.remove();
    rowsChanged();
    if (saved.miles || saved.start || saved.arrive || saved.end || saved.total){
      toast('Labor row removed', { action:'Undo', onAction: () => { addLaborRow(saved, idx); rowsChanged(); } });
    }
  });
  div.querySelector('.l-date').value = (data && data.date) || todayISO();
  div.querySelector('.l-tech').value = data && data.tech != null ? data.tech : settings.techName;
  if (data){
    div.querySelector('.l-miles').value = data.miles || '';
    startEl.value = data.start || ''; endEl.value = data.end || '';
    div.querySelector('.l-arrive').value = data.arrive || '';
    totEl.value = data.total || '';
    setOt(!!data.overtime);
  }
  return div;
}
$('addLaborBtn').addEventListener('click', () => { addLaborRow(); rowsChanged(); });

function readLaborRow(div){
  return {
    date: div.querySelector('.l-date').value,
    tech: div.querySelector('.l-tech').value.trim(),
    miles: div.querySelector('.l-miles').value,
    start: div.querySelector('.l-start').value,
    arrive: div.querySelector('.l-arrive').value,
    end: div.querySelector('.l-end').value,
    total: div.querySelector('.l-total').value,
    overtime: div.querySelector('.l-ot').classList.contains('on'),
  };
}
function getLaborData(){
  return Array.from(laborList.children).map(readLaborRow)
    .map(r => Object.assign(r, { miles: parseFloat(r.miles)||0, total: parseFloat(r.total)||0 }))
    .filter(r => r.tech || r.miles || r.start || r.end || r.total);
}

/* ---------- totals ---------- */
let taxManuallyEdited = false;
$('taxAmt').addEventListener('input', () => { taxManuallyEdited = true; recalc(); });
$('miscAmt').addEventListener('input', recalc);
$('freightAmt').addEventListener('input', recalc);
$('subTax').addEventListener('click', (e) => {
  if (!e.target.closest('button')) return;
  taxManuallyEdited = false;
  recalc(); scheduleSave();
});

function recalc(){
  const parts = getPartsData();
  const partsTotal = parts.reduce((s,r)=>s+r.qty*r.unit,0);
  const labor = getLaborData();
  const laborTotal = labor.reduce((s,r)=> s + r.total * (r.overtime? settings.otRate : settings.laborRate), 0);
  const travelTotal = labor.reduce((s,r)=> s + r.miles * settings.mileRate, 0);
  const misc = parseFloat($('miscAmt').value)||0;
  const freight = parseFloat($('freightAmt').value)||0;
  if (!taxManuallyEdited){
    $('taxAmt').value = (partsTotal * settings.taxRate/100).toFixed(2);
  }
  const tax = parseFloat($('taxAmt').value)||0;
  const grand = laborTotal+travelTotal+partsTotal+misc+freight+tax;
  $('totLabor').textContent = fmt(laborTotal);
  $('totTravel').textContent = fmt(travelTotal);
  $('totParts').textContent = fmt(partsTotal);
  $('totGrand').textContent = fmt(grand);
  $('footTotal').textContent = fmt(grand);

  // Show the math, so a wrong rate or a typo in the hours is obvious before the PDF goes out.
  const regH = labor.filter(r=>!r.overtime).reduce((s,r)=>s+r.total,0);
  const otH = labor.filter(r=>r.overtime).reduce((s,r)=>s+r.total,0);
  const miles = labor.reduce((s,r)=>s+r.miles,0);
  $('subLabor').textContent = [
    regH ? `${trimNum(regH)} h × ${fmt(settings.laborRate)}` : '',
    otH ? `${trimNum(otH)} h overtime × ${fmt(settings.otRate)}` : '',
  ].filter(Boolean).join(' + ');
  $('subTravel').textContent = miles ? `${trimNum(miles)} mi × ${fmt(settings.mileRate)}` : '';
  $('subTax').innerHTML = taxManuallyEdited
    ? `Entered by hand. <button type="button" class="linkbtn">Use ${trimNum(settings.taxRate)}% of parts</button>`
    : `${trimNum(settings.taxRate)}% of parts`;
  Array.from(laborList.children).forEach(div => {
    const r = readLaborRow(div);
    const h = parseFloat(r.total)||0, mi = parseFloat(r.miles)||0;
    const amt = h * (r.overtime ? settings.otRate : settings.laborRate) + mi * settings.mileRate;
    div.querySelector('.l-amt').textContent = amt ? fmt(amt) : '';
  });
  return {partsTotal, laborTotal, travelTotal, misc, freight, tax, grand};
}

/* ---------- signatures ----------
   Signing happens only in the full-screen pad. The boxes in the form are previews you tap: a live
   canvas in the middle of a scrolling page catches every swipe that passes over it, and a canvas
   that starts out hidden has no size to draw on. */
const signatureData = {};   // 'custSigCanvas' | 'techSigCanvas' -> PNG data URL
const SIG = {
  custSigCanvas: { box:'custSigBox', img:'custSigImg', hint:'custSigHint', clear:'custSigClear', title:'Customer signature' },
  techSigCanvas: { box:'techSigBox', img:'techSigImg', hint:'techSigHint', clear:'techSigClear', title:'Technician signature' },
};
function setSignature(key, url, opts={}){
  const s = SIG[key];
  if (url) signatureData[key] = url; else delete signatureData[key];
  const img = $(s.img);
  if (url) img.src = url; else img.removeAttribute('src');
  img.hidden = !url;
  $(s.hint).hidden = !!url;
  $(s.clear).hidden = !url;
  $(s.box).classList.toggle('signed', !!url);
  if (key === 'techSigCanvas' && !opts.keepStored && settings.rememberTechSig){
    if (url) LS.set('wo_tech_sig', url); else LS.del('wo_tech_sig');
  }
}
document.querySelectorAll('[data-clear-sig]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.clearSig, old = signatureData[key];
    setSignature(key, null);
    scheduleSave();
    if (old) toast('Signature cleared', { action:'Undo', onAction: () => { setSignature(key, old); scheduleSave(); } });
  });
});
$('rememberTechSig').addEventListener('change', (e) => {
  settings.rememberTechSig = e.target.checked;
  LS.set('wo_settings', settings);
  if (settings.rememberTechSig && signatureData.techSigCanvas) LS.set('wo_tech_sig', signatureData.techSigCanvas);
  if (!settings.rememberTechSig) LS.del('wo_tech_sig');
});

function makeSignaturePad(canvas, hint, opts={}){
  const ctx = canvas.getContext('2d');
  let drawing = false, moved = false, hasInk = false, last = null, lastMid = null;

  function style(){
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = opts.lineWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
  }
  // Returns false while the canvas is hidden (0x0) instead of corrupting it. If the size has not
  // actually changed the ink is left alone: re-rasterising on every stray resize event blurs it.
  function resize(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width === w && canvas.height === h){ style(); return true; }
    const prev = hasInk ? dataURL() : null;
    canvas.width = w; canvas.height = h;
    style();
    if (prev) loadFrom(prev);
    return true;
  }
  window.addEventListener('resize', resize);

  function pos(evt){
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }
  canvas.addEventListener('pointerdown', (evt) => {
    if (evt.button > 0) return;
    evt.preventDefault();
    try { canvas.setPointerCapture(evt.pointerId); } catch(e){}
    drawing = true; moved = false;
    last = lastMid = pos(evt);
    if (hint) hint.hidden = true;
  });
  canvas.addEventListener('pointermove', (evt) => {
    if (!drawing) return;
    evt.preventDefault();
    const batch = evt.getCoalescedEvents ? evt.getCoalescedEvents() : [];
    for (const e of (batch.length ? batch : [evt])){
      const p = pos(e);
      const mid = { x:(last.x+p.x)/2, y:(last.y+p.y)/2 };
      ctx.beginPath();
      ctx.moveTo(lastMid.x, lastMid.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);   // smooth through the midpoints
      ctx.stroke();
      last = p; lastMid = mid;
    }
    moved = true; hasInk = true;
  });
  function stop(){
    if (!drawing) return;
    drawing = false;
    ctx.beginPath();
    if (moved){ ctx.moveTo(lastMid.x, lastMid.y); ctx.lineTo(last.x, last.y); ctx.stroke(); }
    else { ctx.arc(last.x, last.y, (opts.lineWidth||2)*0.6, 0, Math.PI*2); ctx.fill(); hasInk = true; }
    if (opts.onChange) opts.onChange();
  }
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  // Crops to just the drawn ink (plus a small margin) before exporting. Without this, a
  // signature drawn on a tall portrait canvas keeps that tall/narrow shape, and fitting it into
  // the form's wide/short signature box shrinks it to a barely-visible sliver.
  function dataURL(){
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
  }
  function clear(){
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInk = false;
    if (hint) hint.hidden = false;
  }
  // Draws an already-cropped signature centred and aspect-fit rather than stretched.
  function loadFrom(dataUrl){
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width/img.width, rect.height/img.height, 1) * 0.85;
      const w = img.width*scale, h = img.height*scale;
      ctx.drawImage(img, (rect.width-w)/2, (rect.height-h)/2, w, h);
      hasInk = true;
      if (hint) hint.hidden = true;
    };
    img.src = dataUrl;
  }
  return { resize, clear, loadFrom, dataURL, hasInk: () => hasInk };
}

const sigModal = $('sigModal');
let sigModalTarget = null, sigModalDirty = false;
const sigModalPad = makeSignaturePad($('sigModalCanvas'), $('sigModalHint'), { lineWidth: 3, onChange: () => { sigModalDirty = true; } });
document.querySelectorAll('[data-expand-sig]').forEach(btn => {
  btn.addEventListener('click', () => {
    sigModalTarget = btn.dataset.expandSig;
    $('sigModalTitle').textContent = SIG[sigModalTarget].title;
    // The customer signs under the same sentence that is printed on the paper form.
    $('sigModalSub').textContent = sigModalTarget === 'custSigCanvas'
      ? `Customer hereby authorizes Zeta Java to perform services specified above and agrees to pay accordingly. Total ${fmt(recalc().grand)}.`
      : '';
    if (document.activeElement) document.activeElement.blur();
    sigModal.classList.add('open');
    document.body.classList.add('sheet-open');
    sigModalPad.clear();
    sigModalDirty = false;
    requestAnimationFrame(() => {
      sigModalPad.resize();
      sigModalPad.loadFrom(signatureData[sigModalTarget]);
    });
  });
});
function closeSigModal(){
  sigModal.classList.remove('open');
  sigModalTarget = null;
  if (!document.querySelector('.sheet.open')) document.body.classList.remove('sheet-open');
}
$('sigModalCancel').addEventListener('click', closeSigModal);
$('sigModalClear').addEventListener('click', () => { sigModalPad.clear(); sigModalDirty = true; });
$('sigModalDone').addEventListener('click', () => {
  if (!sigModalTarget) return;
  if (!sigModalDirty){ closeSigModal(); return; }   // opened and closed without touching it
  setSignature(sigModalTarget, sigModalPad.hasInk() ? sigModalPad.dataURL() : null);
  scheduleSave();
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
  el.classList.add('imported');   // highlighted until the tech edits or dismisses it
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
      .map(it => ({ str: it.str, x0: it.transform[4], x1: it.transform[4] + it.width, y: it.transform[5],
        h: it.height || Math.abs(it.transform[3]) || 10 }))
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
        // Browser-printed PDFs often split one word into several runs ("D", "a", "ll", "a", "s")
        // that touch each other. Runs with no real gap between them are the same word.
        const gap = prevX1 === null ? 0 : w.x0 - prevX1;
        if (prevX1 !== null && !(gap < w.h * 0.1 && !/^\s|\s$/.test(w.str) && !/\s$/.test(text))){
          text += gap > 25 ? ' | ' : ' ';
        }
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
    firstLaborTech.classList.add('imported');
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
  if (!text || !text.trim()) return null;
  // A finished Zeta Java work order is this tool's own form, not a ticket. The ticket parsers
  // would pull the wrong things off it (Zeta Java's own phone as the customer's), so stop here.
  if (/SERVICE\s+WORK\s+ORDER/i.test(text) && /Zeta\s*Java/i.test(text) && /Acct\s+Name/i.test(text)){
    return { filled: 0, fmt: 'zeta' };
  }
  const fmt = detectTicketFormat(text);
  let filled;
  if (fmt === 'panera') filled = parsePaneraTicket(text);
  else if (fmt === 'duke') filled = parseDukeTicket(text);
  else if (fmt === 'franke') filled = parseFrankeEmail(text);
  else filled = parseGeneric(text);

  recalc();
  return { filled, fmt };
}

/* ---------- header, section nav ---------- */
function isGenerated(){
  return !!lastGenerated && lastGenerated.wo === $('woNumber').value.trim();
}
function clock(ts){
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  return d.toDateString() === new Date().toDateString() ? time
    : `${d.toLocaleDateString([], { month:'short', day:'numeric' })}, ${time}`;
}
let draftSavedAt = null;
function updateHeader(){
  const inForm = !mainForm.hidden;
  const wo = $('woNumber').value.trim();
  $('headerTitle').textContent = inForm ? 'Work order' : 'New work order';
  $('headerWo').textContent = wo ? '#' + wo : '';
  $('headerSubtitle').textContent = !inForm ? 'Zeta Java service form'
    : isGenerated() ? `PDF generated ${clock(lastGenerated.at)}`
    : draftSavedAt ? `Draft saved ${clock(draftSavedAt)}`
    : draftSavedAt === false ? 'Could not save a draft on this device'
    : 'Zeta Java service form';
}
function measureBar(){
  document.documentElement.style.setProperty('--bar-h', document.querySelector('.appbar').offsetHeight + 'px');
}
window.addEventListener('resize', measureBar);

const navLinks = Array.from(document.querySelectorAll('#sectionNav a'));
let navCurrent = null, navTick = false;
function updateNav(){
  navTick = false;
  if (mainForm.hidden) return;
  const line = document.querySelector('.appbar').offsetHeight + 24;
  let cur = navLinks[0];
  for (const a of navLinks){
    if ($(a.hash.slice(1)).getBoundingClientRect().top <= line) cur = a;
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = navLinks[navLinks.length-1];
  if (cur === navCurrent) return;
  navCurrent = cur;
  navLinks.forEach(a => {
    a.classList.toggle('on', a === cur);
    if (a === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
  const nav = $('sectionNav');
  nav.scrollTo({ left: cur.offsetLeft - nav.clientWidth/2 + cur.clientWidth/2, behavior:'smooth' });
}
window.addEventListener('scroll', () => {
  if (!navTick){ navTick = true; requestAnimationFrame(updateNav); }
}, { passive:true });
navLinks.forEach(a => a.addEventListener('click', (e) => {
  e.preventDefault();
  $(a.hash.slice(1)).scrollIntoView({ behavior:'smooth', block:'start' });
}));

/* ---------- draft autosave ----------
   The whole work order is written to this device a moment after every change, and put back on
   launch. Closing the tab, a phone call, or iOS unloading the app mid-job no longer loses it. */
const DRAFT_FIELDS = ['woNumber','poNumber','acctName','address','city','state','zip','contactName','phone1','phone2',
  'customerSaveName','equipDesc','manufacturer','model','serial','voltsRated','voltsSupplied','equipSaveName',
  'notes','workPerformed','miscAmt','freightAmt','taxAmt','custSignName','custSignDate','techSignName','techSignDate'];

function snapshot(){
  const fields = {};
  DRAFT_FIELDS.forEach(id => { fields[id] = $(id).value; });
  return {
    v: 1, savedAt: Date.now(),
    step: mainForm.hidden ? 'import' : 'form',
    visited: formVisited,
    fields,
    emailInvoice: $('emailInvoice').checked,
    customerId: customerSelect.value, equipId: equipSelect.value,
    serviceTypes: getServiceTypes(),
    parts: Array.from(partsList.children).map(readPartRow),
    labor: Array.from(laborList.children).map(readLaborRow),
    taxManual: taxManuallyEdited,
    sigs: Object.assign({}, signatureData),
    importText: $('importText').value,
    imported: Array.from(mainForm.querySelectorAll('.imported')).map(el => el.id).filter(Boolean),
    lastGenerated,
  };
}
function restore(s){
  const was = booting;
  booting = true;
  const f = s.fields || {};
  DRAFT_FIELDS.forEach(id => { if (id in f) $(id).value = f[id]; });
  $('emailInvoice').checked = !!s.emailInvoice;
  refreshCustomerSelect(s.customerId);
  refreshEquipSelect(s.equipId, customerSelect.value || null);
  document.querySelectorAll('#serviceTypeChips .chip').forEach(c => setChip(c, (s.serviceTypes||[]).includes(c.dataset.val)));
  partsList.innerHTML = ''; (s.parts||[]).forEach(p => addPartRow(p));
  laborList.innerHTML = ''; (s.labor||[]).forEach(l => addLaborRow(l));
  taxManuallyEdited = !!s.taxManual;
  const sigs = s.sigs || {};
  setSignature('custSigCanvas', sigs.custSigCanvas || null, { keepStored:true });
  setSignature('techSigCanvas', sigs.techSigCanvas || null, { keepStored:true });
  $('importText').value = s.importText || '';
  mainForm.querySelectorAll('.imported').forEach(el => el.classList.remove('imported'));
  (s.imported||[]).forEach(id => { if ($(id)) $(id).classList.add('imported'); });
  lastGenerated = s.lastGenerated || null;
  formVisited = !!s.visited;
  rowsChanged();
  updateNotesMeter();
  updateHeader();
  booting = was;
}
let saveTimer = null;
function scheduleSave(){
  if (booting) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, 350);
}
function saveDraftNow(){
  clearTimeout(saveTimer);
  if (booting) return;
  draftSavedAt = LS.set('wo_draft', snapshot()) ? Date.now() : false;
  updateHeader();
}
window.addEventListener('pagehide', saveDraftNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraftNow(); });

/* ---------- typing niceties ---------- */
function autoGrow(el){
  if (!el || el.offsetParent === null) return;   // hidden: no height to measure yet
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}
function formatPhone(v){
  if (/[a-z]/i.test(v)) return v.trim();          // "x204", "ask for Dana": leave it alone
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : v.trim();
}
mainForm.addEventListener('input', (e) => {
  const el = e.target;
  el.classList.remove('imported');
  if (el.id === 'state') el.value = el.value.toUpperCase();
  if (el.tagName === 'TEXTAREA') autoGrow(el);
  if (el.id === 'notes' || el.id === 'workPerformed') updateNotesMeter();
  if (el.id === 'woNumber') updateHeader();
  scheduleSave();
});
mainForm.addEventListener('change', scheduleSave);
mainForm.addEventListener('focusout', (e) => {
  if (e.target.type !== 'tel') return;
  const f = formatPhone(e.target.value);
  if (f !== e.target.value){ e.target.value = f; scheduleSave(); }
});
// Return on the keyboard moves to the next field instead of doing nothing.
mainForm.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
  e.preventDefault();
  const els = Array.from(mainForm.querySelectorAll('input:not([type=checkbox]):not([type=date]):not([type=time]), textarea'))
    .filter(el => el.offsetParent !== null && !el.disabled);
  const next = els[els.indexOf(e.target) + 1];
  if (next) next.focus(); else e.target.blur();
});
$('setManufacturers').addEventListener('input', (e) => autoGrow(e.target));
$('importText').addEventListener('input', scheduleSave);

/* ---------- import step navigation ---------- */
const FORMAT_NAMES = { panera:'Panera facilities ticket', duke:'Duke job ticket', franke:'Franke service request' };
let formVisited = false;

function showMainForm(){
  $('importStep').hidden = true;
  mainForm.hidden = false;
  $('mainFoot').hidden = false;
  $('sectionNav').hidden = false;
  formVisited = true;
  window.scrollTo(0, 0);
  updateHeader();
  measureBar();
  mainForm.querySelectorAll('textarea').forEach(autoGrow);
  navCurrent = null; updateNav();
  scheduleSave();
}
function showImportStep(){
  $('importStep').hidden = false;
  mainForm.hidden = true;
  $('mainFoot').hidden = true;
  $('sectionNav').hidden = true;
  $('skipImportBtn').textContent = formVisited ? 'Back to the work order' : 'Skip, enter by hand';
  window.scrollTo(0, 0);
  updateHeader();
  measureBar();
  scheduleSave();
}
function showImportNotice(res){
  const n = $('importNotice');
  if (!res){ n.hidden = true; return; }
  const pic = res.source === 'image';
  const from = FORMAT_NAMES[res.fmt] || (pic ? 'picture' : res.source === 'pdf' ? 'PDF' : 'pasted text');
  $('importNoticeText').innerHTML = res.filled > 0
    ? `<strong>${res.filled} field${res.filled===1?'':'s'} filled</strong> from the ${from}. ` + (pic
        ? 'It was read from a picture, so compare each highlighted field with the ticket.'
        : 'They stay highlighted until you edit them, so give each one a quick check.')
    : res.fmt === 'zeta'
      ? '<strong>Nothing filled.</strong> That is a finished Zeta Java work order, not a service ticket. Reading those back in is not built yet.'
    : `<strong>Nothing matched.</strong> ` + (pic
        ? 'The text read from the picture did not line up with any field. It is in the import box (Menu, Import a ticket) if you want to look.'
        : 'That text did not line up with any field, so enter the details by hand.');
  n.hidden = false;
}
$('importNoticeClose').addEventListener('click', () => {
  $('importNotice').hidden = true;
  mainForm.querySelectorAll('.imported').forEach(el => el.classList.remove('imported'));
  scheduleSave();
});
$('importAgainBtn').addEventListener('click', () => { closeSheet('menuSheet'); showImportStep(); });

$('importBtn').addEventListener('click', () => {
  const text = $('importText').value;
  const res = text && text.trim() ? parseAndAutofill(text) : null;
  showMainForm();
  showImportNotice(res);
});
$('skipImportBtn').addEventListener('click', showMainForm);

/* ---------- pasting or picking a ticket: text, screenshot, photo, PDF ----------
   Every route ends in the same place: the ticket's text lands in the import box, the parsers
   fill the form, and the form opens. Pictures and scanned PDFs are read on the device by the
   OCR engine in /ocr (nothing is uploaded). */
const importCard = $('importCard');
let importBusy = false;

function setImportStatus(text, frac){
  const box = $('importStatus'), fill = $('importStatusFill');
  if (!text){ box.hidden = true; return; }
  box.hidden = false;
  $('importStatusText').textContent = text;
  fill.classList.toggle('wait', frac == null);
  fill.style.width = frac == null ? '' : Math.round(Math.max(0.03, Math.min(1, frac)) * 100) + '%';
}
function isPdf(f){ return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); }
function isImage(f){ return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(f.name || ''); }

/* --- OCR engine, loaded only when a picture actually shows up --- */
const OCR_VERSION = '7.0.0';
let ocrWorker = null, ocrProgress = null;

function loadScript(src){
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('offline'));
    document.head.appendChild(el);
  });
}
async function getOcrWorker(){
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript('ocr/tesseract.min.js');
  const base = new URL('ocr', location.href).href.replace(/\/$/, '');
  const starting = Tesseract.createWorker('eng', 1, {
    workerPath: base + '/worker.min.js',
    corePath: base,            // a folder: the library picks the build this device supports
    langPath: base,
    workerBlobURL: false,      // load the worker by URL so the service worker can cache it
    gzip: true,
    cacheMethod: 'none',       // the service worker cache already keeps the language file
    logger: (m) => { if (ocrProgress) ocrProgress(m); },
    errorHandler: (e) => console.error('OCR worker:', e),
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 90000));
  ocrWorker = await Promise.race([starting, timeout]);
  LS.set('wo_ocr_ready', OCR_VERSION);
  return ocrWorker;
}
async function releaseOcr(){
  // The engine holds a lot of memory; let it go once the ticket is read.
  const w = ocrWorker; ocrWorker = null;
  if (w){ try { await w.terminate(); } catch(e){} }
}
// First launch with a connection: fetch the engine in the background so that reading a
// picture also works later with no signal. About 7 MB, once.
function prewarmOcr(){
  if (!('serviceWorker' in navigator) || LS.get('wo_ocr_ready', '') === OCR_VERSION) return;
  if (navigator.connection && navigator.connection.saveData) return;
  navigator.serviceWorker.ready.then(() => setTimeout(() => {
    if (!navigator.serviceWorker.controller || !navigator.onLine || importBusy || ocrWorker) return;
    getOcrWorker().then(releaseOcr).catch(() => {});
  }, 4000)).catch(() => {});
}

// Scales the picture to a size the reader likes and flips light-on-dark (dark-mode
// screenshots) to dark-on-light, which it reads far more reliably.
function prepCanvas(src, w, h){
  const longSide = Math.max(w, h);
  let scale = 1;
  if (longSide > 2600) scale = 2600 / longSide;
  else if (longSide < 1100) scale = Math.min(2, 1100 / longSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 37){ sum += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; n++; }
  if (n && sum / n < 110){
    for (let i = 0; i < d.length; i += 4){ d[i] = 255-d[i]; d[i+1] = 255-d[i+1]; d[i+2] = 255-d[i+2]; }
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}
async function imageFileToCanvas(file){
  let src = null;
  if (window.createImageBitmap){
    try { src = await createImageBitmap(file, { imageOrientation:'from-image' }); } catch(e){ src = null; }
  }
  if (!src){
    src = await new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }
  return prepCanvas(src, src.width, src.height);
}

// Rebuilds reading order from where the words sit on the page, the same way extractPdfText
// does for PDFs: words on one visual row become one line, and a wide gap becomes " | " so a
// two-column ticket does not run its columns together.
function layoutOcr(data){
  const segs = [];
  for (const block of data.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []){
    const words = (line.words || []).filter(w => w.text && w.text.trim() && w.confidence > 15);
    if (!words.length) continue;
    const h = line.bbox.y1 - line.bbox.y0;
    let cur = [words[0]];
    const flush = () => segs.push({ x0: cur[0].bbox.x0, y0: line.bbox.y0, y1: line.bbox.y1, text: cur.map(w => w.text.trim()).join(' ') });
    for (let i = 1; i < words.length; i++){
      if (words[i].bbox.x0 - words[i-1].bbox.x1 > h * 1.9){ flush(); cur = [words[i]]; }
      else cur.push(words[i]);
    }
    flush();
  }
  segs.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const sg of segs){
    const row = rows[rows.length - 1];
    const overlap = row ? Math.min(row.y1, sg.y1) - Math.max(row.y0, sg.y0) : -1;
    if (row && overlap > 0.5 * Math.min(row.y1 - row.y0, sg.y1 - sg.y0)) row.parts.push(sg);
    else rows.push({ y0: sg.y0, y1: sg.y1, parts: [sg] });
  }
  return rows.map(r => r.parts.sort((a, b) => a.x0 - b.x0).map(p => p.text).join(' | ')).join('\n');
}
async function ocrCanvas(canvas, label){
  ocrProgress = (m) => {
    if (m.status === 'recognizing text') setImportStatus(`Reading the ${label}`, m.progress);
    else setImportStatus('Getting the text reader ready', null);
  };
  setImportStatus('Getting the text reader ready', null);
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return (layoutOcr(data) || data.text || '').trim();
}
async function pdfFileToText(file){
  if (!window.pdfjsLib) throw new Error('nopdf');
  setImportStatus('Reading the PDF', null);
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const text = await extractPdfText(pdf);
  if (text.replace(/\s/g, '').length > 20) return { text, source: 'pdf' };
  // No text layer: it is a scan. Render the pages and read them like photos.
  let out = '';
  const pages = Math.min(pdf.numPages, 3);
  for (let p = 1; p <= pages; p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    out += await ocrCanvas(prepCanvas(canvas, canvas.width, canvas.height), pages > 1 ? `scan, page ${p} of ${pages}` : 'scan') + '\n\n';
  }
  return { text: out, source: 'image' };
}

async function importFiles(fileList){
  const files = Array.from(fileList || []).filter(f => isPdf(f) || isImage(f));
  if (!files.length){ toast('That is not a picture or a PDF'); return; }
  if (importBusy) return;
  importBusy = true;
  importCard.classList.add('busy');
  try {
    const texts = [];
    let source = 'pdf';
    for (let i = 0; i < files.length; i++){
      const f = files[i];
      if (isPdf(f)){
        const r = await pdfFileToText(f);
        if (r.source === 'image') source = 'image';
        texts.push(r.text);
      } else {
        source = 'image';
        const label = files.length > 1 ? `picture ${i+1} of ${files.length}` : 'picture';
        texts.push(await ocrCanvas(await imageFileToCanvas(f), label));
      }
    }
    const text = texts.map(t => t.trim()).filter(Boolean).join('\n\n');
    if (text.replace(/\s/g, '').length < 12){
      toast('No readable text in that. Try a sharper picture, or paste the text', { duration: 6000 });
      return;
    }
    $('importText').value = text;
    const res = parseAndAutofill(text);
    res.source = source;
    showMainForm();
    showImportNotice(res);
  } catch(err){
    console.error(err);
    const m = err && err.message;
    toast(m === 'offline' ? 'The text reader needs one online launch before it can read pictures. Paste the text for now'
      : m === 'unreadable' ? 'That picture could not be opened. Try a screenshot or a PDF'
      : m === 'nopdf' ? 'The PDF reader did not load. Paste the text instead'
      : 'Could not read that. Paste the text instead', { duration: 7000 });
  } finally {
    setImportStatus(null);
    importBusy = false;
    importCard.classList.remove('busy');
    releaseOcr();
  }
}

// Paste button: asks the clipboard for whatever is on it. Text wins when both are present
// (apps often put a picture of copied text next to the text itself).
$('pasteBtn').addEventListener('click', async () => {
  let text = '', files = [];
  try {
    if (navigator.clipboard && navigator.clipboard.read){
      for (const item of await navigator.clipboard.read()){
        if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
        const pdfType = item.types.find(t => t === 'application/pdf');
        const imgType = item.types.find(t => t.startsWith('image/'));
        if (pdfType) files.push(new File([await item.getType(pdfType)], 'clipboard.pdf', { type: pdfType }));
        else if (imgType) files.push(new File([await item.getType(imgType)], 'clipboard.png', { type: imgType }));
      }
    } else {
      text = await navigator.clipboard.readText();
    }
  } catch(err){
    toast('Paste was blocked. Press and hold in the box, then choose Paste');
    $('importText').focus();
    return;
  }
  if (text.trim()){
    $('importText').value = text;
    scheduleSave();
    toast('Pasted. Tap Import and continue');
  } else if (files.length){
    importFiles(files);
  } else {
    toast('Nothing on the clipboard to paste');
  }
});

// Pasting straight into the box or anywhere on this screen (press-and-hold Paste, Ctrl/Cmd+V).
document.addEventListener('paste', (e) => {
  if ($('importStep').hidden || document.querySelector('.sheet.open')) return;
  const cd = e.clipboardData;
  if (!cd) return;
  const text = cd.getData('text/plain');
  const files = Array.from(cd.files || []).filter(f => isPdf(f) || isImage(f));
  if (files.length && !text.trim()){
    e.preventDefault();
    importFiles(files);
  } else if (text.trim() && e.target !== $('importText')){
    e.preventDefault();
    $('importText').value = text;
    scheduleSave();
    toast('Pasted. Tap Import and continue');
  }
});

// Dropping a file on the card (desktop).
['dragenter', 'dragover'].forEach(type => importCard.addEventListener(type, (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
  e.preventDefault();
  importCard.classList.add('drop');
}));
['dragleave', 'drop'].forEach(type => importCard.addEventListener(type, (e) => {
  importCard.classList.remove('drop');
  if (type === 'drop' && e.dataTransfer && e.dataTransfer.files.length){
    e.preventDefault();
    importFiles(e.dataTransfer.files);
  }
}));

$('importFile').addEventListener('change', (e) => {
  const picked = Array.from(e.target.files || []);
  e.target.value = '';
  if (picked.length) importFiles(picked);
});

/* ---------- clear form / new work order ----------
   Only clears this work order's own data. Saved customers, saved equipment and Settings are
   untouched. Both actions can be undone from the toast instead of asking "are you sure?" first. */
function clearFormFields(){
  const wasGenerated = isGenerated();
  // Scoped to #mainForm: the Settings sheet has its own inputs that must not be blanked.
  mainForm.querySelectorAll('input[type=text], input[type=tel], input[type=number], input[type=date], input[type=time], textarea').forEach(el => {
    if (el.id === 'woNumber') return;
    el.value = '';
    el.classList.remove('imported');
  });
  $('miscAmt').value = '0'; $('freightAmt').value = '0';
  partsList.innerHTML = ''; laborList.innerHTML = '';
  document.querySelectorAll('#serviceTypeChips .chip').forEach(c => setChip(c, false));
  $('emailInvoice').checked = false;
  refreshCustomerSelect(); refreshEquipSelect();
  taxManuallyEdited = false;
  addPartRow(); addLaborRow();
  $('techSignName').value = settings.techName;
  $('custSignDate').value = todayISO();
  $('techSignDate').value = todayISO();
  $('importText').value = '';
  $('importNotice').hidden = true;
  setSignature('custSigCanvas', null);
  setSignature('techSigCanvas', settings.rememberTechSig ? LS.get('wo_tech_sig', null) : null, { keepStored:true });
  // A number that already went out on a PDF is never handed to the next job.
  if (wasGenerated) $('woNumber').value = padWO(settings.nextWO);
  lastGenerated = null;
  rowsChanged();
  updateNotesMeter();
  mainForm.querySelectorAll('textarea').forEach(autoGrow);
  updateHeader();
}
function undoTo(snap){
  restore(snap);
  if (snap.step === 'form') showMainForm(); else showImportStep();
  mainForm.querySelectorAll('textarea').forEach(autoGrow);
  saveDraftNow();
}
$('resetBtn').addEventListener('click', () => {
  closeSheet('menuSheet');
  const snap = snapshot();
  clearFormFields();
  window.scrollTo(0, 0);
  saveDraftNow();
  toast('Form cleared', { action:'Undo', onAction: () => undoTo(snap) });
});
function startNewWorkOrder(){
  const snap = snapshot();
  clearFormFields();
  $('woNumber').value = padWO(settings.nextWO);
  formVisited = false;
  showImportStep();
  saveDraftNow();
  toast(`New work order #${$('woNumber').value}`, { action:'Undo', onAction: () => undoTo(snap) });
}
$('newWorkOrderBtn').addEventListener('click', () => { closeSheet('menuSheet'); startNewWorkOrder(); });

/* ================= PDF GENERATION ================= */

// The form is drawn in Helvetica with WinAnsi encoding, which throws on anything outside
// Latin-1 plus a handful of extras. One ohm sign or emoji in the notes used to kill the whole
// PDF. This swaps what has a plain equivalent and drops what does not.
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const PDF_SWAPS = {
  'Ω':'ohm', 'Ω':'ohm', '→':'->', '←':'<-', '↑':'up', '↓':'down',
  '≤':'<=', '≥':'>=', '≠':'!=', '≈':'~', '−':'-', '‐':'-', '‑':'-',
  '′':"'", '″':'"', '✓':'OK', '✔':'OK', '✕':'x', '✗':'x', '℃':'°C', '℉':'°F',
};
function pdfSafe(str){
  let out = '';
  for (const ch of String(str == null ? '' : str)){
    const cp = ch.codePointAt(0);
    if (ch === '\n'){ out += ch; continue; }
    if (ch === '\t'){ out += ' '; continue; }
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
    if (cp <= 0x7e || (cp >= 0xa0 && cp <= 0xff) || WIN_EXTRA.includes(ch)){ out += ch; continue; }
    if (PDF_SWAPS[ch]){ out += PDF_SWAPS[ch]; continue; }
    if ((cp >= 0x200b && cp <= 0x200f) || cp === 0x2060 || cp === 0xfeff || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
    if (cp === 0x2028 || cp === 0x2029){ out += '\n'; continue; }
    if (cp >= 0x2000 && cp <= 0x200a){ out += ' '; continue; }
    let plain = '';
    for (const b of ch.normalize('NFKD')){
      const c = b.codePointAt(0);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) plain += b;
    }
    out += plain || (cp > 0xffff || (cp >= 0x2600 && cp <= 0x27bf) ? '' : '?');
  }
  return out;
}

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

// Notes block: small font matching the form's label size, keeping the author's own line breaks
// (including blank lines between thoughts) rather than reflowing everything into one block.
// Always leads with "Service Request: ..."; a "Work performed" write-up follows two blank lines
// down. Shared by the PDF and by the on-screen line meter so the two can never disagree.
const NOTE_SIZE = 6.2, NOTE_WIDTH = 545, NOTE_MAX_LINES = 29;
function noteLines(font){
  const request = pdfSafe($('notes').value.trim());
  const work = pdfSafe($('workPerformed').value.trim());
  let text = 'Service Request: ' + request;
  if (work) text += '\n\n\nWork performed: ' + work;
  const out = [];
  for (const rawLine of text.split('\n')){
    if (rawLine.trim() === ''){ out.push(''); continue; }
    out.push(...wrapText(rawLine, font, NOTE_SIZE, NOTE_WIDTH));
  }
  return out;
}
let measureFont = null;   // real Helvetica metrics from pdf-lib, loaded once at start-up
function updateNotesMeter(){
  if (!measureFont) return;
  const n = noteLines(measureFont).length;
  const over = n - NOTE_MAX_LINES;
  $('notesMeter').classList.toggle('over', over > 0);
  $('notesMeterFill').style.width = Math.min(100, n / NOTE_MAX_LINES * 100) + '%';
  $('notesMeterText').textContent = over > 0
    ? `${over} line${over===1?'':'s'} too long. The end will not print`
    : `${n} of ${NOTE_MAX_LINES} lines on the form`;
  return over;
}

function shortDate(iso){
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

async function generatePdf(){
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const bytes = await fetch('template.pdf').then(r => {
    if (!r.ok) throw new Error('The blank form (template.pdf) did not load.');
    return r.arrayBuffer();
  });
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPages()[0];
  const H = 792;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const toY = (fromTop) => H - fromTop;
  const val = (id) => $(id).value.trim();

  // opts.maxW: the width the box actually has. Text that would run past it is shrunk (down to
  // about 70%) and then cut with an ellipsis, instead of printing over the next box.
  function drawText(x, bottom, str, opts={}){
    str = pdfSafe(str).replace(/\s*\n\s*/g, ' ').trim();
    if (!str) return;
    let size = opts.size||9;
    const useFont = opts.bold ? bold : font;
    if (opts.maxW){
      const w = useFont.widthOfTextAtSize(str, size);
      if (w > opts.maxW){
        size = Math.max(size*0.7, size*opts.maxW/w);
        while (str.length > 2 && useFont.widthOfTextAtSize(str, size) > opts.maxW){
          str = str.slice(0, -2).trimEnd() + '…';
        }
      }
    }
    let xx = x;
    if (opts.align==='right' && opts.maxX!=null){
      xx = opts.maxX - useFont.widthOfTextAtSize(str, size);
    } else if (opts.align==='center' && opts.maxX!=null){
      xx = opts.maxX - useFont.widthOfTextAtSize(str, size)/2;
    }
    page.drawText(str, { x: xx, y: toY(bottom), size, font: useFont, color: rgb(0,0,0) });
  }
  // Covers a printed placeholder ("$ 0.00", the sample work order number). Kept just inside the
  // box so it hides the placeholder without erasing the box's own border lines.
  function whiteout(x0, top, x1, bottom){
    page.drawRectangle({ x: x0, y: toY(bottom), width: x1-x0, height: bottom-top, color: rgb(1,1,1) });
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
  const woNumber = val('woNumber');
  const poNumber = val('poNumber');
  if (woNumber){
    whiteout(486, 34.7, 561, 51.2);
    drawText(0, centerY(34.0,51.3,12), woNumber, {align:'center', maxX:523.85, size:12, bold:true, maxW:122});
  }
  if (poNumber){
    drawText(0, centerY(68.6,85.3,11), poNumber, {align:'center', maxX:523.85, size:11, maxW:122});
  }
  if ($('emailInvoice').checked){
    checkmark(482, 2, 492, 13.6);
  }

  // Service account: each value starts right after its OWN label (not a shared column) and is
  // vertically centered per row, matching a reference hand-filled form exactly.
  const F = 9.5; // standard field value size for these two sections
  const rowY = {
    r1: centerY(106.2,120.6,F), r2: centerY(120.6,135.0,F), r3: centerY(135.0,149.4,F),
    r4: centerY(149.4,163.8,F), r5: centerY(163.8,178.2,F),
  };
  drawText(60.5, rowY.r1, val('acctName'), {size:F, maxW:277});
  drawText(52.5, rowY.r2, val('address'), {size:F, maxW:285});
  drawText(41.2, rowY.r3, val('city'), {size:F, maxW:140});
  drawText(203.7, rowY.r3, val('state').toUpperCase(), {size:F, maxW:57});
  drawText(278.0, rowY.r3, val('zip'), {size:F, maxW:60});
  drawText(69.7, rowY.r4, val('contactName'), {size:F, maxW:268});
  drawText(52.7, rowY.r5, val('phone1'), {size:F, maxW:128});
  drawText(212.0, rowY.r5, val('phone2'), {size:F, maxW:126});

  // Equipment
  drawText(409.9, rowY.r1, val('equipDesc'), {size:F, maxW:176});
  drawText(397.3, rowY.r2, val('manufacturer'), {size:F, maxW:188});
  drawText(379.2, rowY.r3, val('model'), {size:F, maxW:206});
  drawText(381.6, rowY.r4, val('serial'), {size:F, maxW:204});
  drawText(392.1, rowY.r5, val('voltsRated'), {size:F, maxW:79});
  drawText(518.2, rowY.r5, val('voltsSupplied'), {size:F, maxW:68});

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
    if (r.partNo) drawText(0, rb, r.partNo, {align:'center', maxX:62.35, size:9, maxW:74});
    if (r.desc) drawText(0, rb, r.desc, {align:'center', maxX:265.5, size:9, maxW:320});
    if (r.qty) drawText(0, rb, String(r.qty), {align:'center', maxX:463, size:9, maxW:48});
    if (r.unit) drawText(0, rb, r.unit.toFixed(2), {align:'right', maxX:530, size:9, maxW:46});
    whiteout(545, partRowEdges[i]+1.4, 580, partRowEdges[i+1]-1.4);
    drawText(0, rb, '$'+(r.qty*r.unit).toFixed(2), {align:'right', maxX:583, size:9, maxW:44});
  });

  // Notes
  const noteLineY = centerY(337.5, 348.3, NOTE_SIZE);
  noteLines(font).slice(0, NOTE_MAX_LINES).forEach((line,i)=> {
    if (line) drawText(28, noteLineY + i*10.8, line, {size:NOTE_SIZE});
  });

  // Labor & travel: all values centered within their column and row
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
    drawText(0, rb, shortDate(r.date), {size:7.6, align:'center', maxX:cols.date.c});
    drawText(0, rb, r.tech, {size:7.6, align:'center', maxX:cols.tech.c, maxW:84});
    if (r.miles) drawText(0, rb, String(r.miles), {size:7.6, align:'center', maxX:cols.miles.c});
    drawText(0, rb, fmtTime(r.start), {size:7.6, align:'center', maxX:cols.start.c});
    drawText(0, rb, fmtTime(r.arrive), {size:7.6, align:'center', maxX:cols.arrive.c});
    drawText(0, rb, fmtTime(r.end), {size:7.6, align:'center', maxX:cols.end.c});
    if (r.total) drawText(0, rb, r.total.toFixed(2), {size:7.6, align:'center', maxX:cols.total.c});
    if (r.overtime) checkmark(345.25, laborRowEdges[i], 355.25, laborRowEdges[i+1]);
    else checkmark(318.25, laborRowEdges[i], 328.25, laborRowEdges[i+1]);
  });

  // Totals box (label positions approximate each row's center). Right edge sits 4pt inside the
  // box so the cents do not print on top of the border.
  const t = recalc();
  const TX = 585;
  drawText(505, centerY(676.1,683.1,9), fmt(t.laborTotal), {align:'right', maxX:TX});
  drawText(505, centerY(689.7,696.7,9), fmt(t.travelTotal), {align:'right', maxX:TX});
  whiteout(531.5, 701.2, 557.5, 710.6);
  drawText(505, centerY(703.5,710.5,9), fmt(t.partsTotal), {align:'right', maxX:TX});
  drawText(505, centerY(717.3,724.3,9), fmt(t.misc), {align:'right', maxX:TX});
  drawText(505, centerY(731.0,738.0,9), fmt(t.freight), {align:'right', maxX:TX});
  whiteout(531.5, 742.0, 557.5, 751.6);
  drawText(505, centerY(744.8,751.8,9), fmt(t.tax), {align:'right', maxX:TX});
  whiteout(528.5, 756.0, 560.5, 767.7);
  drawText(505, centerY(758.4,767.4,11), fmt(t.grand), {align:'right', maxX:TX, size:11, bold:true});

  // Signatures: print names left-aligned right after the label, larger size (matches reference)
  drawText(90, centerY(735.8,752.4,11.5), val('custSignName'), {size:11.5, maxW:114});
  drawText(97, centerY(752.4,769.0,11.5), val('techSignName'), {size:11.5, maxW:107});

  // Dates beside each signature. The customer's date only prints when the customer actually
  // signed or printed a name, so an unsigned work order does not carry a dated blank line.
  if (signatureData.custSigCanvas || val('custSignName')){
    drawText(408.5, centerY(735.8,752.4,8.5), shortDate($('custSignDate').value), {size:8.5, maxW:39});
  }
  if (signatureData.techSigCanvas || val('techSignName')){
    drawText(408.5, centerY(752.4,769.0,8.5), shortDate($('techSignDate').value), {size:8.5, maxW:39});
  }

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

  return pdfDoc.save();
}

/* ---------- generate, then share / open / download ---------- */
let lastPdf = null;   // { file, url, filename }

function canShareFile(file){
  try { return !!(navigator.canShare && navigator.canShare({ files:[file] })); } catch(e){ return false; }
}
function downloadLastPdf(){
  if (!lastPdf) return;
  const a = document.createElement('a');
  a.href = lastPdf.url; a.download = lastPdf.filename;
  document.body.appendChild(a); a.click(); a.remove();
}
// Things worth a second look before the PDF leaves the phone. Informational, never a blocker:
// plenty of real work orders go out without a customer signature.
function blankItems(){
  const out = [];
  if (!$('acctName').value.trim()) out.push('account name');
  if (!$('equipDesc').value.trim() && !$('model').value.trim()) out.push('equipment');
  if (!getServiceTypes().length) out.push('service type');
  if (!getLaborData().some(r => r.total)) out.push('labor hours');
  if (!signatureData.custSigCanvas) out.push('customer signature');
  if (!signatureData.techSigCanvas) out.push('tech signature');
  return out;
}
function showResult(total){
  $('resultTitle').textContent = `Work order #${$('woNumber').value.trim() || 'unnumbered'} is ready`;
  $('resultFile').textContent = `${lastPdf.filename} · ${fmt(total)}`;
  const blank = blankItems();
  const over = measureFont ? noteLines(measureFont).length - NOTE_MAX_LINES : 0;
  const bits = [];
  if (blank.length) bits.push(`Left blank: ${blank.join(', ')}.`);
  if (over > 0) bits.push(`The notes ran ${over} line${over===1?'':'s'} past the form and were cut off.`);
  $('resultBlank').textContent = bits.join(' ');
  $('resultBlank').hidden = !bits.length;
  const share = canShareFile(lastPdf.file);
  $('resultShare').hidden = !share;
  $('resultDownload').classList.toggle('btn-primary', !share);
  $('resultDownload').classList.toggle('btn-secondary', share);
  openSheet('resultSheet');
}
$('generateBtn').addEventListener('click', async () => {
  const btn = $('generateBtn');
  const orig = btn.textContent;
  btn.textContent = 'Building the PDF'; btn.disabled = true;
  try {
    const total = recalc().grand;
    const bytes = await generatePdf();
    const wo = $('woNumber').value.trim();
    const acct = $('acctName').value.trim().replace(/[^a-z0-9]+/gi,'_').slice(0,40).replace(/^_+|_+$/g,'') || 'customer';
    const filename = `WO_${wo || 'workorder'}_${acct}.pdf`;
    if (lastPdf) URL.revokeObjectURL(lastPdf.url);
    const file = new File([bytes], filename, { type:'application/pdf' });
    lastPdf = { file, url: URL.createObjectURL(file), filename };

    // Advance the counter, but leave THIS work order's number alone. Fixing a typo and
    // generating again keeps the same number; the next number is used by New work order.
    const n = parseInt(wo, 10);
    if (!isNaN(n)) settings.nextWO = n + 1;
    else if (!isGenerated()) settings.nextWO += 1;
    LS.set('wo_settings', settings);
    lastGenerated = { wo, at: Date.now() };
    saveDraftNow();

    showResult(total);
    // No share sheet (desktop browsers): drop it straight into Downloads.
    if (!canShareFile(file)) downloadLastPdf();
  } catch(e){
    console.error(e);
    toast(`Could not build the PDF. ${e && e.message ? e.message : ''}`.trim(), { duration:7000 });
  } finally {
    btn.textContent = orig; btn.disabled = false;
  }
});
$('resultShare').addEventListener('click', async () => {
  if (!lastPdf) return;
  try {
    await navigator.share({ files:[lastPdf.file], title: lastPdf.filename });
  } catch(e){
    if (e && e.name !== 'AbortError') toast('Sharing did not start. Use Open or Download');
  }
});
$('resultOpen').addEventListener('click', () => { if (lastPdf) window.open(lastPdf.url, '_blank'); });
$('resultDownload').addEventListener('click', downloadLastPdf);
$('resultNext').addEventListener('click', () => { closeSheet('resultSheet'); startNewWorkOrder(); });

/* ---------- init ---------- */
function init(){
  loadSettingsForm();
  refreshMfrList();
  refreshCustomerSelect();
  refreshEquipSelect();
  $('rememberTechSig').checked = !!settings.rememberTechSig;

  const draft = LS.get('wo_draft', null);
  if (draft && draft.v === 1){
    restore(draft);
    draftSavedAt = draft.savedAt || null;
    if (draft.step === 'form') showMainForm(); else showImportStep();
  } else {
    $('woNumber').value = padWO(settings.nextWO);
    $('techSignName').value = settings.techName;
    $('custSignDate').value = todayISO();
    $('techSignDate').value = todayISO();
    addPartRow();
    addLaborRow();
    if (settings.rememberTechSig) setSignature('techSigCanvas', LS.get('wo_tech_sig', null), { keepStored:true });
    rowsChanged();
    showImportStep();
  }
  booting = false;
  updateHeader();

  // Real font metrics for the notes line meter (same wrapping code the PDF uses).
  if (window.PDFLib){
    PDFLib.PDFDocument.create()
      .then(doc => doc.embedFont(PDFLib.StandardFonts.Helvetica))
      .then(f => { measureFont = f; updateNotesMeter(); })
      .catch(console.error);
  }
  prewarmOcr();
}
init();
