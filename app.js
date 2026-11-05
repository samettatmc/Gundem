/* Gündem — uygulama kodu
 * Bölümler:
 *   1. Sabitler ve tarih yardımcıları
 *   2. Hızlı tarih çözümleyici ("yarın", "cuma", "4 gün sonra", "10 kasım")
 *   3. Veri katmanı (Supabase + internetsizken çalışan yerel kopya ve bekleyen değişiklikler)
 *   4. Ekranlar (sekme listesi TABS dizisinde; yeni bölüm eklemek = buraya bir sekme eklemek)
 *   5. Olaylar, giriş, açılış
 */
'use strict';

/* ---------- 1. Sabitler ---------- */
const VERSION = '3.1.0';
// Hangi ortamda çalışıyoruz: Android uygulaması, Windows uygulaması ya da tarayıcı
const BUILD = window.GUNDEM_BUILD || { build: 0, repo: '' };
const IS_ANDROID = !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android');
const IS_DESKTOP = !!window.gundemDesktop;
const CATS = { is: 'İş', ev: 'Ev', okul: 'Okul', kisi: 'Kişisel' };
const DAYS = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const MONS = ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];
const MONL = MONS.map(m => m[0].toLocaleUpperCase('tr') + m.slice(1));
const MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const pd = s => { const [a,b,c] = s.split('-').map(Number); return new Date(a, b-1, c); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate()+n); return ymd(d); };
// Gün sabah 07:00'de değişir: gece 01:00'de yapılan iş hâlâ "bugün" sayılır.
const DAY_START_HOUR = 7;
const logicalToday = () => ymd(new Date(Date.now() - DAY_START_HOUR * 3600e3));
let TODAY = logicalToday();
const diffDays = s => Math.round((pd(s) - pd(TODAY)) / 864e5);
function dLabel(s){
  if (!s) return '';
  const n = diffDays(s), d = pd(s), base = d.getDate() + ' ' + MONL[d.getMonth()];
  if (n === 0) return 'Bugün'; if (n === 1) return 'Yarın'; if (n === -1) return 'Dün';
  if (n > 1 && n < 7) return DAYS[d.getDay()] + ', ' + base;
  return base + (d.getFullYear() !== pd(TODAY).getFullYear() ? ' ' + d.getFullYear() : '');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const low = s => s.toLocaleLowerCase('tr');
const $ = id => document.getElementById(id);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); }));

/* ---------- 2. Hızlı tarih çözümleyici ---------- */
function parseQuick(text){
  const t = ' ' + text + ' ', L = low(t);
  const wsfx = "(?:'?(?:ya|ye|a|e|da|de|ta|te)|\\s+günü)?";
  const rules = [
    [new RegExp("\\s(\\d{1,2})\\s+(" + MONS.join('|') + ")(?:'?[a-zçğıöşü]*)?(?:\\s+kadar)?(?=\\s)"), m => {
      const d = new Date(pd(TODAY).getFullYear(), MONS.indexOf(m[2]), +m[1]);
      if (ymd(d) < TODAY) d.setFullYear(d.getFullYear()+1); return ymd(d); }],
    [/\s(\d+)\s+gün\s+sonra(?:ya)?(?=\s)/, m => addDays(TODAY, +m[1])],
    [/\s(\d+)\s+hafta\s+sonra(?:ya)?(?=\s)/, m => addDays(TODAY, 7*m[1])],
    [/\sgelecek\s+hafta(?=\s)|\shaftaya(?=\s)/, () => addDays(TODAY, 7)],
    [/\söbür\s?gün(?:e)?(?=\s)/, () => addDays(TODAY, 2)],
    [/\syarın(?:a)?(?=\s)/, () => addDays(TODAY, 1)],
    [/\sbugün(?=\s)/, () => TODAY],
    [new RegExp("\\s(pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar)" + wsfx + "(?=\\s)"), m => {
      const map = {pazar:0,pazartesi:1,'salı':2,'çarşamba':3,'perşembe':4,cuma:5,cumartesi:6};
      return addDays(TODAY, (map[m[1]] - pd(TODAY).getDay() + 7) % 7); }],
  ];
  for (const [re, fn] of rules){
    const m = L.match(re);
    if (m){ const date = fn(m); const out = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
      return { title: out.replace(/\s+/g,' ').trim(), date }; }
  }
  return { title: text.trim(), date: null };
}

/* ---------- 3. Veri katmanı ----------
 * Uygulama içinde görevler camelCase, veritabanında snake_case tutulur.
 * Her değişiklik önce telefonda/bilgisayarda hemen uygulanır, sonra "bekleyenler" kuyruğundan
 * Supabase'e gönderilir. İnternet yoksa kuyruk bekler, bağlantı gelince kendiliğinden gönderilir.
 */
/* ---------- Temalar ----------
 * Yeni tema eklemek için THEMES içine bir tane daha ekle (açık ve koyu renkleriyle).
 * Seçilen tema ve mod (Sistem / Açık / Koyu) bu cihazda hatırlanır.
 */
const THEMES = {
  gece:     { name: 'Gece Mavisi',
    light: { bg:'#EDF0F5', surface:'#FFFFFF', surface2:'#F5F7FA', ink:'#141E33', muted:'#5E6A7F', line:'#D8DEE8', accent:'#2D58E6', accentInk:'#FFFFFF', mark:'#FFE066' },
    dark:  { bg:'#0E131B', surface:'#171F2B', surface2:'#1D2735', ink:'#E7ECF4', muted:'#98A4B7', line:'#2A3546', accent:'#7D9BFF', accentInk:'#0E131B', mark:'#6B5A12' } },
  orman:    { name: 'Orman',
    light: { bg:'#EEF3EE', surface:'#FFFFFF', surface2:'#F4F8F4', ink:'#13261B', muted:'#5A6E61', line:'#D5E1D7', accent:'#2E7D4F', accentInk:'#FFFFFF', mark:'#D7F0A8' },
    dark:  { bg:'#0D1611', surface:'#15221A', surface2:'#1B2B21', ink:'#E5F0E8', muted:'#93A99A', line:'#26382C', accent:'#5DD39E', accentInk:'#0D1611', mark:'#3F5A1F' } },
  okyanus:  { name: 'Okyanus',
    light: { bg:'#ECF5F6', surface:'#FFFFFF', surface2:'#F3F9FA', ink:'#0F2A30', muted:'#57717A', line:'#D2E4E8', accent:'#0C8599', accentInk:'#FFFFFF', mark:'#B2F2E8' },
    dark:  { bg:'#0B1719', surface:'#122225', surface2:'#182C30', ink:'#E2F1F3', muted:'#8FAAB0', line:'#22393E', accent:'#3BC9DB', accentInk:'#0B1719', mark:'#16504A' } },
  lavanta:  { name: 'Lavanta',
    light: { bg:'#F2F0F8', surface:'#FFFFFF', surface2:'#F7F5FC', ink:'#221A3A', muted:'#6A6384', line:'#E0DBEE', accent:'#7048E8', accentInk:'#FFFFFF', mark:'#FFD6E7' },
    dark:  { bg:'#13101C', surface:'#1C1828', surface2:'#241F33', ink:'#ECE8F7', muted:'#A49DBD', line:'#332C47', accent:'#A98BFF', accentInk:'#13101C', mark:'#5A2A45' } },
  pembe:    { name: 'Gül',
    light: { bg:'#FDF0F4', surface:'#FFFFFF', surface2:'#FEF6F8', ink:'#2E1220', muted:'#80596A', line:'#F3D9E2', accent:'#D6336C', accentInk:'#FFFFFF', mark:'#FFE066' },
    dark:  { bg:'#1A0E14', surface:'#25141D', surface2:'#2E1A25', ink:'#F8E7EE', muted:'#BB98A8', line:'#3F2532', accent:'#F783AC', accentInk:'#1A0E14', mark:'#5C2A40' } },
  gunbatimi:{ name: 'Gün Batımı',
    light: { bg:'#FFF3EE', surface:'#FFFFFF', surface2:'#FFF8F5', ink:'#2B1712', muted:'#7A5E55', line:'#F0DCD3', accent:'#E8590C', accentInk:'#FFFFFF', mark:'#FFE3A3' },
    dark:  { bg:'#1A110E', surface:'#241815', surface2:'#2D1F1A', ink:'#F6E9E4', muted:'#B59D94', line:'#3D2B25', accent:'#FF8A4C', accentInk:'#1A110E', mark:'#5E3B12' } },
  grafit:   { name: 'Grafit',
    light: { bg:'#F1F1F1', surface:'#FFFFFF', surface2:'#F7F7F7', ink:'#161616', muted:'#666666', line:'#DDDDDD', accent:'#161616', accentInk:'#FFFFFF', mark:'#E4E4E4' },
    dark:  { bg:'#0F0F0F', surface:'#1A1A1A', surface2:'#222222', ink:'#EDEDED', muted:'#9A9A9A', line:'#2E2E2E', accent:'#EDEDED', accentInk:'#0F0F0F', mark:'#3A3A3A' } },
};
const SEMANTIC = {
  light: { ok:'#1C9A67', warn:'#D9480F', 'c-is':'#2D58E6', 'c-ev':'#1C9A67', 'c-okul':'#8A46D8', 'c-kisi':'#D9730D' },
  dark:  { ok:'#3CCB8E', warn:'#FF8A5B', 'c-is':'#7D9BFF', 'c-ev':'#3CCB8E', 'c-okul':'#B98BFF', 'c-kisi':'#FFA94D' },
};
const ACC2 = { gece:['#8B5CF6','#C084FC'], orman:['#0EA5A4','#2DD4BF'], okyanus:['#6366F1','#818CF8'], lavanta:['#EC4899','#F472B6'],
  pembe:['#F59E0B','#FBBF24'], gunbatimi:['#DB2777','#F472B6'], grafit:['#8A8A8A','#8A8A8A'] };
const mq = window.matchMedia('(prefers-color-scheme: dark)');
let themePref = (() => { try { return JSON.parse(localStorage.getItem('gundem-theme')) || {}; } catch(e){ return {}; } })();
themePref = { id: THEMES[themePref.id] ? themePref.id : 'gece', mode: ['system','light','dark'].includes(themePref.mode) ? themePref.mode : 'system' };
function applyTheme(){
  const dark = themePref.mode === 'dark' || (themePref.mode === 'system' && mq.matches);
  const p = THEMES[themePref.id][dark ? 'dark' : 'light'], s = SEMANTIC[dark ? 'dark' : 'light'], r = document.documentElement.style;
  const map = { bg:'--bg', surface:'--surface', surface2:'--surface-2', ink:'--ink', muted:'--muted', line:'--line', accent:'--accent', accentInk:'--accent-ink', mark:'--mark' };
  Object.entries(map).forEach(([k, v]) => r.setProperty(v, p[k]));
  Object.entries(s).forEach(([k, v]) => r.setProperty('--' + k, v));
  r.setProperty('--accent-2', ACC2[themePref.id][dark ? 1 : 0]);
  r.setProperty('color-scheme', dark ? 'dark' : 'light');
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = p.bg;
}
function setTheme(p){ themePref = { ...themePref, ...p }; try { localStorage.setItem('gundem-theme', JSON.stringify(themePref)); } catch(e){} applyTheme(); }
mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);
applyTheme();

// Akıcı mod: bulanık cam ve hareketli ışıkları kapatır, eski telefonlarda donmayı önler.
let litePref = (() => { try { return localStorage.getItem('gundem-lite') || 'auto'; } catch(e){ return 'auto'; } })();
const liteAuto = () => /Android/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
function applyLite(){ document.documentElement.classList.toggle('lite', litePref === 'on' || (litePref === 'auto' && liteAuto())); }
function setLite(v){ litePref = v; try { localStorage.setItem('gundem-lite', v); } catch(e){} applyLite(); }
applyLite();

const CFG = window.GUNDEM_CONFIG || {};
const configured = CFG.SUPABASE_URL && !/BURAYA/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/BURAYA/.test(CFG.SUPABASE_ANON_KEY);
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const tasks = new Map();
const txns = new Map();   // cüzdan hareketleri
let userId = null;
const K_CACHE = () => 'gundem-cache-' + userId, K_OUT = () => 'gundem-outbox-' + userId, K_WCACHE = () => 'gundem-wcache-' + userId;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };

const toRow = t => ({ id: t.id, title: t.title, date: t.date || null, cat: t.cat || null, picked_for: t.pickedFor || null,
  done: !!t.done, done_at: t.doneAt || null, done_ts: t.doneTs || null, created_at: t.createdAt || Date.now() });
const fromRow = r => ({ id: r.id, title: r.title, date: r.date, cat: r.cat, pickedFor: r.picked_for,
  done: r.done, doneAt: r.done_at, doneTs: r.done_ts, createdAt: r.created_at });
const KEYMAP = { pickedFor:'picked_for', doneAt:'done_at', doneTs:'done_ts', createdAt:'created_at' };
const patchToRow = p => Object.fromEntries(Object.entries(p).map(([k,v]) => [KEYMAP[k] || k, v ?? null]));
// Cüzdan: uygulamada { id, kind:'in'|'out', amount, cat, note, date, createdAt } ↔ tablo "wallet"
const wToRow = w => ({ id: w.id, kind: w.kind, amount: +w.amount || 0, cat: w.cat || null, note: w.note || null, date: w.date, created_at: w.createdAt || Date.now() });
const wFromRow = r => ({ id: r.id, kind: r.kind, amount: +r.amount, cat: r.cat, note: r.note, date: r.date, createdAt: r.created_at });
const wPatchToRow = p => Object.fromEntries(Object.entries(p).map(([k,v]) => [k === 'createdAt' ? 'created_at' : k, v ?? null]));
// Hangi tabloya: eski kayıtlarda tb yok, onlar görevdir.
const TBL = { tasks: { map: tasks, name: 'tasks', to: t => toRow(t), patch: patchToRow },
              wallet: { map: txns, name: 'wallet', to: w => wToRow(w), patch: wPatchToRow } };
const tblOf = op => TBL[op.tb || 'tasks'];

let outbox = [];
function saveCache(){ lsSet(K_CACHE(), [...tasks.values()]); lsSet(K_WCACHE(), [...txns.values()]); lsSet(K_OUT(), outbox); }
function applyLocal(op){
  const m = tblOf(op).map;
  if (op.op === 'upsert') m.set(op.task.id, { ...op.task });
  else if (op.op === 'update' && m.has(op.id)) m.set(op.id, { ...m.get(op.id), ...op.patch });
  else if (op.op === 'delete') m.delete(op.id);
}
// Ekranı bir sonraki karede bir kez çiz: art arda değişiklikte telefon donmasın.
let renderQueued = false;
function scheduleRender(){ if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
function queue(op){ applyLocal(op); outbox.push(op); saveCache(); scheduleRender(); flush(); }

let flushing = false, online = navigator.onLine;
async function flush(){
  if (flushing || !sb || !userId) return;
  flushing = true;
  try{
    while (outbox.length){
      const op = outbox[0], T = tblOf(op); let res;
      if (op.op === 'upsert') res = await sb.from(T.name).upsert(T.to(op.task));
      else if (op.op === 'update') res = await sb.from(T.name).update(T.patch(op.patch)).eq('id', op.id);
      else res = await sb.from(T.name).delete().eq('id', op.id);
      if (res.error){
        if (isNetErr(res.error)) { setOnline(false); break; }
        console.warn('Gündem: değişiklik reddedildi', res.error); toast('Bir değişiklik kaydedilemedi: ' + res.error.message);
      }
      outbox.shift(); saveCache(); setOnline(true);
    }
  } catch(e){ setOnline(false); }
  flushing = false;
}
const isNetErr = e => !e.code || /fetch|network|Failed/i.test(e.message || '');
function setOnline(v){ if (online !== v){ online = v; renderBanner(); } }

async function reload(){
  if (!sb || !userId) return;
  const [{ data, error }, w] = await Promise.all([sb.from('tasks').select('*').limit(5000), sb.from('wallet').select('*').limit(10000)]);
  if (error){ setOnline(false); return; }
  setOnline(true);
  tasks.clear(); data.forEach(r => tasks.set(r.id, fromRow(r)));
  walletReady = !w.error;   // tablo henüz kurulmadıysa cüzdan kurulum notu gösterir
  if (!w.error){ txns.clear(); w.data.forEach(r => txns.set(r.id, wFromRow(r))); }
  outbox.forEach(applyLocal);   // henüz gönderilmemiş değişikliklerini kaybetme
  saveCache(); scheduleRender();
}
let reloadT;
const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(reload, 400); };

function startRealtime(){
  sb.channel('tasks-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { if (!outbox.length) reloadSoon(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet' }, () => { if (!outbox.length) reloadSoon(); })
    .subscribe();
}

const addTask = data => queue({ op: 'upsert', task: { id: uuid(), createdAt: Date.now(), done: false, doneAt: null, doneTs: null, pickedFor: null, cat: null, date: null, ...data } });
const patch = (id, p) => queue({ op: 'update', id, patch: p });
const removeTask = id => queue({ op: 'delete', id });
let walletReady = true;
const addTxn = data => queue({ op: 'upsert', tb: 'wallet', task: { id: uuid(), createdAt: Date.now(), date: TODAY, cat: null, note: null, ...data } });
const patchTxn = (id, p) => queue({ op: 'update', tb: 'wallet', id, patch: p });
const removeTxn = id => queue({ op: 'delete', tb: 'wallet', id });

/* ---------- 4. Ekranlar ---------- */
const all = () => [...tasks.values()];
// Gecikmiş: tarihi geçmiş, ya da tarihsizken bir güne seçilip o gün bitmemiş iş.
const lateSince = t => t.done ? null : (t.date ? (t.date < TODAY ? t.date : null) : (t.pickedFor && t.pickedFor < TODAY ? t.pickedFor : null));
const isLate = t => !!lateSince(t);
const isToday = t => !t.done && (isLate(t) || t.date === TODAY || t.pickedFor === TODAY);
const isLeftover = t => !t.done && t.pickedFor && t.pickedFor < TODAY && !isToday(t);
const byCreated = (a, b) => (a.createdAt||0) - (b.createdAt||0);

// Yeni bir bölüm (ör. Spor) eklemek için buraya { id, label, count, render } ekle.
const TABS = [
  { id: 'today', label: 'Bugün', count: () => all().filter(isToday).length, render: viewToday },
  { id: 'next',  label: 'Sırada', count: () => all().filter(t => !t.done && !isToday(t)).length, render: viewNext },
  { id: 'cal',   label: 'Takvim', count: () => 0, render: viewCal },
  { id: 'done',  label: 'Biten', count: () => 0, render: viewDone },
];

let tab = 'today', openId = null, confirmDel = null, addDate = null, addCat = null, customDate = '';

function taskHTML(t, ctx){
  const today = isToday(t), late = isLate(t), meta = [];
  if (t.cat && CATS[t.cat]) meta.push(`<span class="cat" style="--cc:var(--c-${t.cat})">${CATS[t.cat]}</span>`);
  if (t.done && ctx !== 'today') meta.push(`<span>${dLabel(t.doneAt)} bitti</span>`);
  else if (late){ const n = Math.abs(diffDays(lateSince(t))); meta.push(`<span class="late">${n === 1 ? 'Dünden kaldı' : n + ' gün gecikti'}</span>`); }
  else if (t.date && !(ctx === 'today' && t.date === TODAY) && ctx !== 'group') meta.push(`<span>${dLabel(t.date)}</span>`);
  if (isLeftover(t) && ctx !== 'today') meta.push('<span>Dünden kaldı</span>');
  const pin = (!t.done && ctx !== 'today') ? `<button class="pin ${today?'on':''}" data-act="pin" data-id="${t.id}" aria-pressed="${today}">${today?'Bugün ✓':'Bugüne al'}</button>` : '';
  let edit = '';
  if (openId === t.id){
    const cats = Object.entries(CATS).map(([k,v]) => `<button type="button" class="chip cat" style="--cc:var(--c-${k})" data-act="cat" data-id="${t.id}" data-v="${k}" aria-pressed="${t.cat===k}">${v}</button>`).join('');
    edit = `<div class="edit">
      <textarea rows="1" class="grow" id="ed-${t.id}" data-act="rename" data-id="${t.id}" aria-label="Görev adı">${esc(t.title)}</textarea>
      <div class="chips">
        ${!t.done ? (today ? `<button class="chip" data-act="unpin" data-id="${t.id}">Bugünden çıkar</button>` : `<button class="chip" data-act="pin" data-id="${t.id}">Bugüne al</button>`) : ''}
        ${!t.done ? `<button class="chip" data-act="tomorrow" data-id="${t.id}">Yarına at</button>` : ''}
        <label class="chip">📅 <input type="date" id="dt-${t.id}" value="${t.date||''}" data-act="date" data-id="${t.id}" aria-label="Tarih"></label>
        ${t.date ? `<button class="chip" data-act="nodate" data-id="${t.id}">Tarihi kaldır</button>` : ''}
      </div>
      <div class="chips">${cats}</div>
      <div class="chips">${confirmDel === t.id
        ? `<span style="align-self:center;font-size:14px">Silinsin mi?</span><button class="chip danger" data-act="del2" data-id="${t.id}">Evet, sil</button><button class="chip" data-act="del0">Vazgeç</button>`
        : `<button class="chip danger" data-act="del1" data-id="${t.id}">Sil</button>`}</div>
    </div>`;
  }
  const fresh = !seen.has(t.id); if (fresh) enterIdx++;
  return `<div class="task ${t.done?'done':''} ${isLate(t)?'late':''} ${fresh?'enter':''}" style="--d:${fresh ? Math.min(enterIdx,12)*45 : 0}ms" data-tid="${t.id}"><div class="row">
      <button class="chk" data-act="toggle" data-id="${t.id}" aria-label="${t.done?'Geri al':'Bitti olarak işaretle'}">${CHECK}</button>
      <button class="body" data-act="open" data-id="${t.id}"><div class="ttl">${esc(t.title)}</div>${meta.length?`<div class="meta">${meta.join('')}</div>`:''}</button>
      ${pin}</div>${late && ctx === 'today' && openId !== t.id ? `<div class="late-acts">
        <button class="chip sm ok" data-act="lateToday" data-id="${t.id}">Bugün bitireceğim</button>
        <button class="chip sm" data-act="tomorrow" data-id="${t.id}">Yarına at</button>
        <button class="chip sm danger" data-act="cancel" data-id="${t.id}">İptal et</button></div>` : ''}${edit}</div>`;
}
const seen = new Set(); let enterIdx = 0;
const emptyHTML = (title, text, extra='') => `<div class="empty"><div class="orb" aria-hidden="true"><i></i><i></i></div><strong>${title}</strong><span>${text}</span>${extra}</div>`;
const listHTML = (arr, ctx) => `<div class="list">${arr.map(t => taskHTML(t, ctx)).join('')}</div>`;

function viewToday(){
  const A = all();
  const todayOpen = A.filter(isToday).sort((a,b) => (isLate(b)-isLate(a)) || ((a.date||'9') < (b.date||'9') ? -1 : 1) || byCreated(a,b));
  const doneToday = A.filter(t => t.done && t.doneAt === TODAY).sort((a,b) => (b.doneTs||0) - (a.doneTs||0));
  const next = A.filter(t => !t.done && !isToday(t));
  const late = todayOpen.filter(isLate), rest = todayOpen.filter(t => !isLate(t));
  let h = '';
  if (!A.length && !lsGet('gundem-imported-' + userId, false)){
    h += emptyHTML('Hoş geldin!', "Claude'daki Gündem listende duran görevlerini buraya taşıyabilirsin.", '<button class="btn glow" data-act="import">Eski görevlerimi aktar</button>');
  } else if (!todayOpen.length && !doneToday.length){
    h += emptyHTML('Bugün için henüz iş seçmedin', next.length ? 'Listendeki işlerden bugün yapacaklarını seç.' : 'Aşağıdan ilk görevini yaz. Tarih de yazabilirsin: “yarın”, “cuma”, “4 gün sonra”.');
  }
  if (!todayOpen.length && doneToday.length) h += `<div class="allclear"><div class="orb big" aria-hidden="true"><i></i><i></i></div><strong>Bugünü bitirdin</strong><span>${doneToday.length} işin hepsi tamam. Harika iş çıkardın.</span></div>`;
  if (late.length) h += `<h2 class="warn"><span class="hl"><span class="dot"></span>Gecikenler</span><span>${late.length}</span></h2><p class="late-note">Bunları bugün mü yapacaksın, ertelemek mi istersin, yoksa iptal mi edelim?</p>` + listHTML(late, 'today');
  if (rest.length) h += `<h2><span class="hl"><span class="dot"></span>Bugün yapılacaklar</span><span>${rest.length}</span></h2>` + listHTML(rest, 'today');
  if (next.length) h += `<button class="cta" data-act="picker"><span class="cta-plus">+</span><span>Listeden bugüne iş seç${A.some(isLeftover) ? '<small>Dünden kalanlar var</small>' : ''}</span></button>`;
  if (doneToday.length) h += `<h2>Bugün bitenler</h2>` + listHTML(doneToday, 'today');
  if (todayOpen.length && new Date().getHours() >= 17)
    h += `<div class="close"><p>Gün bitiyor, <b>${todayOpen.length}</b> iş kaldı.</p><button class="btn glow" data-act="rollall">Hepsini yarına taşı</button></div>`;
  return h;
}
function viewNext(){
  const next = all().filter(t => !t.done && !isToday(t));
  let h = next.length ? '' : emptyHTML('Sırada iş yok', 'Yeni görevleri aşağıdan ekle.');
  const dated = next.filter(t => t.date).sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : byCreated(a,b));
  const groups = {}; dated.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  Object.keys(groups).forEach(k => { h += `<h2>${dLabel(k)}<span>${groups[k].length}</span></h2>` + listHTML(groups[k], 'group'); });
  const und = next.filter(t => !t.date).sort((a,b) => isLeftover(b) - isLeftover(a) || byCreated(a,b));
  if (und.length) h += `<h2>Tarihsiz<span>${und.length}</span></h2>` + listHTML(und, 'next');
  return h;
}
/* ---------- Takvim ---------- */
const WD_SHORT = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
let calMode = (() => { try { return localStorage.getItem('gundem-calmode') || 'week'; } catch(e){ return 'week'; } })();
let calSel = TODAY, calAnchor = TODAY;
const weekStart = d => addDays(d, -((pd(d).getDay() + 6) % 7));
const monthStart = d => d.slice(0, 8) + '01';
// Takvimde bir iş hangi günde görünür: bugüne seçildiyse bugün, değilse kendi tarihinde.
function planDay(t){
  if (!t.done && t.pickedFor === TODAY && !isLate(t)) return TODAY;
  if (t.date) return t.date;
  if (t.pickedFor) return t.pickedFor;
  return t.done ? t.doneAt : null;
}
function dayTasks(d){
  return all().filter(t => planDay(t) === d).sort((a,b) => (a.done - b.done) || byCreated(a,b));
}
function dotsHTML(list, max){
  const dots = list.slice(0, max).map(t => `<i class="${t.done ? 'd-done' : isLate(t) ? 'd-late' : ''}" style="--cc:var(--c-${t.cat || 'none'}, var(--accent))"></i>`).join('');
  return `<span class="dots">${dots}${list.length > max ? `<b>+${list.length - max}</b>` : ''}</span>`;
}
function cellHTML(d, outside){
  const list = dayTasks(d), dd = pd(d), open = list.filter(t => !t.done).length;
  const cls = ['cal-cell', d === TODAY && 'is-today', d === calSel && 'is-sel', outside && 'is-out', list.some(isLate) && 'has-late', list.length && !open && 'all-done', d < TODAY && 'is-past'].filter(Boolean).join(' ');
  const items = list.slice(0, 3).map(t => `<span class="ci ${t.done ? 'done' : isLate(t) ? 'late' : ''}" style="--cc:var(--c-${t.cat || 'none'}, var(--accent))">${esc(t.title)}</span>`).join('');
  return `<button class="${cls}" data-act="calDay" data-v="${d}" aria-label="${dd.getDate()} ${MONL[dd.getMonth()]}, ${list.length} iş" aria-pressed="${d === calSel}">
    ${calMode === 'week' ? `<span class="wd">${WD_SHORT[(dd.getDay() + 6) % 7]}</span>` : ''}
    <span class="num">${dd.getDate()}</span>
    ${dotsHTML(list, calMode === 'week' ? 4 : 3)}
    ${list.length ? `<span class="cal-items">${items}${list.length > 3 ? `<span class="ci more">+${list.length - 3} iş</span>` : ''}</span>` : ''}
  </button>`;
}
function viewCal(){
  let title, grid = '';
  if (calMode === 'week'){
    const ws = weekStart(calAnchor), we = addDays(ws, 6), a = pd(ws), b = pd(we);
    title = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONL[a.getMonth()]}` : `${a.getDate()} ${MONL[a.getMonth()]} – ${b.getDate()} ${MONL[b.getMonth()]}`;
    for (let i = 0; i < 7; i++) grid += cellHTML(addDays(ws, i), false);
    grid = `<div class="cal-grid week">${grid}</div>`;
  } else {
    const ms = monthStart(calAnchor), m = pd(ms).getMonth(), gs = weekStart(ms);
    title = `${MONL[m]} ${pd(ms).getFullYear()}`;
    let cells = '', d = gs;
    for (let i = 0; i < 42; i++){ if (i === 35 && pd(d).getMonth() !== m) break; cells += cellHTML(d, pd(d).getMonth() !== m); d = addDays(d, 1); }
    grid = `<div class="cal-head">${WD_SHORT.map(w => `<span>${w}</span>`).join('')}</div><div class="cal-grid month">${cells}</div>`;
  }
  const sel = pd(calSel), list = dayTasks(calSel);
  const selLabel = `${DAYS[sel.getDay()]}, ${sel.getDate()} ${MONL[sel.getMonth()]}`;
  return `<div class="cal">
    <div class="cal-bar">
      <div class="seg">${[['week','Hafta'],['month','Ay']].map(([k,l]) => `<button class="chip ${calMode===k?'':''}" data-act="calMode" data-v="${k}" aria-pressed="${calMode===k}">${l}</button>`).join('')}</div>
      <div class="cal-nav">
        <button class="nav-btn" data-act="calPrev" aria-label="Önceki">‹</button>
        <span class="cal-title">${title}</span>
        <button class="nav-btn" data-act="calNext" aria-label="Sonraki">›</button>
      </div>
      ${calSel !== TODAY || (calMode === 'week' ? weekStart(calAnchor) !== weekStart(TODAY) : monthStart(calAnchor) !== monthStart(TODAY)) ? '<button class="chip sm" data-act="calToday">Bugün</button>' : ''}
    </div>
    <div class="cal-body">${grid}</div>
  </div>
  <h2><span class="hl"><span class="dot"></span>${calSel === TODAY ? 'Bugün · ' : ''}${selLabel}</span><span>${list.length}</span></h2>
  ${list.length ? listHTML(list, 'group') : `<div class="cal-empty">Bu güne planlanmış iş yok.</div>`}
  <button class="cta" data-act="calAdd"><span class="cta-plus">+</span><span>Bu güne görev ekle<small>${selLabel}</small></span></button>`;
}
function calClick(act, b){
  switch (act){
    case 'calMode': calMode = b.dataset.v; try { localStorage.setItem('gundem-calmode', calMode); } catch(e){} calAnchor = calSel; render(); return true;
    case 'calDay': calSel = b.dataset.v; if (calMode === 'month' && monthStart(calSel) !== monthStart(calAnchor)) calAnchor = calSel; render(); return true;
    case 'calPrev': case 'calNext': {
      const dir = act === 'calNext' ? 1 : -1;
      if (calMode === 'week'){ calAnchor = addDays(weekStart(calAnchor), 7 * dir); calSel = weekStart(calAnchor) === weekStart(TODAY) ? TODAY : weekStart(calAnchor); }
      else { const d = pd(monthStart(calAnchor)); d.setMonth(d.getMonth() + dir); calAnchor = ymd(d); calSel = monthStart(calAnchor) === monthStart(TODAY) ? TODAY : calAnchor; }
      render(); const g = document.querySelector('.cal-body'); if (g){ g.classList.add(dir > 0 ? 'from-right' : 'from-left'); } return true; }
    case 'calToday': calSel = calAnchor = TODAY; render(); return true;
    case 'calAdd': addDate = 'custom'; customDate = calSel; renderAddChips(); updateHint(); $('q').focus(); return true;
  }
  return false;
}

function viewDone(){
  const done = all().filter(t => t.done).sort((a,b) => (b.doneTs||0) - (a.doneTs||0)).slice(0, 200);
  let h = done.length ? '' : emptyHTML('Henüz biten iş yok', 'Bir işi bitirince yuvarlağa dokun, buraya gelir.');
  const g = {}; done.forEach(t => (g[t.doneAt||''] = g[t.doneAt||''] || []).push(t));
  Object.keys(g).forEach(k => { h += `<h2>${k ? dLabel(k) : 'Daha önce'}<span>${g[k].length}</span></h2>` + listHTML(g[k], 'done'); });
  return h;
}

/* ---------- Cüzdan ----------
 * Gelir / gider kaydı, aylık özet ve kategori dağılımı. Veriler Supabase "wallet" tablosunda.
 */
const W_CATS = {
  out: { yemek:'Yemek', market:'Market', ulasim:'Ulaşım', fatura:'Fatura', kira:'Kira', alisveris:'Alışveriş', eglence:'Eğlence', saglik:'Sağlık', egitim:'Eğitim', abonelik:'Abonelik', diger:'Diğer' },
  in:  { maas:'Maaş', harclik:'Harçlık', burs:'Burs', satis:'Satış', serbest:'Serbest iş', hediye:'Hediye', diger:'Diğer' },
};
const W_COLORS = { yemek:'#F59F00', market:'#37B24D', ulasim:'#1C7ED6', fatura:'#F03E3E', kira:'#AE3EC9', alisveris:'#E64980', eglence:'#7048E8', saglik:'#0CA678', egitim:'#4263EB', abonelik:'#D9480F', diger:'#868E96',
  maas:'#2F9E44', harclik:'#40C057', burs:'#12B886', satis:'#82C91E', serbest:'#15AABF', hediye:'#FAB005' };
const W_WORDS = {
  out: [['yemek', /yemek|yedim|kahvaltı|öğle|akşam yemeği|restoran|kafe|kahve|döner|pizza|burger|lahmacun|çay|içtim|yemeğe/],
        ['market', /market|bakkal|manav|migros|a101|bim|şok|carrefour|gıda|ekmek|süt/],
        ['ulasim', /benzin|mazot|akaryakıt|otobüs|metro|taksi|dolmuş|uber|bilet|ulaşım|istanbulkart|otopark|köprü/],
        ['fatura', /fatura|elektrik|doğalgaz|su faturası|internet|telefon faturası|aidat/],
        ['kira', /kira/],
        ['abonelik', /abonelik|netflix|spotify|youtube|icloud|disney|exxen|premium/],
        ['alisveris', /kıyafet|ayakkabı|pantolon|tişört|mont|elbise|alışveriş|trendyol|hepsiburada|amazon|klavye|mouse|kulaklık|telefon aldım|aldım/],
        ['eglence', /sinema|konser|oyun|steam|eğlence|bar|parti|maç/],
        ['saglik', /eczane|ilaç|doktor|hastane|diş|sağlık/],
        ['egitim', /kitap|kurs|okul|ders|eğitim|kırtasiye|fotokopi/]],
  in:  [['maas', /maaş/], ['harclik', /harçlık/], ['burs', /burs/], ['satis', /sattım|satış|satıldı/], ['serbest', /proje parası|serbest|freelance|iş parası|ödeme aldım/], ['hediye', /hediye|bayram/]],
};
const money = n => { n = Math.round((n || 0) * 100) / 100; const f = n % 1 ? 2 : 0; return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: f, maximumFractionDigits: f }).format(n); };
const wCatName = (kind, c) => (W_CATS[kind] && W_CATS[kind][c]) || 'Diğer';
function guessWCat(kind, text){ const l = low(text); for (const [k, re] of W_WORDS[kind]) if (re.test(l)) return k; return 'diger'; }

/* Yazılan cümlede para var mı? "560 liraya yemek yedim", "15 bin maaş geldi", "dün markete 340,50 tl"
 * force: cüzdan sayfasındayken "lira" yazmasan da sayı yeterli. */
const IN_RE = /maaş|harçlık|burs|kazandım|gelir|yattı|yatırıldı|geldi|sattım|satış|prim|ikramiye|iade|hediye geldi|ödeme aldım|aldım parayı/;
const MONEY_VERB = /harcadım|ödedim|verdim|yedim|içtim|kazandım|yattı|yatırıldı|maaş|harçlık|burs|ödeme|fatura|kira/;
function parseMoney(text, force){
  const L = ' ' + low(text) + ' ';
  const numRe = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(\s*bin)?(\s*(?:₺|tl|lira|liralık|liraya|lirayı|liram|tl'ye|tl'lik)\b|\s*₺)?/g;
  let best = null, m;
  while ((m = numRe.exec(L))){
    const after = L.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/^\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|gün|hafta|saat|dakika|ay\b|yıl|kişi|tane|adet)/.test(after)) continue;
    const cand = { m, cur: !!m[4] };
    if (!best || (cand.cur && !best.cur)) best = cand;
  }
  if (!best) return null;
  if (!best.cur && !force && !MONEY_VERB.test(L)) return null;
  const mm = best.m;
  let amount = parseFloat(mm[1].replace(/\./g, '') + (mm[2] ? '.' + mm[2] : ''));
  if (mm[3]) amount *= 1000;
  if (!amount) return null;
  const kind = IN_RE.test(L) ? 'in' : 'out';
  // tarih: bugün/dün/yarın/gün adı; para için gün adı geçmiş günü anlatır
  let rest = (L.slice(0, mm.index) + ' ' + L.slice(mm.index + mm[0].length)).replace(/\s+/g, ' ');
  let date = TODAY;
  if (/\s(dün|dünkü)\s/.test(' ' + rest + ' ')){ date = addDays(TODAY, -1); rest = rest.replace(/\bdün(kü)?\b/, ' '); }
  else if (/\sevvelsi\s?gün\s/.test(' ' + rest + ' ')){ date = addDays(TODAY, -2); rest = rest.replace(/evvelsi\s?gün/, ' '); }
  else { const q = parseQuick(rest.trim()); if (q.date){ date = q.date; rest = q.title; if (date > TODAY && diffDays(date) < 7 && !/yarın|haftaya|sonra/.test(L)) date = addDays(date, -7); } }
  const cat = guessWCat(kind, L);
  let note = (' ' + rest + ' ').replace(/(?<=\s)(harcadım|ödedim|ödendi|verdim|yedim|içtim|kazandım|geldi|yattı|yatırıldı|aldım|için|lira|tl|bugün|gider|gelir|olarak|bir|tane)(?=\s)/g, ' ')
                 .replace(/\s+/g, ' ').trim();
  note = note ? note[0].toLocaleUpperCase('tr') + note.slice(1) : wCatName(kind, cat);
  return { kind, amount: Math.round(amount * 100) / 100, cat, note, date };
}

let walletMonth = TODAY.slice(0, 7), wOpen = null, wConfirm = null, wKind = 'out', wCat = null;
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return MONL[m - 1] + ' ' + y; };
const shiftMonth = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return ymd(d).slice(0, 7); };
const wAll = () => [...txns.values()];

function txnHTML(t){
  const color = W_COLORS[t.cat] || W_COLORS.diger, sign = t.kind === 'in' ? '+' : '−';
  let edit = '';
  if (wOpen === t.id){
    const cats = Object.entries(W_CATS[t.kind]).map(([k, v]) => `<button type="button" class="chip sm cat" style="--cc:${W_COLORS[k]}" data-act="wcat" data-id="${t.id}" data-v="${k}" aria-pressed="${t.cat===k}">${v}</button>`).join('');
    edit = `<div class="edit">
      <div class="w-edit-row">
        <input type="text" inputmode="decimal" class="w-amt" data-act="wamount" data-id="${t.id}" value="${String(t.amount).replace('.', ',')}" aria-label="Tutar">
        <div class="seg"><button class="chip ${''}" data-act="wkind" data-id="${t.id}" data-v="out" aria-pressed="${t.kind==='out'}">Gider</button><button class="chip" data-act="wkind" data-id="${t.id}" data-v="in" aria-pressed="${t.kind==='in'}">Gelir</button></div>
      </div>
      <textarea rows="1" class="grow" data-act="wnote" data-id="${t.id}" aria-label="Açıklama">${esc(t.note || '')}</textarea>
      <div class="chips">${cats}</div>
      <div class="chips"><label class="chip">📅 <input type="date" data-act="wdate" data-id="${t.id}" value="${t.date}" aria-label="Tarih"></label>
        ${wConfirm === t.id ? `<button class="chip danger" data-act="wdel2" data-id="${t.id}">Evet, sil</button><button class="chip" data-act="wdel0">Vazgeç</button>` : `<button class="chip danger" data-act="wdel1" data-id="${t.id}">Sil</button>`}</div>
    </div>`;
  }
  return `<div class="task txn ${t.kind}"><div class="row">
    <span class="w-ico" style="--cc:${color}">${esc(wCatName(t.kind, t.cat).slice(0, 1))}</span>
    <button class="body" data-act="wopen" data-id="${t.id}"><div class="ttl">${esc(t.note || wCatName(t.kind, t.cat))}</div><div class="meta"><span class="cat" style="--cc:${color}">${wCatName(t.kind, t.cat)}</span></div></button>
    <span class="w-amount ${t.kind}">${sign}${money(t.amount)}</span></div>${edit}</div>`;
}

function viewWallet(){
  if (!walletReady) return emptyHTML('Cüzdan için bir kurulum adımı kaldı', "Supabase'de SQL Editor'e supabase/003_cuzdan.sql dosyasını yapıştırıp Run'a bas. Sonra uygulamayı yeniden aç.");
  const A = wAll(), M = A.filter(t => t.date && t.date.slice(0, 7) === walletMonth);
  const inc = M.filter(t => t.kind === 'in').reduce((a, t) => a + t.amount, 0);
  const out = M.filter(t => t.kind === 'out').reduce((a, t) => a + t.amount, 0);
  const total = A.reduce((a, t) => a + (t.kind === 'in' ? t.amount : -t.amount), 0);
  const left = inc - out, pct = inc ? Math.min(100, Math.round(out / inc * 100)) : (out ? 100 : 0);
  const isCur = walletMonth === TODAY.slice(0, 7);
  const daysPassed = isCur ? pd(TODAY).getDate() : new Date(+walletMonth.slice(0, 4), +walletMonth.slice(5, 7), 0).getDate();
  // kategori dağılımı
  const byCat = {}; M.filter(t => t.kind === 'out').forEach(t => { byCat[t.cat || 'diger'] = (byCat[t.cat || 'diger'] || 0) + t.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxC = cats.length ? cats[0][1] : 1;
  let h = `<div class="w-month">
      <button class="nav-btn" data-act="wPrev" aria-label="Önceki ay">‹</button>
      <span class="cal-title">${monthLabel(walletMonth)}</span>
      <button class="nav-btn" data-act="wNext" aria-label="Sonraki ay">›</button>
    </div>
    <div class="w-hero">
      <small>${isCur ? 'Bu ay kalan' : monthLabel(walletMonth) + ' sonunda kalan'}</small>
      <b class="w-big ${left < 0 ? 'neg' : ''}">${money(left)}</b>
      <div class="w-io"><span class="in">↑ Gelir <b>${money(inc)}</b></span><span class="out">↓ Gider <b>${money(out)}</b></span></div>
      <div class="w-meter" title="Gelirin ne kadarı harcandı"><i style="width:${pct}%"></i></div>
      <div class="w-foot"><span>Gelirinin %${pct}'i harcandı</span><span>Günlük ort. gider ${money(out / Math.max(1, daysPassed))}</span></div>
      <div class="w-total">Toplam bakiye (tüm zamanlar) <b class="${total < 0 ? 'neg' : ''}">${money(total)}</b></div>
    </div>`;
  if (cats.length){
    h += `<h2><span class="hl"><span class="dot"></span>Nereye harcadım</span><span>${money(out)}</span></h2><div class="w-cats">` +
      cats.map(([c, v]) => `<div class="w-cat"><span class="w-cat-n"><span class="cat" style="--cc:${W_COLORS[c] || W_COLORS.diger}">${wCatName('out', c)}</span></span>
        <span class="w-cat-bar"><i style="width:${Math.max(4, v / maxC * 100)}%;background:${W_COLORS[c] || W_COLORS.diger}"></i></span>
        <span class="w-cat-v">${money(v)}<small>%${Math.round(v / out * 100)}</small></span></div>`).join('') + `</div>`;
  }
  const list = M.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  if (!list.length) h += emptyHTML(isCur ? 'Bu ay henüz hareket yok' : 'Bu ayda hareket yok', 'Aşağıya yaz: “560 yemek”, “15000 maaş”, “dün markete 340 tl”.');
  const g = {}; list.forEach(t => (g[t.date] = g[t.date] || []).push(t));
  Object.keys(g).forEach(d => {
    const net = g[d].reduce((a, t) => a + (t.kind === 'in' ? t.amount : -t.amount), 0);
    h += `<h2>${dLabel(d)}<span class="${net < 0 ? 'neg' : 'pos'}">${net < 0 ? '−' : '+'}${money(Math.abs(net))}</span></h2><div class="list">${g[d].map(txnHTML).join('')}</div>`;
  });
  return h;
}

function walletClick(act, b){
  const id = b.dataset.id, t = id && txns.get(id);
  switch (act){
    case 'wPrev': walletMonth = shiftMonth(walletMonth, -1); render(); return true;
    case 'wNext': walletMonth = shiftMonth(walletMonth, 1); render(); return true;
    case 'wopen': wOpen = wOpen === id ? null : id; wConfirm = null; render(); return true;
    case 'wkind': if (t && t.kind !== b.dataset.v){ patchTxn(id, { kind: b.dataset.v, cat: guessWCat(b.dataset.v, t.note || '') }); } return true;
    case 'wcat': if (t) patchTxn(id, { cat: b.dataset.v }); return true;
    case 'wdel1': wConfirm = id; render(); return true;
    case 'wdel0': wConfirm = null; render(); return true;
    case 'wdel2': if (t){ const copy = { ...t }; wOpen = wConfirm = null; removeTxn(id); toast('Silindi', () => queue({ op: 'upsert', tb: 'wallet', task: copy })); } return true;
    case 'wAddKind': wKind = b.dataset.v; wCat = null; renderAddChips(); updateHint(); $('q').focus(); return true;
    case 'wAddCat': wCat = wCat === b.dataset.v ? null : b.dataset.v; renderAddChips(); updateHint(); $('q').focus(); return true;
  }
  return false;
}
document.addEventListener('change', e => {
  const el = e.target, id = el.dataset && el.dataset.id; if (!id || !txns.has(id)) return;
  if (el.dataset.act === 'wdate' && el.value) patchTxn(id, { date: el.value });
  if (el.dataset.act === 'wamount'){ const v = parseFloat(el.value.replace(/\./g, '').replace(',', '.')); if (v > 0) patchTxn(id, { amount: Math.round(v * 100) / 100 }); else toast('Geçerli bir tutar yaz'); }
  if (el.dataset.act === 'wnote') patchTxn(id, { note: el.value.trim() || null });
});

/* ---------- Bölümler: Ajanda / Cüzdan ---------- */
let section = (() => { try { return localStorage.getItem('gundem-section') || 'ajanda'; } catch(e){ return 'ajanda'; } })();
function setSection(s){ section = s; try { localStorage.setItem('gundem-section', s); } catch(e){} openId = wOpen = null; lastTab = null; render(); }

function render(){
  if ($('app').hidden) return;
  const d = pd(TODAY);
  $('day').textContent = DAYS[d.getDay()];
  $('date').textContent = d.getDate() + ' ' + MONL[d.getMonth()] + ' ' + d.getFullYear();
  const A = all();
  const open = A.filter(isToday).length, doneT = A.filter(t => t.done && t.doneAt === TODAY).length, total = open + doneT;
  $('progTxt').textContent = doneT + '/' + total;
  const C = 2 * Math.PI * 27; $('ringVal').style.strokeDasharray = C; $('ringVal').style.strokeDashoffset = total ? C * (1 - doneT / total) : C;
  $('ring').classList.toggle('full', total > 0 && doneT === total);
  const hr = new Date().getHours();
  $('greet').textContent = hr < 5 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 17 ? 'İyi günler' : hr < 22 ? 'İyi akşamlar' : 'İyi geceler';
  const sec = $('sections'); sec.style.setProperty('--i', section === 'cuzdan' ? 1 : 0);
  sec.innerHTML = '<span class="ind" aria-hidden="true"></span>' + [['ajanda','Ajanda'],['cuzdan','Cüzdan']].map(([k,l]) => `<button role="tab" data-sec="${k}" aria-selected="${section===k}">${l}</button>`).join('');
  document.documentElement.dataset.section = section;
  if (section === 'cuzdan'){
    $('tabs').hidden = true; $('ring').hidden = true;
    const v = $('view'); v.innerHTML = viewWallet();
    if (lastTab !== 'wallet'){ v.classList.remove('swap'); void v.offsetWidth; v.classList.add('swap'); lastTab = 'wallet'; }
    renderAddChips(); renderBanner(); growAll(); return;
  }
  $('tabs').hidden = false; $('ring').hidden = false;
  const ti = Math.max(0, TABS.findIndex(T => T.id === tab)), nav = $('tabs');
  nav.style.setProperty('--n', TABS.length); nav.style.setProperty('--i', ti);
  nav.innerHTML = '<span class="ind" aria-hidden="true"></span>' + TABS.map(T => { const n = T.count();
    return `<button role="tab" data-tab="${T.id}" aria-selected="${T.id === tab}">${T.label}${n ? `<span class="n">${n}</span>` : ''}</button>`; }).join('');
  enterIdx = 0;
  const v = $('view'); v.innerHTML = (TABS.find(T => T.id === tab) || TABS[0]).render();
  if (lastTab !== tab){ v.classList.remove('swap'); void v.offsetWidth; v.classList.add('swap'); lastTab = tab; }
  all().forEach(t => seen.add(t.id));
  renderAddChips(); renderBanner(); growAll();
}
// Uzun yazılar kesilmesin: düzenleme kutuları içeriğe göre uzar.
function grow(el){ el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
function growAll(){ document.querySelectorAll('textarea.grow').forEach(grow); }
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('grow')) grow(e.target); });
let lastTab = null;
function renderBanner(){
  const b = $('banner'); if (!b) return;
  if (!online){ b.textContent = 'İnternet yok. Değişikliklerin bu cihazda tutuluyor, bağlantı gelince otomatik gönderilecek.' + (outbox.length ? ` (${outbox.length} bekleyen)` : ''); b.hidden = false; }
  else b.hidden = true;
}
function renderAddChips(){
  if (section === 'cuzdan'){
    let h = [['out','Gider'],['in','Gelir']].map(([k,l]) => `<button type="button" class="chip ${k === 'in' ? 'k-in' : 'k-out'}" data-act="wAddKind" data-v="${k}" aria-pressed="${wKind===k}">${l}</button>`).join('');
    h += Object.entries(W_CATS[wKind]).map(([k,v]) => `<button type="button" class="chip cat" style="--cc:${W_COLORS[k]}" data-act="wAddCat" data-v="${k}" aria-pressed="${wCat===k}">${v}</button>`).join('');
    $('addChips').innerHTML = h; $('q').placeholder = 'Tutar ve ne için… (ör. 560 yemek, 15000 maaş)'; return;
  }
  $('q').placeholder = 'Görev ya da harcama… (ör. faturayı öde yarın, 560 tl yemek)';
  const dates = [[null,'Tarihsiz'],['today','Bugün'],['tomorrow','Yarın']];
  let h = dates.map(([k,l]) => `<button type="button" class="chip" data-add="date" data-v="${k}" aria-pressed="${addDate===k}">${l}</button>`).join('');
  h += `<label class="chip" aria-pressed="${addDate==='custom'}">📅 <input type="date" id="addDateInp" value="${customDate}" aria-label="Tarih seç"></label>`;
  h += Object.entries(CATS).map(([k,v]) => `<button type="button" class="chip cat" style="--cc:var(--c-${k})" data-add="cat" data-v="${k}" aria-pressed="${addCat===k}">${v}</button>`).join('');
  $('addChips').innerHTML = h;
}

let sheetKind = null;
function openPicker(){
  sheetKind = 'picker';
  const A = all().filter(t => !t.done && !(t.date && t.date <= TODAY));
  A.sort((a,b) => (isLeftover(b)-isLeftover(a)) || ((a.date||'9') < (b.date||'9') ? -1 : (a.date||'9') > (b.date||'9') ? 1 : 0) || byCreated(a,b));
  const s = $('sheet');
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Bugünün işlerini seç">
    <h3>Bugün neleri aradan çıkaracaksın?</h3><p class="sub">Dokunarak seç. Tarihi bugün olanlar zaten listede.</p>
    <div class="scroll">${A.map(t => { const on = t.pickedFor === TODAY, m = [];
      if (t.cat) m.push(`<span class="cat" style="--cc:var(--c-${t.cat})">${CATS[t.cat]}</span>`);
      if (t.date) m.push(`<span>${dLabel(t.date)}</span>`);
      if (isLeftover(t)) m.push('<span>Dünden kaldı</span>');
      return `<button class="pick" data-act="pickt" data-id="${t.id}" aria-pressed="${on}"><span class="box">${CHECK}</span><span class="ttl">${esc(t.title)}${m.length?`<span class="meta">${m.join('')}</span>`:''}</span></button>`; }).join('') || '<div class="empty">Seçilecek iş yok.</div>'}</div>
    <div class="foot"><button class="btn" data-act="closesheet">Tamam</button></div></div>`;
  s.hidden = false;
}
function openThemes(){
  sheetKind = 'themes';
  const dark = themePref.mode === 'dark' || (themePref.mode === 'system' && mq.matches);
  const modes = [['system','Sistem'],['light','Açık'],['dark','Koyu']].map(([k,l]) =>
    `<button class="chip" data-act="mode" data-v="${k}" aria-pressed="${themePref.mode===k}">${l}</button>`).join('');
  const sw = Object.entries(THEMES).map(([k, T]) => { const p = T[dark ? 'dark' : 'light'];
    return `<button class="swatch" data-act="theme" data-v="${k}" aria-pressed="${themePref.id===k}">
      <span class="sw-dot" style="background:linear-gradient(135deg,${p.bg} 0 50%,${p.accent} 50% 100%);border-color:${p.line}"></span>${esc(T.name)}</button>`; }).join('');
  $('sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Tema ve renkler">
    <h3>Tema ve renkler</h3><p class="sub">Dokunduğun anda uygulanır. Bu cihazda hatırlanır.</p>
    <div class="scroll"><div class="chips">${modes}</div><div class="swatches">${sw}</div>
      <h2 style="margin-top:18px">Akıcı mod</h2>
      <p class="sub" style="margin-top:-4px">Bulanık cam ve hareketli ışıkları kapatır. Eski telefonlarda donmayı önler.</p>
      <div class="chips">${[['auto','Otomatik'],['on','Açık'],['off','Kapalı']].map(([k,l]) => `<button class="chip" data-act="lite" data-v="${k}" aria-pressed="${litePref===k}">${l}</button>`).join('')}</div>
    </div>
    <div class="foot"><button class="btn" data-act="closesheet">Tamam</button></div></div>`;
  $('sheet').hidden = false;
}
function openMenu(){
  sheetKind = 'menu';
  const s = $('sheet');
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Menü">
    <h3>Menü</h3><p class="sub">Gündem ${VERSION}${BUILD.build ? ' · sürüm 1.0.' + BUILD.build : ''}${IS_ANDROID ? ' · Android' : IS_DESKTOP ? ' · Windows' : ''}</p>
    <div class="scroll">
      <button class="menu-item" data-act="themes">Tema ve renkler<small>${esc(THEMES[themePref.id].name)} · ${({system:'Sistem',light:'Açık',dark:'Koyu'})[themePref.mode]}</small></button>
      ${IS_DESKTOP ? `<button class="menu-item" data-act="updCheck">Güncellemeleri denetle<small id="updStatus">${esc(updText(deskUpd))}</small></button>${deskUpd.state === 'error' ? '<button class="menu-item" data-act="updLog">Güncelleme günlüğünü aç<small>Hata ayrıntıları burada</small></button>' : ''}` : ''}
      <button class="menu-item" data-act="backup">Yedek indir<small>Bütün görevlerini bir dosya olarak kaydeder.</small></button>
      <label class="menu-item" for="restoreInp">Yedekten geri yükle<small>Daha önce indirdiğin yedek dosyasını seç. Mevcut görevler silinmez.</small></label>
      <input type="file" id="restoreInp" accept="application/json,.json" hidden>
      <button class="menu-item" data-act="logout">Çıkış yap<small>${esc(sessionEmail || '')}</small></button>
    </div>
    <div class="foot"><button class="btn ghost" data-act="closesheet">Kapat</button></div></div>`;
  s.hidden = false;
}
function refreshSheet(){ if (!$('sheet').hidden && sheetKind === 'picker'){ const sc = document.querySelector('.sheet .scroll'), top = sc ? sc.scrollTop : 0; openPicker(); const n = document.querySelector('.sheet .scroll'); if (n) n.scrollTop = top; } }
const closeSheet = () => { if (rec){ const r = rec; rec = null; try { r.abort(); } catch(e){} } $('sheet').hidden = true; sheetKind = null; };

/* ---------- Animasyonlar ---------- */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fxColors = () => { const cs = getComputedStyle(document.documentElement); return ['--accent','--accent-2','--ok','--mark'].map(v => cs.getPropertyValue(v).trim() || '#888'); };
function burst(el){
  if (REDUCED || !el.animate) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2, cols = fxColors();
  for (let i = 0; i < 14; i++){
    const p = document.createElement('i'); p.className = 'pt';
    const a = (i / 14) * Math.PI * 2 + Math.random() * .4, dist = 26 + Math.random() * 30, s = 4 + Math.random() * 5;
    Object.assign(p.style, { left: cx + 'px', top: cy + 'px', width: s + 'px', height: s + 'px', background: cols[i % cols.length] });
    document.body.appendChild(p);
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
               { transform: `translate(calc(-50% + ${Math.cos(a)*dist}px), calc(-50% + ${Math.sin(a)*dist}px)) scale(0)`, opacity: 0 }],
      { duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
  }
}
function celebrate(){
  if (REDUCED || !document.body.animate) return;
  const cols = fxColors(), W = innerWidth;
  for (let i = 0; i < 90; i++){
    const p = document.createElement('i'); p.className = 'pt conf';
    const x = W/2 + (Math.random() - .5) * 80, s = 6 + Math.random() * 6;
    Object.assign(p.style, { left: x + 'px', top: '38%', width: s + 'px', height: s * (Math.random() > .5 ? 1 : 2.2) + 'px', background: cols[i % cols.length] });
    document.body.appendChild(p);
    const dx = (Math.random() - .5) * W * 1.1, up = -(120 + Math.random() * 260), rot = (Math.random() - .5) * 900;
    p.animate([{ transform: 'translate(-50%,0) rotate(0)', opacity: 1 },
               { transform: `translate(calc(-50% + ${dx*.6}px), ${up}px) rotate(${rot/2}deg)`, opacity: 1, offset: .35 },
               { transform: `translate(calc(-50% + ${dx}px), ${innerHeight*.7}px) rotate(${rot}deg)`, opacity: 0 }],
      { duration: 1700 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.4,1)' }).onfinish = () => p.remove();
  }
}
// basılan yerde ışık dalgası
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn,.cta,.go,.chip,.pin,.menu-item,.swatch,.pick,nav button'); if (!b || REDUCED) return;
  const r = b.getBoundingClientRect(), w = document.createElement('span'); w.className = 'wave';
  const s = Math.max(r.width, r.height) * 2.2;
  Object.assign(w.style, { width: s + 'px', height: s + 'px', left: (e.clientX - r.left - s/2) + 'px', top: (e.clientY - r.top - s/2) + 'px' });
  b.appendChild(w); setTimeout(() => w.remove(), 650);
});
// fareyle gezerken kartlarda ışık
document.addEventListener('pointermove', e => {
  const c = e.target.closest && e.target.closest('.task,.cta,.swatch'); if (!c) return;
  const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });

let toastT;
function toast(msg, undo){
  const el = $('toast');
  el.innerHTML = esc(msg) + (undo ? '<button id="undoBtn">Geri al</button>' : '');
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3500);
  if (undo) $('undoBtn').onclick = () => { el.hidden = true; undo(); };
}

/* ---------- 5. Olaylar ---------- */
document.addEventListener('click', e => {
  const sb2 = e.target.closest('[data-sec]'); if (sb2){ setSection(sb2.dataset.sec); return; }
  const tb = e.target.closest('nav button'); if (tb){ tab = tb.dataset.tab; openId = null; render(); return; }
  const ad = e.target.closest('[data-add]');
  if (ad){ if (ad.dataset.add === 'date') addDate = ad.dataset.v === 'null' ? null : ad.dataset.v; else addCat = addCat === ad.dataset.v ? null : ad.dataset.v;
    renderAddChips(); updateHint(); $('q').focus(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, t = id && tasks.get(id), act = b.dataset.act;
  if (voiceClick(act, b)) return;
  if (calClick(act, b)) return;
  if (walletClick(act, b)) return;
  switch (act){
    case 'open': openId = openId === id ? null : id; confirmDel = null; render(); break;
    case 'toggle': if (!t) break;
      if (t.done) patch(id, { done: false, doneAt: null, doneTs: null });
      else {
        burst(b); const card = b.closest('.task'); if (card) card.classList.add('completing');
        setTimeout(() => {
          patch(id, { done: true, doneAt: TODAY, doneTs: Date.now() });
          const left = all().filter(isToday).length;
          if (!left && all().some(x => x.done && x.doneAt === TODAY)){ celebrate(); toast('Bugünü bitirdin! 🎉'); }
          else toast('Bitti', () => patch(id, { done: false, doneAt: null, doneTs: null }));
        }, REDUCED ? 0 : 420);
      }
      break;
    case 'pin': if (t){ if (isToday(t)) unpin(id, t); else patch(id, { pickedFor: TODAY }); } break;
    case 'unpin': if (t) unpin(id, t); break;
    case 'lateToday': if (t){ patch(id, { date: t.date ? TODAY : null, pickedFor: TODAY }); toast('Bugünün işlerine alındı'); } break;
    case 'cancel': if (t){ const copy = { ...t }; removeTask(id); toast('İptal edildi', () => queue({ op: 'upsert', task: copy })); } break;
    case 'tomorrow': if (t){ patch(id, { date: addDays(TODAY, 1), pickedFor: null }); openId = null; toast('Yarına taşındı'); } break;
    case 'nodate': if (t) patch(id, { date: null }); break;
    case 'cat': if (t) patch(id, { cat: t.cat === b.dataset.v ? null : b.dataset.v }); break;
    case 'del1': confirmDel = id; render(); break;
    case 'del0': confirmDel = null; render(); break;
    case 'del2': openId = null; confirmDel = null; removeTask(id); toast('Silindi'); break;
    case 'picker': openPicker(); break;
    case 'pickt': if (t){ const on = t.pickedFor !== TODAY; b.setAttribute('aria-pressed', on); patch(id, { pickedFor: on ? TODAY : null }); } break;
    case 'closesheet': closeSheet(); break;
    case 'rollall': rollAll(); break;
    case 'import': importOld(); break;
    case 'backup': backup(); break;
    case 'updCheck': if (IS_DESKTOP){ if (deskUpd.state === 'ready') window.gundemDesktop.installUpdate(); else window.gundemDesktop.checkUpdates().then(setDeskUpd); } break;
    case 'updLog': if (IS_DESKTOP) window.gundemDesktop.openUpdateLog(); break;
    case 'updInstall': if (IS_DESKTOP) window.gundemDesktop.installUpdate(); break;
    case 'themes': openThemes(); break;
    case 'theme': setTheme({ id: b.dataset.v }); openThemes(); break;
    case 'mode': setTheme({ mode: b.dataset.v }); openThemes(); break;
    case 'lite': setLite(b.dataset.v); openThemes(); break;
    case 'logout': closeSheet(); sb.auth.signOut(); break;
  }
});
$('menuBtn').addEventListener('click', openMenu);
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
// "Bugün ✓"e basınca: sonradan bugüne seçilmiş iş kendi tarihine döner;
// tarihi zaten bugün (ya da geçmiş) olan iş yarına geçer. İkisi de "Geri al" ile geri alınabilir.
function unpin(id, t){
  const before = { date: t.date || null, pickedFor: t.pickedFor || null };
  if (!(t.date && t.date <= TODAY)){
    patch(id, { pickedFor: null });
    toast(t.date ? 'Bugünden çıkarıldı · ' + dLabel(t.date) + ' gününe döndü' : 'Bugünden çıkarıldı', () => patch(id, before));
  } else {
    patch(id, { pickedFor: null, date: addDays(TODAY, 1) });
    toast('Yarına taşındı', () => patch(id, before));
  }
}
function rollAll(){
  const tm = addDays(TODAY, 1);
  all().filter(isToday).forEach(t => patch(t.id, { pickedFor: tm, ...(t.date ? { date: tm } : {}) }));
  toast('Kalan işler yarına taşındı. İyi akşamlar!');
}
async function importOld(){
  try{
    const res = await fetch('aktar.json', { cache: 'no-store' }); if (!res.ok) throw 0;
    const list = await res.json();
    list.forEach(x => addTask({ title: x.title, date: x.date || null, cat: x.cat || null, createdAt: x.createdAt || Date.now() }));
    lsSet('gundem-imported-' + userId, true);
    toast(list.length + ' görev aktarıldı');
  } catch(e){ lsSet('gundem-imported-' + userId, true); render(); toast('Aktarılacak görev bulunamadı'); }
}
function backup(){
  const blob = new Blob([JSON.stringify({ app: 'gundem', version: VERSION, exportedAt: new Date().toISOString(), tasks: all() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gundem-yedek-' + TODAY + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Yedek indirildi');
}
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.id === 'addDateInp'){ customDate = el.value; addDate = el.value ? 'custom' : null; renderAddChips(); updateHint(); return; }
  if (el.dataset.act === 'date'){ patch(el.dataset.id, { date: el.value || null }); return; }
  if (el.id === 'restoreInp' && el.files[0]){
    try{
      const j = JSON.parse(await el.files[0].text()); let n = 0;
      (j.tasks || []).forEach(x => { if (x.id && x.title && !tasks.has(x.id)){ queue({ op: 'upsert', task: x }); n++; } });
      closeSheet(); toast(n + ' görev geri yüklendi');
    } catch(err){ toast('Bu dosya bir Gündem yedeği değil'); }
  }
});
document.addEventListener('focusout', e => {
  const el = e.target; if (el.dataset && el.dataset.act === 'rename'){ const t = tasks.get(el.dataset.id), v = el.value.trim(); if (t && v && v !== t.title) patch(el.dataset.id, { title: v }); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.act === 'rename'){ e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') closeSheet();
});

/* ---------- Sesli asistan ----------
 * Mikrofona basıp konuşursun; söylediklerin işlere bölünür, tarihleri ve türleri tahmin edilir,
 * eklemeden önce sana gösterilir. Ses tanıma tarayıcının kendi servisiyle (Chrome/Edge) yapılır.
 */
const SR = IS_DESKTOP ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
const NativeSpeech = IS_ANDROID && window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('SpeechRecognition') : null;
let rec = null, voiceItems = [], heard = '', silenceT = null;

const VERB_END = /(?:y?acağım|y?eceğim|y?acam|y?ecem|y?acağız|y?eceğiz|y?acak|y?ecek|malıyım|meliyim|malıyız|meliyiz|mam|mem|mak|mek|ıcam|icem)$/;
const STEM_FIX = { gid: 'git', ed: 'et', yi: 'ye', di: 'de', yiy: 'ye', diy: 'de', söyliy: 'söyle', bekliy: 'bekle', izliy: 'izle', dinliy: 'dinle', hazırlıy: 'hazırla', temizliy: 'temizle' };
const FILLERS = /^(?:(?:şey|yani|ee+|ıı+|hmm+|tamam|peki|ben|benim|aslında|bir|de|da|hani|şimdi|ayrıca|ondan|onu)\s+)+/;
const TAILS = /\s+(?:lazım|gerekiyor|gerek|istiyorum|olacak|yapmalıyım|da|de)$/;
const CAT_WORDS = {
  ev:   /çöp|bulaşık|çamaşır|temizl|süpür|yemek|market|alışveriş|fatura|ütü|toz|mutfak|banyo|kira|tamir|yatak|çiçek|sula/,
  okul: /sınav|ders|ödev|vize|final|kitap oku|çalış(?:ma|acağım|mam)|proje teslim|hoca|lab|mikroişlemci|okul|üniversite|kurs/,
  is:   /toplantı|müşteri|rapor|teklif|mail|e-?posta|sunum|fatura kes|sözleşme|patron|ofis|iş(?:i|e|te)?\b|proje|teslim|tasarım|video|montaj|instagram|shorts|reels/,
};
function guessCat(t){ const l = low(t); for (const [k, re] of Object.entries(CAT_WORDS)) if (re.test(l)) return k; return null; }

function cleanTask(piece){
  let s = low(piece).replace(/[.!?…]+$/,'').trim();
  s = s.replace(FILLERS, '').replace(TAILS, '').trim();
  const words = s.split(/\s+/); let last = words.pop() || '';
  if (VERB_END.test(last)){
    let stem = last.replace(VERB_END, '');
    if (STEM_FIX[stem]) stem = STEM_FIX[stem];
    last = stem.length >= 2 ? stem : last;
  }
  words.push(last); s = words.join(' ').trim();
  return s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : '';
}
function splitSpeech(text){
  // güçlü ayraçlar: noktalama, "sonra", "ardından", "ayrıca", "bir de", "daha sonra"
  let parts = (' ' + text + ' ').split(/[,;.!?]+|\s(?:ve\s+)?(?:daha\s+)?sonra(?:\s+de|\s+da)?\s|\sardından\s|\sayrıca\s|\sbir\s+de\s|\sartı\s/i);
  // "ve" ile ayır, ama sadece solundaki kısım bir fiille bitiyorsa ("atacağım ve ...")
  parts = parts.flatMap(p => p.split(/(?<=(?:acağım|eceğim|acam|ecem|acağız|eceğiz|malıyım|meliyim|lazım|gerekiyor))\s+(?:(?:ve|hem\s+de)\s+)?/i));
  const out = []; let cur = TODAY;
  for (const raw of parts){
    if (!raw || !raw.trim()) continue;
    const p = parseQuick(raw.trim());
    if (p.date) cur = p.date;
    const mny = parseMoney(raw.trim(), false);
    if (mny){ out.push({ money: true, ...mny, title: mny.note }); continue; }
    const title = cleanTask(p.title);
    if (title.length < 2 || /^(?:şey|yani|tamam|peki|hmm+|ee+|ıı+|evet|hayır)$/i.test(title)) continue;
    out.push({ title, date: cur, cat: guessCat(title) });
  }
  return out;
}

function micSupported(){ return !!SR; }
// Bazı telefonlar aynı cümleyi üst üste tekrar gönderiyor ("TÜBİTAK bitirme TÜBİTAK bitirme ...").
// Art arda tekrarlanan kelime gruplarını teke indir.
function collapseRepeats(text){
  let w = text.split(/\s+/).filter(Boolean), changed = true;
  while (changed){
    changed = false;
    for (let k = Math.floor(w.length / 2); k >= 1 && !changed; k--){
      for (let i = 0; i + 2 * k <= w.length; i++){
        let same = true;
        for (let j = 0; j < k; j++) if (low(w[i + j]) !== low(w[i + k + j])){ same = false; break; }
        if (same){ w.splice(i + k, k); changed = true; break; }
      }
    }
  }
  return w.join(' ');
}
function finishVoice(){
  clearTimeout(silenceT); rec = null;
  if (sheetKind !== 'listen') return;
  heard = collapseRepeats(heard);
  voiceItems = splitSpeech(heard);
  if (!voiceItems.length){ closeSheet(); if (heard) toast('Bundan bir görev çıkaramadım, tekrar dene.'); return; }
  openReview();
}
async function startNativeVoice(){
  try{
    const av = await NativeSpeech.available(); if (!av.available){ toast('Bu telefonda ses tanıma servisi bulunamadı.'); return; }
    const perm = await NativeSpeech.requestPermissions();
    if (perm.speechRecognition !== 'granted'){ toast('Mikrofon izni verilmedi. Ayarlar → Uygulamalar → Gündem → İzinler.'); return; }
  } catch(e){ toast('Mikrofon başlatılamadı.'); return; }
  heard = ''; voiceItems = [];
  await NativeSpeech.removeAllListeners();
  NativeSpeech.addListener('partialResults', d => {
    const m = d && d.matches && d.matches[0]; if (m) heard = collapseRepeats(m);
    const el = $('vTxt'); if (el) el.textContent = heard || '…';
    clearTimeout(silenceT); silenceT = setTimeout(() => NativeSpeech.stop(), 2600);
  });
  NativeSpeech.addListener('listeningState', d => { if (d && d.status === 'stopped') finishVoice(); });
  rec = { stop: () => NativeSpeech.stop(), abort: () => NativeSpeech.stop() };
  openListen();
  NativeSpeech.start({ language: 'tr-TR', maxResults: 1, partialResults: true, popup: false }).catch(() => { if (sheetKind === 'listen'){ closeSheet(); toast('Bir şey duyamadım, tekrar dene.'); } });
}
function startVoice(){
  if (NativeSpeech){ startNativeVoice(); return; }
  if (!SR){ toast('Bu tarayıcı sesle yazmayı desteklemiyor. Chrome ya da Edge kullan.'); return; }
  heard = ''; voiceItems = [];
  // Android Chrome'da "continuous" modu sonuçları tekrar tekrar ekliyor; orada tek seferlik dinle.
  const ANDROID_WEB = /Android/i.test(navigator.userAgent);
  rec = new SR(); rec.lang = 'tr-TR'; rec.interimResults = true; rec.continuous = !ANDROID_WEB; rec.maxAlternatives = 1;
  let finalTxt = '';
  rec.onresult = e => {
    // Her seferinde baştan kur: eklemeli toplama tekrarlara yol açıyordu.
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += ' ' + e.results[i][0].transcript;
    if (ANDROID_WEB && e.results.length) txt = e.results[e.results.length - 1][0].transcript;
    heard = collapseRepeats(txt.replace(/\s+/g,' ').trim());
    const el = $('vTxt'); if (el) el.textContent = heard || '…';
    clearTimeout(silenceT); silenceT = setTimeout(() => rec && rec.stop(), 2600);
  };
  rec.onerror = e => {
    const m = { 'not-allowed':'Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden mikrofona izin ver.', 'service-not-allowed':'Mikrofon izni verilmedi.',
      'no-speech':'Bir şey duyamadım, tekrar dene.', 'network':'Ses tanıma için internet bağlantısı gerekiyor.', 'audio-capture':'Mikrofon bulunamadı.' }[e.error];
    if (m){ toast(m); }
    if (e.error !== 'aborted') { rec = null; if (sheetKind === 'listen') closeSheet(); }
  };
  rec.onend = () => { const wasRec = rec; if (!wasRec){ clearTimeout(silenceT); return; } finishVoice(); };
  openListen();
  try { rec.start(); } catch(err){ toast('Mikrofon başlatılamadı.'); closeSheet(); }
}
function stopVoice(){ if (rec){ clearTimeout(silenceT); rec.stop(); } }

function openListen(){
  sheetKind = 'listen';
  $('sheet').innerHTML = `<div class="sheet listen" role="dialog" aria-modal="true" aria-label="Dinliyorum">
    <div class="mic-orb" aria-hidden="true"><span></span><span></span><span></span><div class="core">${MIC_SVG}</div></div>
    <h3>Dinliyorum…</h3>
    <p class="sub">Yapacaklarını söyle. Örn: “bugün çöpleri atacağım, sonra bulaşıkları yıkayacağım, çarşamba gezmeye çıkacağım”</p>
    <div class="v-txt" id="vTxt">…</div>
    <div class="foot"><button class="btn ghost" data-act="vcancel">Vazgeç</button><button class="btn glow" data-act="vstop">Bitti</button></div></div>`;
  $('sheet').hidden = false;
}
function vDateChips(it, i){
  const opts = [[TODAY,'Bugün'],[addDays(TODAY,1),'Yarın'],[null,'Tarihsiz']];
  let h = opts.map(([d,l]) => `<button type="button" class="chip sm" data-act="vdate" data-i="${i}" data-v="${d||''}" aria-pressed="${(it.date||null)===d}">${l}</button>`).join('');
  if (it.date && it.date !== TODAY && it.date !== addDays(TODAY,1)) h = `<button type="button" class="chip sm" aria-pressed="true" data-act="noop">${dLabel(it.date)}</button>` + h;
  h += `<label class="chip sm">📅 <input type="date" data-act="vdatein" data-i="${i}" value="${it.date||''}" aria-label="Tarih"></label>`;
  return h;
}
function openReview(){
  sheetKind = 'review';
  const cards = voiceItems.map((it, i) => it.money ? `<div class="v-card money" style="--d:${i*70}ms">
      <div class="v-top"><span class="v-badge ${it.kind}">Cüzdan · ${it.kind === 'in' ? 'Gelir' : 'Gider'} ${money(it.amount)}</span>
        <button class="v-x" data-act="vdel" data-i="${i}" aria-label="Çıkar">×</button></div>
      <textarea rows="1" class="v-title grow" data-i="${i}" aria-label="Açıklama">${esc(it.title)}</textarea>
      <div class="chips">${[['out','Gider'],['in','Gelir']].map(([k,l]) => `<button type="button" class="chip sm" data-act="vkind" data-i="${i}" data-v="${k}" aria-pressed="${it.kind===k}">${l}</button>`).join('')}
        ${Object.entries(W_CATS[it.kind]).map(([k,v]) => `<button type="button" class="chip sm cat" style="--cc:${W_COLORS[k]}" data-act="vwcat" data-i="${i}" data-v="${k}" aria-pressed="${it.cat===k}">${v}</button>`).join('')}</div>
    </div>` : `<div class="v-card" style="--d:${i*70}ms">
      <div class="v-top"><textarea rows="1" class="v-title grow" data-i="${i}" aria-label="Görev">${esc(it.title)}</textarea>
        <button class="v-x" data-act="vdel" data-i="${i}" aria-label="Çıkar">×</button></div>
      <div class="chips">${vDateChips(it, i)}</div>
      <div class="chips">${Object.entries(CATS).map(([k,v]) => `<button type="button" class="chip sm cat" style="--cc:var(--c-${k})" data-act="vcat" data-i="${i}" data-v="${k}" aria-pressed="${it.cat===k}">${v}</button>`).join('')}</div>
    </div>`).join('');
  $('sheet').innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Anladıklarım">
    <h3>${voiceItems.length} şey anladım</h3><p class="sub">“${esc(heard)}”</p>
    <div class="scroll">${cards || '<div class="empty">Liste boş.</div>'}</div>
    <div class="foot"><button class="btn ghost" data-act="vagain">${MIC_SVG} Tekrar</button><button class="btn glow" data-act="vadd" ${voiceItems.length?'':'disabled'}>Hepsini ekle</button></div></div>`;
  $('sheet').hidden = false; growAll();
}
function voiceClick(act, b){
  const i = +b.dataset.i;
  switch (act){
    case 'mic': startVoice(); return true;
    case 'vstop': stopVoice(); return true;
    case 'vcancel': if (rec){ const r = rec; rec = null; r.abort(); } closeSheet(); return true;
    case 'vagain': startVoice(); return true;
    case 'vdel': voiceItems.splice(i, 1); voiceItems.length ? openReview() : closeSheet(); return true;
    case 'vdate': voiceItems[i].date = b.dataset.v || null; openReview(); return true;
    case 'vcat': voiceItems[i].cat = voiceItems[i].cat === b.dataset.v ? null : b.dataset.v; openReview(); return true;
    case 'vkind': { const it = voiceItems[i]; if (it.kind !== b.dataset.v){ it.kind = b.dataset.v; it.cat = guessWCat(it.kind, it.title); } openReview(); return true; }
    case 'vwcat': voiceItems[i].cat = b.dataset.v; openReview(); return true;
    case 'vadd': {
      let nt = 0, nm = 0;
      voiceItems.forEach(it => {
        const ttl = (it.title || '').trim();
        if (it.money){ addTxn({ kind: it.kind, amount: it.amount, cat: it.cat, note: ttl || null, date: it.date }); nm++; }
        else if (ttl){ addTask({ title: ttl, date: it.date, cat: it.cat }); nt++; }
      });
      voiceItems = []; closeSheet(); toast([nt ? nt + ' iş' : '', nm ? nm + ' cüzdan kaydı' : ''].filter(Boolean).join(' ve ') + ' eklendi'); return true; }
    case 'noop': return true;
  }
  return false;
}
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('v-title')) voiceItems[+e.target.dataset.i].title = e.target.value; });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.act === 'vdatein'){ voiceItems[+e.target.dataset.i].date = e.target.value || null; openReview(); } });
if (!SR && !NativeSpeech) { const m = $('micBtn'); if (m) m.hidden = true; }

const q = $('q');
const chipDate = () => addDate === 'today' ? TODAY : addDate === 'tomorrow' ? addDays(TODAY, 1) : (addDate === 'custom' && customDate) ? customDate : null;
// Yazılan cümle görev mi, para mı? Para ise cüzdana gider.
function moneyFromInput(raw){
  const m = parseMoney(raw, section === 'cuzdan'); if (!m) return null;
  if (section === 'cuzdan' && !IN_RE.test(low(raw))){ if (m.kind !== wKind){ m.kind = wKind; m.cat = guessWCat(wKind, raw); } }
  if (wCat && section === 'cuzdan' && W_CATS[m.kind][wCat]) m.cat = wCat;
  return m;
}
function updateHint(){
  const h = $('hint'), raw = q.value.trim(), mny = raw && moneyFromInput(raw);
  if (mny){ h.textContent = `→ Cüzdan · ${mny.kind === 'in' ? 'Gelir' : 'Gider'} ${money(mny.amount)} · ${wCatName(mny.kind, mny.cat)}${mny.date !== TODAY ? ' · ' + dLabel(mny.date) : ''}`; h.hidden = false; return; }
  if (section === 'cuzdan'){ if (raw){ h.textContent = '→ Tutarı da yaz, ör. 560 yemek'; h.hidden = false; } else h.hidden = true; return; }
  const p = parseQuick(q.value), d = p.date || chipDate();
  if (q.value.trim() && d){ h.textContent = '→ ' + dLabel(d) + (d <= TODAY ? ' · bugünün listesine girer' : ' · o sabah otomatik seçilir'); h.hidden = false; } else h.hidden = true;
}
q.addEventListener('input', updateHint);
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = q.value.trim(); if (!raw) return;
  const mny = moneyFromInput(raw);
  if (mny){
    const id = uuid(); queue({ op: 'upsert', tb: 'wallet', task: { id, createdAt: Date.now(), ...mny } });
    q.value = ''; updateHint();
    toast(`Cüzdana eklendi · ${mny.kind === 'in' ? '+' : '−'}${money(mny.amount)} ${wCatName(mny.kind, mny.cat)}`, () => removeTxn(id));
    return;
  }
  if (section === 'cuzdan'){ toast('Tutarı da yaz, ör. “560 yemek”'); return; }
  const p = parseQuick(raw), date = p.date || chipDate();
  addTask({ title: p.title || raw, date, cat: addCat });
  q.value = ''; updateHint();
  toast(date ? ('Eklendi · ' + dLabel(date)) : 'Eklendi · Sırada');
});

// gün değişimi, internet geri gelince gönder, uygulamaya dönünce yenile
setInterval(() => { const n = logicalToday(); if (n !== TODAY){ TODAY = n; render(); } flush(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden){ const n = logicalToday(); if (n !== TODAY){ TODAY = n; render(); } flush().then(reload); } });
window.addEventListener('online', () => flush().then(reload));
window.addEventListener('offline', () => setOnline(false));

/* ---------- giriş ---------- */
let signUpMode = false, sessionEmail = '';
$('authSwitch').addEventListener('click', () => {
  signUpMode = !signUpMode;
  $('authBtn').textContent = signUpMode ? 'Hesap oluştur' : 'Giriş yap';
  $('authSub').textContent = signUpMode ? 'Bir kez hesap oluştur, sonra her cihazda aynı bilgilerle gir.' : 'Bu cihazda bir kez giriş yapman yeterli, sonra hep açık kalır.';
  $('authSwitch').textContent = signUpMode ? 'Zaten hesabım var, giriş yap' : 'İlk kez mi kullanıyorsun? Hesap oluştur';
  $('password').autocomplete = signUpMode ? 'new-password' : 'current-password';
  $('authErr').hidden = true;
});
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('password').value, err = $('authErr');
  err.hidden = true; $('authBtn').disabled = true;
  const r = signUpMode ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  $('authBtn').disabled = false;
  if (r.error){
    const m = r.error.message || '';
    err.textContent = /Invalid login/i.test(m) ? 'E-posta ya da şifre hatalı.' :
      /not confirmed/i.test(m) ? 'E-postana gelen onay bağlantısına tıkla, sonra giriş yap.' :
      /Signups not allowed/i.test(m) ? 'Yeni hesap açma kapalı. Mevcut hesabınla giriş yap.' :
      /already registered/i.test(m) ? 'Bu e-postayla zaten hesap var. Giriş yap.' :
      (!navigator.onLine ? 'İnternet bağlantısı yok.' : m);
    err.hidden = false; return;
  }
  if (signUpMode && !r.data.session){ err.textContent = 'Hesap oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra burada giriş yap.'; err.hidden = false; $('authSwitch').click(); }
});

function showApp(user){
  userId = user.id; sessionEmail = user.email || '';
  tasks.clear(); lsGet(K_CACHE(), []).forEach(t => tasks.set(t.id, t)); outbox = lsGet(K_OUT(), []);
  txns.clear(); lsGet(K_WCACHE(), []).forEach(t => txns.set(t.id, t));
  $('auth').hidden = true; $('app').hidden = false; $('addBar').hidden = false;
  render(); flush().then(reload); startRealtime();
  setTimeout(checkAppUpdate, 2500);
}
function showAuth(){
  userId = null; tasks.clear(); txns.clear(); outbox = [];
  $('app').hidden = true; $('addBar').hidden = true; $('auth').hidden = false;
}

(async () => {
  if (!sb){ $('setup').hidden = false; return; }
  const { data } = await sb.auth.getSession();
  if (data.session) showApp(data.session.user); else showAuth();
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && session && session.user.id !== userId) showApp(session.user);
    if (ev === 'SIGNED_OUT') showAuth();
  });
})();

// Tarayıcıda internetsiz çalışma için; uygulamalarda dosyalar zaten içinde.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !IS_ANDROID && !IS_DESKTOP)
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

/* ---------- Android güncelleme kontrolü ----------
 * Windows uygulaması kendini arka planda günceller.
 * Android: açık depoda GitHub Releases'e, özel depoda Supabase'deki "surumler" kutusuna bakar;
 * yeni sürüm varsa üstte "Güncelle" şeridi çıkar.
 */
let updChecked = false;
let updUrl = null;
function showUpdBar(build, note){
  const u = $('updBar');
  u.innerHTML = `<span><b>Yeni sürüm hazır</b><small>1.0.${+build}${note ? ' · ' + esc(note) : ''}</small></span><button class="btn glow" data-act="updGo">Güncelle</button><button class="v-x" data-act="updClose" aria-label="Kapat">×</button>`;
  u.hidden = false;
}
async function checkAppUpdate(){
  if (!IS_ANDROID || !sb || !userId || updChecked) return;
  updChecked = true;
  // Açık depo: GitHub'daki son sürüme doğrudan bakılır.
  if (BUILD.repo && !BUILD.token){
    try{
      const r = await fetch(`https://api.github.com/repos/${BUILD.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok){ updChecked = false; return; }
      const j = await r.json(), n = +String(j.tag_name || '').split('.').pop();
      const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
      if (apk && n > (BUILD.build || 0)){ updUrl = apk.browser_download_url; showUpdBar(n, (j.body || '').split('\n')[0].slice(0, 80)); }
    } catch(e){ updChecked = false; }
    return;
  }
  // Özel depo: APK Supabase'deki özel "surumler" kutusunda.
  try{
    const { data, error } = await sb.storage.from('surumler').createSignedUrl('version.json', 60);
    if (error || !data) return;
    const r = await fetch(data.signedUrl + '&t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const v = await r.json();
    if (+v.build > (BUILD.build || 0)) showUpdBar(v.build, v.note);
  } catch(e){ updChecked = false; }
}
async function startUpdate(btn){
  if (updUrl){ toast('İndiriliyor… Bitince bildirimden aç ve Yükle de.'); location.href = updUrl; return; }
  btn.disabled = true; btn.textContent = 'Hazırlanıyor…';
  const { data, error } = await sb.storage.from('surumler').createSignedUrl('Gundem.apk', 3600, { download: 'Gundem.apk' });
  if (error || !data){ btn.disabled = false; btn.textContent = 'Güncelle'; toast('İndirme bağlantısı alınamadı, internetini kontrol et.'); return; }
  toast('İndiriliyor… Bitince bildirimden aç ve Yükle de.');
  location.href = data.signedUrl;   // tarayıcı APK'yı indirir, Android "Yükle" diye sorar
  btn.disabled = false; btn.textContent = 'Güncelle';
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-act=updClose]')) $('updBar').hidden = true;
  const g = e.target.closest('[data-act=updGo]'); if (g) startUpdate(g);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden){ updChecked = false; setTimeout(checkAppUpdate, 1500); } });

/* ---------- Windows güncelleme durumu ---------- */
let deskUpd = { state: 'idle' }, deskVer = '';
function updText(u){
  switch (u.state){
    case 'checking': return 'Denetleniyor…';
    case 'latest': return 'Güncelsin · sürüm ' + (deskVer || u.version || '');
    case 'available': return 'Yeni sürüm bulundu (' + u.version + '), indiriliyor…';
    case 'downloading': return 'İndiriliyor… %' + (u.percent || 0);
    case 'ready': return 'Yeni sürüm hazır · yeniden başlatmak için dokun';
    case 'error': return 'Denetlenemedi: ' + (u.message || 'bilinmeyen hata');
    case 'nofeed': return 'Güncelleme adresi bu sürümde yok, yeni sürümü elle kur';
    case 'dev': return 'Geliştirme sürümü';
    default: return 'Sürüm ' + deskVer + ' · denetlemek için dokun';
  }
}
function setDeskUpd(u){
  if (!u) return; deskUpd = u;
  const el = document.getElementById('updStatus'); if (el) el.textContent = updText(u);
  if (u.state === 'ready'){
    const b = $('updBar');
    b.innerHTML = `<span><b>Yeni sürüm hazır</b><small>${esc(u.version || '')}</small></span><button class="btn glow" data-act="updInstall">Yeniden başlat</button><button class="v-x" data-act="updClose" aria-label="Kapat">×</button>`;
    b.hidden = false;
  }
}
if (IS_DESKTOP){
  window.gundemDesktop.version().then(v => { deskVer = v; });
  window.gundemDesktop.updateStatus().then(setDeskUpd);
  window.gundemDesktop.onUpdate(setDeskUpd);
}
