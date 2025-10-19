// MVP IPTV для VIDAA — app.js
// Поддержка групп (group-title), логотипов (tvg-logo), hls.js, управление пультом, сохранение в localStorage.

const player = document.getElementById('player');
const channelListEl = document.getElementById('channelList');
const groupsEl = document.getElementById('groups');
const nowTitle = document.getElementById('now-title');
const volLabel = document.getElementById('vol-label');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

let channels = []; // {title, url, group, logo}
let groups = ['Все'];
let currentIndex = null;
let hls = null;

const STORAGE_KEY = 'vidaa_iptv_last';

function setVolume(v){
  if(v<0) v=0; if(v>1) v=1;
  player.volume = v;
  volLabel.textContent = Math.round(v*100) + '%';
  localStorage.setItem('vidaa_vol', v);
}

function togglePlay(){
  if(player.paused) player.play(); else player.pause();
}

btnPlay.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', ()=> changeIndex((currentIndex||0)-1));
btnNext.addEventListener('click', ()=> changeIndex((currentIndex||0)+1));

function changeIndex(idx){
  if(channels.length===0) return;
  if(idx<0) idx = 0;
  if(idx>channels.length-1) idx = channels.length-1;
  playByIndex(idx);
}

function playByIndex(idx){
  const ch = channels[idx];
  if(!ch) return;
  currentIndex = idx;
  highlightCurrent();
  playStream(ch.url);
  nowTitle.textContent = ch.title + (ch.group ? ' — '+ch.group : '');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({index: idx, time: Date.now()}));
}

function highlightCurrent(){
  const items = channelListEl.querySelectorAll('li');
  items.forEach((li,i)=>{
    li.classList.toggle('active', i===currentIndex);
    if(i===currentIndex){
      li.scrollIntoView({block:'center'});
      li.focus();
    }
  });
}

// HLS play with fallback
function playStream(url){
  if(hls){ try{ hls.destroy(); }catch(e){} hls = null; }
  if(player.canPlayType('application/vnd.apple.mpegurl')){
    player.src = url;
    player.play().catch(()=>{});
  } else if(window.Hls && Hls.isSupported()){
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, ()=> player.play().catch(()=>{}));
    hls.on(Hls.Events.ERROR, (e,data)=> console.warn('HLS error',e,data));
  } else {
    player.src = url;
    player.play().catch(()=>{});
  }
}

// M3U parser (простая, но надежная)
async function loadM3U(url){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error('Ошибка загрузки плейлиста');
    const text = await res.text();
    parseM3U(text);
    renderGroups();
    renderChannels();
    restoreLast();
  }catch(e){
    console.error(e);
    alert('Не удалось загрузить плейлист: '+e.message);
  }
}

function parseM3U(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim());
  channels = [];
  let cur = null;
  for(const ln of lines){
    if(ln.startsWith('#EXTINF')){
      // извлечь параметры, title
      const meta = ln;
      // найти title после запятой
      const title = (meta.split(',').slice(1).join(',')||'Без названия').trim();
      const groupMatch = meta.match(/group-title="([^"]+)"/i);
      const logoMatch = meta.match(/tvg-logo="([^"]+)"/i) || meta.match(/logo="([^"]+)"/i);
      const tvgIdMatch = meta.match(/tvg-id="([^"]+)"/i);
      cur = {title, group: groupMatch?groupMatch[1]:'Без категории', logo: logoMatch?logoMatch[1]:'', tvgId: tvgIdMatch?tvgIdMatch[1]:''};
    } else if(ln && !ln.startsWith('#')){
      if(cur){
        cur.url = ln;
        channels.push(cur);
        if(cur.group && !groups.includes(cur.group)) groups.push(cur.group);
        cur = null;
      }
    }
  }
  // default sort by group then title
  channels.sort((a,b)=> (a.group||'').localeCompare(b.group||'') || a.title.localeCompare(b.title));
}

function renderGroups(){
  groupsEl.innerHTML = '';
  groups.forEach(g=>{
    const btn = document.createElement('button');
    btn.textContent = g;
    btn.onclick = ()=> filterByGroup(g);
    groupsEl.appendChild(btn);
  });
}

function filterByGroup(g){
  const items = channelListEl.querySelectorAll('li');
  // rebuild list filtered
  renderChannels(g);
}

function renderChannels(filterGroup){
  channelListEl.innerHTML = '';
  channels.forEach((ch,i)=>{
    if(filterGroup && filterGroup!=='Все' && ch.group!==filterGroup) return;
    const li = document.createElement('li');
    li.tabIndex = 0;
    const img = document.createElement('img');
    img.src = ch.logo || '';
    img.onerror = ()=> { img.src = ''; img.style.display='none'; }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className='title'; title.textContent = ch.title;
    const sub = document.createElement('div'); sub.className='sub'; sub.textContent = ch.group || '';
    meta.appendChild(title); meta.appendChild(sub);
    li.appendChild(img); li.appendChild(meta);
    li.onclick = ()=> playByIndex(i);
    li.onfocus = ()=> { highlightOnIndex(i); };
    channelListEl.appendChild(li);
  });
  // re-highlight by currentIndex if visible
  highlightCurrent();
}

function highlightOnIndex(i){
  // scroll + visual focus handled in highlightCurrent()
}

// Restore last played channel
function restoreLast(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(obj && typeof obj.index === 'number' && obj.index>=0 && obj.index < channels.length){
      playByIndex(obj.index);
    }
  }catch(e){console.warn('restore',e)}
}

// Keyboard / пульт
let focused = 0;
window.addEventListener('keydown',(e)=>{
  const items = channelListEl.querySelectorAll('li');
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    focused = Math.min(focused+1, items.length-1);
    items[focused] && items[focused].focus();
    return;
  }
  if(e.key === 'ArrowUp'){
    e.preventDefault();
    focused = Math.max(focused-1, 0);
    items[focused] && items[focused].focus();
    return;
  }
  if(e.key === 'Enter'){
    e.preventDefault();
    const idx = Array.from(items).indexOf(document.activeElement);
    if(idx>=0) playByIndex(idx);
    return;
  }
  if(e.key === ' '){
    e.preventDefault();
    togglePlay();
    return;
  }
  if(e.key === 'Backspace'){
    e.preventDefault();
    // stop playback and focus list
    try{ player.pause(); player.src=''; }catch(_){}
    nowTitle.textContent = '';
    channelListEl.focus();
    return;
  }
  if(e.key === '+' || e.key === '=' ){
    e.preventDefault();
    setVolume(Math.min(1, player.volume + 0.1));
    return;
  }
  if(e.key === '-' || e.key === '_'){
    e.preventDefault();
    setVolume(Math.max(0, player.volume - 0.1));
    return;
  }
  if(e.key === 'ArrowLeft'){
    e.preventDefault();
    // jump back in playlist
    changeIndex((currentIndex||0)-1);
    return;
  }
  if(e.key === 'ArrowRight'){
    e.preventDefault();
    changeIndex((currentIndex||0)+1);
    return;
  }
});

// init volume
const savedVol = parseFloat(localStorage.getItem('vidaa_vol')||'1');
setVolume(isNaN(savedVol)?1:savedVol);

// initial load
loadM3U(M3U_URL);

// expose for debug
window.__vidaa = {channels, playByIndex, loadM3U, playStream};
