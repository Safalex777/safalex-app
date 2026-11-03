// Веб-апп канала Safalex (t.me/safalex777). Без сборки: данные в data/lessons.js (собирает tools/build_data.py), экраны рисуются строками.
// Зачем человеку заходить: найти урок под свою задачу, забрать промпт или скилл в одно касание, видеть свой прогресс и что делать дальше.
(function () {
  'use strict';
  const D = window.SAFALEX || { lessons: [], tools: [], walls: {}, site: {} };
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined ? window.Telegram.WebApp : null;
  const inTg = !!(tg && tg.platform && tg.platform !== 'unknown');

  // ---------- мелочи ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const L = id => D.lessons.find(l => l.id === id);
  const T = id => D.tools.find(t => t.id === id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ph = s => esc(s).replace(/\[([^\]]+)\]/g, '<span class="ph">[$1]</span>');
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (h > 10 && h < 15 ? c : m === 1 ? a : m > 1 && m < 5 ? b : c); };
  const word = (n, a, b, c) => plural(n, a, b, c).replace(/^\d+ /, '');
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const dmy = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const missing = u => !u || /\[\?\]/.test(u);
  const qtag = u => missing(u) && !inTg ? ' <em class="qtag">[?]</em>' : '';
  const draftTag = x => x && x.draft && !inTg ? ' <em class="qtag draft">черновик</em>' : '';
  const KINDS = D.kinds || {};
  const kindOne = k => (KINDS[k] || {}).one || k;
  const TOPICS = D.topics || [];
  const topicTitle = id => (TOPICS.find(t => t.id === id) || {}).title || '';
  const KIND_ICON = { prompt: '✦', template: '[ ]', command: '>_', skill: 'zip', cheat: '≡' };
  // в списках «Читать 5 минут» у всех одинаковое, оставляем только сколько делать
  const fixTime = t => String(t || '').replace(/минут за (\d+)/gi, 'за $1').replace(/за (\d+)(?![\d\s]*мин)/gi, (m, n) => `за ${n} ${word(+n, 'минуту', 'минуты', 'минут')}`);
  const shortTime = l => fixTime((l.time || '').replace(/^(читать|урок на) \d+ минут[аы]?( · )?/i, '') || l.time || '');
  // можно ли пройти урок с телефона: по списку «Что понадобится»
  const device = l => { const n = (l.need || []).join(' '); return /компьютер/i.test(n) && !/телефон/i.test(n.replace(/на телефоне/i, '')) ? 'нужен компьютер' : 'можно с телефона'; };

  // ---------- Telegram ----------
  const haptic = {
    tap() { try { tg && tg.HapticFeedback.impactOccurred('light'); } catch (e) {} },
    pick() { try { tg && tg.HapticFeedback.selectionChanged(); } catch (e) {} },
    ok() { try { tg && tg.HapticFeedback.notificationOccurred('success'); } catch (e) {} },
    warn() { try { tg && tg.HapticFeedback.notificationOccurred('warning'); } catch (e) {} },
  };
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    const bg = t === 'dark' ? '#0f1230' : '#eef0fb';
    if (tg) { try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); tg.setBottomBarColor && tg.setBottomBarColor(bg); } catch (e) {} }
    wallNow = ''; if (lastWall) setWall(lastWall);
  }
  function open(url) {
    if (missing(url)) { toast('Ссылку добавим со дня на день', true); haptic.warn(); return; }
    haptic.tap();
    if (tg) { try { if (/^https?:\/\/t\.me\//.test(url)) tg.openTelegramLink(url); else tg.openLink(url); return; } catch (e) {} }
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }
  // поделиться: ссылка на апп в Telegram с параметром, или на пост урока, пока у аппа нет адреса
  function share(param, text, fallback) {
    const app = D.site.app_url;
    const url = !missing(app) ? app + (app.includes('?') ? '&' : '?') + 'startapp=' + encodeURIComponent(param) : fallback;
    if (missing(url)) { toast('Поделиться получится, когда у аппа будет адрес в Telegram', true); haptic.warn(); return; }
    open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text || ''));
  }

  // ---------- что человек сделал (видно только ему: браузер + облако Telegram) ----------
  const store = {
    get(k, def) { try { const v = localStorage.getItem('sfx-' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) {
      const s = JSON.stringify(v);
      try { localStorage.setItem('sfx-' + k, s); } catch (e) {}
      try { tg && tg.CloudStorage && tg.isVersionAtLeast('6.9') && s.length < 4000 && tg.CloudStorage.setItem(k, s); } catch (e) {}
    },
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  let done = new Set(store.get('done', []));
  let saved = store.get('saved', []);
  let recent = store.get('recent', []);
  let words = store.get('words', {}); // мои слова для шаблонов: [тема], [имя]… подставляются во все шаблоны
  let first = store.get('first', '') || today();
  let days = store.get('days', []);
  let opened = store.get('opened', {});
  let readp = store.get('read', {});
  let copies = store.get('copies', 0);
  let seenPost = store.get('seen', 0); // самый свежий пост канала, который человек уже видел в аппе
  const seen0 = seenPost; // каким он был при входе: «новый» показываем у уроков, вышедших после прошлого захода
  let profile = store.get('profile', {}); // «Мой блог»: 4 ответа, из них заполняются скобки во всех шаблонах
  let spins = store.get('spins', 0), clean = store.get('clean', 0), stkSeen = store.get('stk', null);
  // какие скобки шаблонов закрывает каждый ответ про блог
  const PROFILE = [
    { k: 'niche', q: 'О чём ваш блог?', ph: 'например: домашняя выпечка', alias: ['[тема]', '[ниша]', '[ваша ниша]'] },
    { k: 'audience', q: 'Кто ваши зрители?', ph: 'например: мамы в декрете, хотят печь быстро', alias: ['[кто ваши зрители]', '[зрители]', '[кто ваша аудитория]', '[аудитория, её боли и желания]', '[кто они и что их беспокоит]', '[кто]'] },
    { k: 'me', q: 'Кто вы и чем занимаетесь?', ph: 'например: пеку восемь лет, учу печь без миксера', alias: ['[чем занимаетесь]', '[чем занимаюсь]', '[кто вы]', '[2-3 предложения о себе и своём опыте]'] },
    { k: 'link', q: 'Куда ведёте людей?', ph: 'например: Telegram-канал t.me/…', alias: ['[куда вести]', '[ссылка]', '[ссылка на канал]'] },
    { k: 'word', q: 'Кодовое слово под рилсом', ph: 'например: РЕЦЕПТ', alias: ['[СЛОВО]'], extra: true },
    { k: 'name', q: 'Как вас зовут', ph: 'имя', alias: ['[имя]'], extra: true },
  ];
  // слово для скобки: то, что вписали в этом шаблоне, иначе ответ из «Мой блог»
  const wv = f => { const w = (words[f] || '').trim(); if (w) return w; const p = PROFILE.find(x => x.alias.includes(f)); return p ? (profile[p.k] || '').trim() : ''; };
  const profileDone = () => PROFILE.filter(p => !p.extra).every(p => (profile[p.k] || '').trim());
  if (!days.includes(today())) { days = [...days, today()].slice(-90); store.set('days', days); }
  store.set('first', first);
  const dayN = s => Math.round(new Date(s + 'T12:00') / 864e5);
  function streak() { let n = 0; const d = dayN(today()), set = new Set(days.map(dayN)); while (set.has(d - n)) n++; return n; }
  const pct = l => done.has(l.id) ? 100 : l.pages.length && readp[l.id] ? Math.min(99, Math.round(readp[l.id] / l.pages.length * 100)) : 0;
  const postN = l => +((l.links.post || '').match(/\/(\d+)$/) || [0, 0])[1];
  function loadCloud() {
    try {
      if (!(tg && tg.CloudStorage && tg.isVersionAtLeast('6.9'))) return;
      tg.CloudStorage.getItems(['done', 'saved', 'words', 'first', 'opened', 'read', 'copies'], (err, v) => {
        if (err || !v) return;
        try {
          if (v.done) JSON.parse(v.done).forEach(x => done.add(x));
          if (v.saved) JSON.parse(v.saved).forEach(x => { if (!saved.includes(x)) saved.push(x); });
          if (v.words) words = Object.assign(JSON.parse(v.words), words);
          if (v.first) { const f = JSON.parse(v.first); if (f < first) { first = f; store.set('first', first); } }
          if (v.opened) opened = Object.assign(JSON.parse(v.opened), opened);
          if (v.read) { const r = JSON.parse(v.read); Object.keys(r).forEach(k => { readp[k] = Math.max(readp[k] || 0, r[k]); }); }
          if (v.copies) copies = Math.max(copies, JSON.parse(v.copies));
          render();
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ---------- иконки ----------
  const svg = (p, w) => `<svg width="${w || 22}" height="${w || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    home: svg('<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>'),
    lessons: svg('<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M10 9v6l5-3z" fill="currentColor"/>'),
    tools: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2c.7 6.3 3 8.6 9.5 10-6.5 1.4-8.8 3.7-9.5 10-.7-6.3-3-8.6-9.5-10C9 10.6 11.3 8.3 12 2Z" fill="currentColor"/></svg>',
    me: svg('<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>'),
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/>'),
    back: svg('<path d="m15 5-7 7 7 7"/>', 22),
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>',
    tg: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.2 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8l3.2-15.1c.3-1.3-.5-1.9-1.4-1.6ZM9.5 14.3l-.4 4-1.3-4.3 10-6.3-8.3 6.6Z" fill="currentColor"/></svg>',
    ig: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>', 20),
    arr: svg('<path d="m9 5 7 7-7 7"/>', 18),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18),
    star: svg('<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>', 20),
    starOn: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor"/></svg>',
    share: svg('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v6h14v-6"/>', 18),
    pin: svg('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 16),
    post: svg('<path d="M4 5h16v11H8l-4 4z"/>', 18),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', 20),
    moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 20),
    left: svg('<path d="m15 5-7 7 7 7"/>', 16),
    right: svg('<path d="m9 5 7 7-7 7"/>', 16),
  };
  // стеклянные 3D-иконки разделов из Magnific (assets/icons, режет tools/marks.mjs)
  const ICO = { '✦': 'icons/star', '✎': 'icons/pencil', '▶': 'icons/play', '◎': 'icons/aperture', '→': 'icons/arrow', '₽': 'icons/ruble', spin: 'icons/reel', check: 'icons/check', blog: 'icons/notebook',
    streak: 'obj/flame', saved: 'obj/bookmark', copied: 'obj/copy', award: 'obj/trophy' };
  const ico = (k, fb) => ICO[k] ? `<img class="ico" src="assets/${ICO[k]}.webp" alt="" width="84" height="84" decoding="async">` : esc(fb || k || '');
  // свой стеклянный 3D-объект у каждого урока (assets/obj, режет tools/marks.mjs)
  const LOBJ = { L01: 'chat-spark', L02: 'mic', L04: 'trend', L05: 'funnel', L06: 'layers', L07: 'hook', L08: 'phone', L09: 'calendar', L10: 'picture', L11: 'toolbox', L12: 'clapper', L13: 'cards',
    L14: 'badge', L15: 'robot', L16: 'magnet', L17: 'plane', L18: 'wand', L19: 'headset', L20: 'camera', L21: 'tag', L22: 'dialog', L23: 'thermo', L24: 'spool', L25: 'rocket', L26: 'code',
    L27: 'table', L28: 'bolt-chat', L29: 'briefcase', L30: 'pen', L31: 'tv', L32: 'loupe', L33: 'cap', L34: 'scales' };
  const objSrc = l => `assets/obj/${LOBJ[l.id] || 'book'}.webp`;

  // ---------- общие куски ----------
  // номер + сжатый капс одной высоты: строки тянутся на одну ширину, номер под высоту блока (как в PDF уроков)
  function lock(num, lines, label) {
    return `<div class="lock">${label ? `<span class="nl">${esc(label)}</span>` : ''}${num !== '' ? `<div class="num">${esc(num)}</div>` : ''}<div class="ttl">${lines.map(l => `<span class="fit">${esc(l)}</span>`).join('')}</div></div>`;
  }
  function fitLocks(root) {
    $$('.lock', root).forEach(lk => {
      const num = $('.num', lk), ttl = $('.ttl', lk), lines = $$('.fit', ttl);
      const maxh = +(lk.dataset.maxh || (lk.closest('.cover') ? 84 : 104));
      const avail = lk.clientWidth - 8;
      if (!avail) return;
      for (let k = 0; k < 5; k++) {
        const w = avail - (num ? num.getBoundingClientRect().width : 0);
        lines.forEach(l => { l.style.fontSize = '100px'; l.style.fontSize = Math.max(10, 100 * w / l.scrollWidth) + 'px'; });
        const fs = lines.map(l => parseFloat(l.style.fontSize)), mn = Math.min(...fs);
        lines.forEach((l, j) => { l.style.fontSize = Math.min(fs[j], mn * 1.3) + 'px'; });
        let h = ttl.getBoundingClientRect().height;
        if (h > maxh) { lines.forEach(l => { l.style.fontSize = parseFloat(l.style.fontSize) * maxh / h + 'px'; }); h = maxh; }
        if (num) num.style.fontSize = h / 0.8 + 'px';
      }
      lk.classList.add('ready');
    });
  }
  const tape = (text, cls) => { const run = esc(Array(8).fill(text).join(' ✦ ')) + ' ✦ '; return `<div class="tape${cls ? ' ' + cls : ''}"><span class="run">${run}${run}</span></div>`; };
  // обложка урока: та же первая страница PDF, стена и тон из сборки урока
  function cover(l) {
    const st = done.has(l.id) ? '<span class="sticker blue">пройден ✓</span>' : l.has_video ? `<span class="sticker">${I.play} видео</span>` : l.skills.length ? '<span class="sticker">+ скилл</span>' : '<span class="sticker">PDF</span>';
    return `<div class="cover tint-${esc(l.tint)}" style="background-image:url('${esc(l.bg)}')"><div class="in">
      <div class="hdr"><span>${esc(l.series)}</span>${st}</div>
      ${lock(l.n, l.lines && l.lines.length ? l.lines : [l.title], 'урок')}
      ${tape(l.tape)}</div></div>`;
  }
  const secH = (title, more, href, sub) => `<div class="sec-h"><div><h2>${title}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>${more ? `<a href="${href}">${more} →</a>` : ''}</div>`;
  const isSaved = id => saved.includes(id);
  const starBtn = id => `<button class="star${isSaved(id) ? ' on' : ''}" data-act="save" data-id="${esc(id)}" aria-label="${isSaved(id) ? 'Убрать из моего' : 'Сохранить в моё'}">${isSaved(id) ? I.starOn : I.star}</button>`;
  const stateTag = l => { const p = pct(l); return done.has(l.id) ? '<em class="st ok">✓</em>' : p ? `<em class="st">${p}%</em>` : seen0 && postN(l) > seen0 && !opened[l.id] ? '<em class="st new">новый</em>' : ''; };
  // строка урока в списках: номер, название, что получите, сколько делать
  function lrow(l, label) {
    const p = pct(l);
    return `<a class="lrow" href="#/lesson/${l.id}"><span class="lr-o"><img src="${objSrc(l)}" alt="" width="84" height="84" decoding="async"></span>
      <span class="lr-t"><small class="lr-l">урок ${l.n}${label ? ' · ' + esc(label) : ''}</small><b>${esc(l.title)}</b><span>${esc(l.sub || l.headline || '')}</span>
        <small>${esc(shortTime(l))} · ${device(l)}</small>${p && !done.has(l.id) ? `<i class="bar"><i style="width:${p}%"></i></i>` : ''}</span>${stateTag(l)}</a>`;
  }
  // строка в «Полезном»: коротко, по нажатию страница с примером
  function itemRow(t) {
    const l = t.lesson && L(t.lesson);
    const sub = t.of ? 'Шаблон ' + t.of : t.why || (l ? l.headline : '');
    return `<div class="irow" data-tool="${esc(t.id)}">
      <a class="ir-main" href="#/item/${encodeURIComponent(t.id)}"><i class="kic k-${t.kind}">${esc(KIND_ICON[t.kind] || '✦')}</i>
        <span><b>${esc(t.title)}${draftTag(t)}</b><span>${esc(sub)}</span><small>${esc(kindOne(t.kind))}${t.topic ? ' · ' + esc(topicTitle(t.topic)) : ''}${l ? ' · урок ' + l.n : t.ctx ? ' · ' + esc(t.ctx) : ''}</small></span></a>
      <div class="ir-acts">${t.kind === 'skill' ? `<button class="mini" data-act="files" data-id="${t.lesson}">Где скачать</button>` : `<button class="mini" data-act="copy" data-id="${esc(t.id)}">Скопировать</button>`}${starBtn(t.id)}</div>
    </div>`;
  }
  function ring(n, total, size) {
    const r = 46, c = 2 * Math.PI * r, part = total ? n / total : 0;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${r}" class="ring-bg"/><circle cx="55" cy="55" r="${r}" class="ring-fg" style="--c:${c.toFixed(1)};--o:${(c * (1 - part)).toFixed(1)}"/></svg>`;
  }
  function links() {
    const c = D.site.channel || {}, ig = D.site.instagram || {};
    const row = (icon, t, sub, url) => `<button class="link" data-url="${esc(url || '')}"><i>${icon}</i><span><b>${esc(t)}${qtag(url)}</b><small>${esc(sub)}</small></span></button>`;
    return `<div class="links">${row(I.tg, 'Канал Safalex', 'все посты и комментарии', c.url)}${row(I.post, 'Навигация', 'все уроки одним постом', D.site.nav_post)}${row(I.ig, 'Instagram', '@mrsafalex, рилсы', ig.url)}</div>`;
  }

  // три инструмента: на главной и в «Полезном»
  const tools3 = list => list ? `<p class="label blk">Инструменты</p><div class="glass tlist">
    <a href="#/spin">${ico('spin')}<span><b>Что снять сегодня</b><small>барабан идей под ваш блог</small></span>${I.arr}</a>
    <a href="#/check">${ico('check')}<span><b>Проверка на нейрослоп</b><small>вставьте текст, подсвечу штампы</small></span>${I.arr}</a>
    <a href="#/profile">${ico('blog')}<span><b>Мой блог</b><small>${profileDone() ? esc(profile.niche) + ' · изменить' : '4 ответа, и шаблоны заполнятся сами'}</small></span>${I.arr}</a></div>` : `<div class="tools3">
    <a class="glass t3" href="#/spin">${ico('spin')}<b>Что снять сегодня</b><span>барабан идей под ваш блог</span></a>
    <a class="glass t3" href="#/check">${ico('check')}<b>Проверка на нейрослоп</b><span>вставьте текст, подсвечу штампы</span></a>
    <a class="glass t3${profileDone() ? ' ok' : ''}" href="#/profile">${ico('blog')}<b>Мой блог</b><span>${profileDone() ? esc(profile.niche) + ' · изменить' : '4 ответа, и шаблоны заполнятся сами'}</span></a></div>`;
  // ---------- разделы: задачи, под которые подобраны уроки ----------
  function sections() {
    const secs = (D.site.sections || []).map(s => ({ ...s, list: [] }));
    const other = { title: 'Ещё уроки', goal: '', icon: '•', list: [] };
    D.lessons.forEach(l => {
      const t = (l.title + ' ' + l.series).toLowerCase();
      const s = secs.find(s => (s.ids || []).includes(l.id)) || secs.find(s => (s.kw || []).some(k => t.includes(k)));
      (s || other).list.push(l);
    });
    secs.forEach(s => s.list.sort((a, b) => { const ia = (s.ids || []).indexOf(a.id), ib = (s.ids || []).indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.n - b.n; }));
    return [...secs, other].filter(s => s.list.length);
  }
  const order = () => sections().flatMap(s => s.list);
  // следующий урок: тот, что начат последним, иначе первый непройденный по маршруту
  function nextLesson() {
    const last = Object.entries(opened).filter(([id]) => L(id) && !done.has(id)).sort((a, b) => b[1] - a[1])[0];
    return { l: (last && L(last[0])) || order().find(l => !done.has(l.id)), resumed: !!last, at: last && last[1] };
  }
  function greeting() {
    const h = new Date().getHours();
    let name = '';
    try { name = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || ''; } catch (e) {}
    return (h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер') + (name ? ', ' + name : '');
  }
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 6e4);
    return m < 60 ? 'только что' : m < 1440 ? plural(Math.round(m / 60), 'час', 'часа', 'часов') + ' назад' : plural(Math.round(m / 1440), 'день', 'дня', 'дней') + ' назад';
  }

  // ---------- экраны ----------
  // ГЛАВНАЯ: что у меня сейчас. Прогресс и следующий шаг, задачи, новое в канале, рабочий набор скиллов
  function home() {
    const secs = sections(), all = order(), total = all.length, nDone = all.filter(l => done.has(l.id)).length;
    const nx = nextLesson(), l = nx.l;
    const fresh = [...D.lessons].sort((a, b) => postN(b) - postN(a)).slice(0, 3);
    const newCount = seenPost ? D.lessons.filter(x => postN(x) > seenPost && !opened[x.id]).length : 0; // в первый визит новым считается всё, счётчик не показываем
    const skills = D.tools.filter(t => t.kind === 'skill');
    const cur = secs.findIndex(x => x.list.some(y => !done.has(y.id)));
    const stg = secs.map((x, i) => { const d = x.list.filter(y => done.has(y.id)).length; return `<i class="${i === cur ? 'now' : ''}" style="--w:${x.list.length};--p:${x.list.length ? (d / x.list.length).toFixed(3) : 0}"></i>`; }).join('');
    return `
      <section class="hq glass">
        <div class="hq-h"><span class="label">${esc(greeting())}</span><a href="#/route">карта маршрута →</a></div>
        <div class="hq-n"><b data-count="${nDone}" data-pad="2">${String(nDone).padStart(2, '0')}</b><span>/${total}</span><em>${nDone ? 'уроков<br>пройдено' : 'уроков<br>ждут вас'}</em></div>
        <div class="stg" aria-hidden="true">${stg}</div>
        <p class="hq-s">${cur >= 0 ? `Этап ${cur + 1} из ${secs.length}: <b>${esc(secs[cur].title)}</b>` : 'Все этапы пройдены'}</p>
        ${l ? `<div class="hq-next">${lrow(l, nx.resumed ? (pct(l) ? 'пролистали ' + pct(l) + '%' : 'открывали ' + ago(nx.at)) : nDone ? 'следующий по маршруту' : 'первый урок')}</div>
          ${l.steps.length ? `<a class="btn main wide" href="#/steps/${l.id}/0">${readp[l.id] ? 'Продолжить по шагам' : 'Пройти по шагам'} · ${plural(l.steps.length, 'шаг', 'шага', 'шагов')}</a>` : `<a class="btn main wide" href="#/lesson/${l.id}">Открыть урок</a>`}`
          : '<p class="note">Все уроки пройдены. Новый выйдет в канале</p>'}
      </section>

      <section class="sec">${secH('Что хотите сделать?', 'все уроки', '#/lessons')}
        <div class="tasks">${secs.map((x, i) => { const d = x.list.filter(y => done.has(y.id)).length;
          return `<a class="task glass" href="#/lessons?t=${i}">${ico(x.icon, i + 1)}<b>${esc(x.title)}</b><span>${plural(x.list.length, 'урок', 'урока', 'уроков')}${d ? ' · ' + d + ' пройдено' : ''}</span><em class="bar"><i style="width:${d / x.list.length * 100}%"></i></em></a>`; }).join('')}</div></section>

      <section class="sec">${secH('Новое в канале' + (newCount ? ` <em class="pill">${newCount}</em>` : ''), 'все по номерам', '#/nav')}
        <div class="glass list">${fresh.map(x => lrow(x)).join('')}</div></section>

      <section class="sec">${secH('Инструменты', '', '', 'работают прямо здесь')}${tools3()}</section>

      ${skills.length ? `<section class="sec">${secH('Рабочий набор', 'все', '#/tools?k=skill', 'скиллы для Claude, которыми я пользуюсь сам')}
        <div class="shelf">${skills.map(t => { const ll = L(t.lesson); return `<a class="skill glass" href="#/item/${encodeURIComponent(t.id)}"><span class="sk-zip">урок ${ll ? ll.n : ''}</span><b>${esc(ll ? ll.title : t.title)}</b><span>${esc((t.title.match(/[a-z0-9-]+safalex/) || [''])[0])}</span></a>`; }).join('')}</div></section>` : ''}

      <section class="sec">${links()}</section>
      <p class="foot">Прогресс виден только вам · обновлено ${dmy(D.updated)}</p>`;
  }

  // УРОКИ: задачи → уроки по порядку, что получите после каждого
  function lessons(f) {
    const filt = l => !f || (f === 'phone' && device(l) === 'можно с телефона') || (f === 'video' && l.has_video) || (f === 'skill' && l.skills.length) || (f === 'todo' && !done.has(l.id));
    const secs = sections().map((s, i) => ({ ...s, i, all: s.list, list: s.list.filter(filt) })).filter(s => s.list.length);
    return `${lock(D.lessons.length, [word(D.lessons.length, 'урок', 'урока', 'уроков'), 'по задачам'], '')}
      <p class="lead">Выберите задачу. Под ней уроки по порядку и что вы получите после каждого.</p>
      <div class="seg">${[['', 'Все'], ['todo', 'Не пройдены'], ['phone', 'С телефона'], ['skill', 'Со скиллом'], ['video', 'С видео']].map(([v, n]) => `<button class="${(f || '') === v ? 'on' : ''}" data-act="lfilter" data-id="${v}">${n}</button>`).join('')}</div>
      <nav class="tasknav">${secs.map(s => `<button data-act="jump" data-id="task-${s.i}"><b>${ico(s.icon, s.i + 1)}</b>${esc(s.title)}</button>`).join('')}</nav>
      ${secs.length ? secs.map(s => { const d = s.all.filter(l => done.has(l.id)).length;
        return `<section class="sec tsec" id="task-${s.i}"><div class="task-h"><span class="tn">${ico(s.icon, s.i + 1)}</span><div><h2>${esc(s.title)}</h2>${s.goal ? `<p>Итог: ${esc(s.goal)}</p>` : ''}</div><em>${d}/${s.all.length}</em></div>
          <div class="glass list">${s.list.map(l => lrow(l)).join('')}</div></section>`; }).join('')
        : `<div class="glass empty"><p class="hand">${f === 'todo' ? 'Всё пройдено. Новый урок выйдет в канале' : 'Таких уроков пока нет'}</p></div>`}
      <button class="btn ghost wide" style="margin-top:22px" data-act="go" data-id="#/nav">Все уроки по номерам, как в навигации канала</button>`;
  }

  // УРОК: что это, из поста канала; PDF прямо здесь; промпты и скилл; если что-то не так
  function lesson(id) {
    const l = L(id);
    if (!l) return `<div class="empty glass"><p class="hand">Такого урока пока нет.</p><a class="btn main" href="#/lessons">Все уроки</a></div>`;
    const tools = D.tools.filter(t => t.lesson === id && t.kind !== 'skill'), sk = D.tools.filter(t => t.lesson === id && t.kind === 'skill');
    const all = order(), next = all[all.indexOf(l) + 1];
    const d = done.has(l.id);
    return `<div class="lesson-cover">${cover(l)}</div>
      <section class="glass about"><img class="about-o" src="${objSrc(l)}" alt="" width="84" height="84">
        ${l.headline ? `<h1>${esc(l.headline)}</h1>` : ''}
        ${l.hook ? `<p>${esc(l.hook)}</p>` : l.lead ? `<p>${esc(l.lead)}</p>` : ''}
        <div class="chips">${l.time ? `<span class="chip time">${esc(fixTime(l.time))}</span>` : ''}<span class="chip dev">${device(l)}</span>${l.need.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>
        ${l.steps.length ? `<a class="btn main wide" href="#/steps/${l.id}/0">${readp[l.id] && !d ? 'Продолжить по шагам' : 'Пройти по шагам'} · ${plural(l.steps.length, 'шаг', 'шага', 'шагов')}</a>` : ''}
        <div class="btns3">${l.pages.length ? `<button class="btn white" data-act="pdf" data-id="${l.id}">${readp[l.id] && !d ? 'Листать дальше' : 'PDF'}</button>` : ''}
          <button class="btn white" data-url="${esc(l.links.post)}">${l.has_video ? I.play + ' Видео' : 'Пост'}${qtag(l.links.post)}</button>
          <button class="btn ghost" data-act="files" data-id="${l.id}">Файлы</button></div>
      </section>
      ${l.steps.length ? `<section class="sec">${secH('Что сделаем', '', '', plural(l.steps.length, 'шаг', 'шага', 'шагов'))}<ol class="glass steps">${l.steps.map(s => `<li><i>${s.n}</i><span>${esc(s.title)}</span></li>`).join('')}</ol></section>` : ''}
      ${l.pages.length ? `<section class="sec">${secH('Страницы PDF', '', '', 'листаются прямо здесь, скачивать не нужно')}
        <div class="pages">${l.pages.map((p, k) => `<button data-act="page" data-id="${l.id}" data-k="${k}" aria-label="Страница ${k + 1}"><img loading="lazy" decoding="async" src="${esc(p)}" alt=""><em>${k + 1}</em>${readp[l.id] > k ? '<u></u>' : ''}</button>`).join('')}</div></section>` : ''}
      ${sk.length ? `<section class="sec">${secH('Скилл урока', '', '', 'ставится в Claude один раз')}<div class="ilist">${sk.map(itemRow).join('')}</div></section>` : ''}
      ${tools.length ? `<section class="sec">${secH('Промпты урока', '', '', 'нажмите, чтобы увидеть пример и заполнить скобки')}<div class="ilist">${tools.map(itemRow).join('')}</div></section>` : ''}
      ${l.fix.length ? `<section class="sec">${secH('Если что-то не так', '', '')}<div class="glass fixes">${l.fix.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(cap(f.a))}${f.step ? ` <small>шаг ${f.step}</small>` : ''}</p></details>`).join('')}</div>
        <p class="note">Не нашли свой случай? Напишите в комментариях под постом урока, на каком шаге застряли.</p></section>` : ''}
      <section class="sec"><div class="row2"><button class="btn ${d ? 'ghost' : 'main'}" data-act="done" data-id="${l.id}">${d ? 'Пройден ✓' : 'Я прошёл урок'}</button>
        <button class="btn ghost" data-act="share" data-id="${l.id}" data-text="Урок ${l.n}. ${esc(l.title)}" data-fb="${esc(l.links.post)}">${I.share} Поделиться</button></div>
        ${next ? `<div class="glass list" style="margin-top:12px">${lrow(next, 'дальше по маршруту')}</div>` : ''}</section>`;
  }

  // ПОЛЕЗНОЕ: виды (промпт, шаблон, команда, скилл, шпаргалка), темы, вопросы, словарь
  function tools(k, topic) {
    const list = D.tools.filter(t => (!k || t.kind === k) && (!topic || t.topic === topic));
    const counts = {};
    D.tools.forEach(t => { counts[t.kind] = (counts[t.kind] || 0) + 1; });
    const kinds = ['prompt', 'template', 'command', 'skill', 'cheat'].filter(x => counts[x]);
    const topics = TOPICS.filter(tp => D.tools.some(t => t.topic === tp.id && (!k || t.kind === k)));
    const q = (kk, tt) => '#/tools' + (kk || tt ? '?' + [kk ? 'k=' + kk : '', tt ? 'topic=' + tt : ''].filter(Boolean).join('&') : '');
    return `${lock(D.tools.length, ['полезное', 'из уроков'], '')}
      <p class="lead">Промпты, шаблоны и скиллы из всех уроков. На карточке зачем это, куда вставить и пример. Скобки можно заполнить прямо здесь.</p>
      ${tools3(true)}
      <p class="label blk">Разделы</p>
      <div class="kinds">${kinds.map(x => `<a class="kind${k === x ? ' on' : ''}" href="${k === x ? q('', topic) : q(x, topic)}"><i>${esc(KIND_ICON[x])}</i><b>${esc(KINDS[x].title)}</b><em>${counts[x]}</em></a>`).join('')}
        <a class="kind" href="#/words"><i>Аа</i><b>Словарь</b><em>${(D.glossary || []).length}</em></a></div>
      <a class="glass faqbar" href="#/faq"><b>?</b><span><strong>${(D.faq || []).filter(x => !x.soon).length} ответов на частые вопросы</strong>какую подписку брать, почему кончается лимит, с чего начать</span>${I.arr}</a>
      ${k ? `<div class="glass explain"><b>${esc(KINDS[k].title)}.</b> ${esc(KINDS[k].what)}</div>` : ''}
      <div class="seg">${[['', 'Все темы'], ...topics.map(tp => [tp.id, tp.title])].map(([v, n]) => `<button class="${(topic || '') === v ? 'on' : ''}" data-act="topic" data-id="${v}" data-k="${k || ''}">${esc(n)}</button>`).join('')}</div>
      ${!list.length ? '<div class="glass empty"><p class="hand">Тут пока пусто, выберите другую тему</p></div>'
        : topic ? `<div class="ilist">${list.map(itemRow).join('')}</div>`
        : [...TOPICS, { id: '', title: 'Ещё', text: '' }].map((tp, i) => { const its = list.filter(t => (t.topic || '') === tp.id || (!tp.id && !TOPICS.some(x => x.id === t.topic))); return its.length ? `<section class="sec">${secH(esc(tp.title), its.length > 3 ? 'все ' + its.length : '', q(k, tp.id), i === 0 && !k ? 'начните отсюда, если только открыли Claude' : tp.text)}<div class="ilist">${its.slice(0, 3).map(itemRow).join('')}</div></section>` : ''; }).join('')}`;
  }
  // страница одной вещи: зачем, куда вставить, текст, поля для скобок, пример, советы
  const fields = text => [...new Set((text.match(/\[[^\]]+\]/g) || []))];
  function filled(t) { let s = t.text; fields(t.text).forEach(f => { const v = wv(f); if (v) s = s.split(f).join(v); }); return s; }
  function filledHtml(t) {
    return t.text.split(/(\[[^\]]+\])/).map(part => {
      if (!/^\[[^\]]+\]$/.test(part)) return esc(part);
      const v = wv(part);
      return v ? `<span class="fv">${esc(v)}</span>` : `<span class="ph">${esc(part)}</span>`;
    }).join('');
  }
  function item(id) {
    const t = T(id);
    if (!t) return `<div class="empty glass"><p class="hand">Не нашёл. Может, переименовали.</p><a class="btn main" href="#/tools">Всё полезное</a></div>`;
    const l = t.lesson && L(t.lesson);
    const fs = t.kind === 'template' ? fields(t.text) : [];
    const like = D.tools.filter(x => x.id !== t.id && x.topic === t.topic && x.kind !== 'skill').slice(0, 3);
    const k = KINDS[t.kind] || {};
    const why = t.why || (l ? l.headline : '');
    let body;
    if (t.kind === 'cheat') {
      body = `<div class="glass cheat">${t.rows.map(r => `<div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('')}</div>
        <button class="btn white wide" data-act="copy" data-id="${esc(t.id)}">Скопировать шпаргалку</button>`;
    } else if (t.kind === 'skill') {
      body = `<div class="paper"><span class="tp l"></span><span class="tp r"></span><div class="pt"><span>${esc(t.file || 'скилл')}</span><span>урок ${l ? l.n : ''}</span></div>
        <h4>${esc(t.title)}</h4><p>${esc(l ? l.hook || t.text : t.text)}</p><button class="btn main" data-act="files" data-id="${t.lesson}">Где скачать</button></div>
        <ol class="glass steps how"><li><i>1</i><span>Скачайте архив из комментариев под постом урока</span></li><li><i>2</i><span>В Claude: Customize → Skills → + Add → Upload skill</span></li><li><i>3</i><span>Проверка: в новом чате наберите / и найдите скилл в списке</span></li></ol>`;
    } else {
      body = `${fs.length ? `<div class="glass fill"><div class="label">впишите своё</div>${fs.map((f, i) => `<label><span>${esc(f.slice(1, -1))}</span> <input id="f-${i}" data-field="${esc(f)}" value="${esc(wv(f))}" placeholder="${esc(f.slice(1, -1))}" autocomplete="off" enterkeyhint="next"></label>`).join('')}
          <p class="note">Запомню и подставлю в другие шаблоны. Стереть можно во вкладке «Моё».</p></div>` : ''}
        <div class="copy"><div class="ch"><span>${esc(k.one || '')}</span><em>${esc(t.where ? 'куда: ' + t.where.split(',')[0].split('(')[0] : '')}</em></div>
          <div class="cb" id="cb">${t.kind === 'template' ? filledHtml(t) : ph(t.text)}</div>
          <div class="cf"><button class="btn white" data-act="copy" data-id="${esc(t.id)}">Скопировать</button></div></div>`;
    }
    return `<div class="item-h"><span class="sticker blue">${esc(KIND_ICON[t.kind])} ${esc(k.one || '')}</span>${t.topic ? `<span class="label">${esc(topicTitle(t.topic))}</span>` : ''}${draftTag(t)}<span class="grow"></span>${starBtn(t.id)}</div>
      <h1 class="ih">${esc(t.title)}</h1>
      ${t.of ? `<p class="of">Шаблон ${esc(t.of)}</p>` : ''}
      ${why ? `<p class="lead">${esc(why)}</p>` : ''}
      ${t.where ? `<div class="where">${I.pin}<span><b>Куда вставить:</b> ${esc(t.where)}</span></div>` : ''}
      <div class="sec">${body}</div>
      ${t.example ? `<section class="sec">${secH(esc(t.example_title || 'Пример'), '', '', /ответ|придёт|получите|покажет/i.test(t.example_title || '') ? 'у вас будет своё, под вашу тему' : '')}<div class="example">${esc(t.example).replace(/\n/g, '<br>')}</div></section>` : ''}
      ${t.tips && t.tips.length ? `<section class="sec">${secH(t.tips.length > 1 ? 'Советы' : 'Совет', '', '')}<div class="tips">${t.tips.map((x, i) => `<div class="note-card" style="--r:${[-1.5, 1.2][i % 2]}deg">${esc(x)}</div>`).join('')}</div></section>` : ''}
      <section class="sec"><div class="row2">${l ? `<a class="btn main" href="#/lesson/${l.id}">Урок ${l.n} целиком</a>` : `<a class="btn main" href="#/tools${t.topic ? '?topic=' + t.topic : ''}">Ещё по теме</a>`}
        <button class="btn ghost" data-act="share" data-id="item-${esc(t.id)}" data-text="${esc(t.title)}" data-fb="${esc(l ? l.links.post : '')}">${I.share} Поделиться</button></div></section>
      ${like.length ? `<section class="sec">${secH('Рядом', '', '', topicTitle(t.topic))}<div class="ilist">${like.map(itemRow).join('')}</div></section>` : ''}`;
  }
  function faq() {
    const f = D.faq || [], ready = f.filter(x => !x.soon), soon = f.filter(x => x.soon);
    return `${lock(ready.length, ['частых', 'вопросов'], 'вопросы')}
      <p class="lead">О чём чаще всего спрашивают под роликами про нейросети. Коротко, подробно в уроке по ссылке.</p>
      <div class="glass fixes faqs">${ready.map((x, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p>${x.links && x.links.length ? `<div class="qa-l">${x.links.map(y => `<a class="mini" href="#/${y.to}">${esc(y.title)} →</a>`).join('')}</div>` : ''}</details>`).join('')}</div>
      ${soon.length ? `<section class="sec">${secH('Отвечу скоро', '', '', 'частые вопросы, на которые ещё нет урока')}<div class="glass plain">${soon.map(x => `<div>${esc(x.q)}</div>`).join('')}</div></section>` : ''}
      <p class="note">Своего вопроса не нашли? Напишите в комментариях под любым постом канала.</p>`;
  }
  function glossary() {
    const g = D.glossary || [];
    return `${lock(g.length, ['словарь', 'без заумных слов'], '')}
      <p class="lead">Слова, которые встречаются в уроках. Объясняю так, как сказал бы вслух.</p>
      <div class="glass words">${g.map(w => `<div><b>${esc(w.term)}</b><span>${esc(cap(w.text))}</span></div>`).join('')}</div>`;
  }
  // навигация как в закрепе канала: все уроки по номерам, каждый открывается здесь
  function nav() {
    const list = [...D.lessons].sort((a, b) => a.n - b.n);
    return `${lock(list.length, ['все уроки', 'по номерам'], 'навигация')}
      <p class="lead">Как пост-навигация в канале, только с вашим прогрессом. Нажмите на урок, чтобы открыть его здесь.</p>
      <button class="btn white wide" data-url="${esc(D.site.nav_post || '')}">${I.tg} Навигация в канале${qtag(D.site.nav_post)}</button>
      <div class="glass list" style="margin-top:14px">${list.map(l => lrow(l)).join('')}</div>`;
  }

  // ПОИСК: уроки, шаги, полезное, словарь, вопросы и «если что-то не так»; окончания отрезаем
  const SYN = { ролик: ['видео', 'рилс'], видео: ['ролик', 'рилс'], рилс: ['ролик', 'видео', 'reels'], пост: ['текст'], текст: ['пост'], нейросет: ['claude', 'ии'], ии: ['нейросет', 'claude'],
    кнопк: ['не нашли', 'интерфейс'], лимит: ['кончились', 'сообщения', 'pro'], деньг: ['pro', 'тариф', 'подписк', 'продаж'], оплат: ['pro', 'подписк'], бесплатн: ['тариф', 'pro'], телефон: ['приложение'],
    голос: ['голосом', 'голосового'], сценари: ['сценарий'], монтаж: ['смонтируй'], скилл: ['skill'], звук: ['громкость'], субтитр: ['субтитров'], reels: ['рилс'], тикток: ['рилс', 'видео'],
    шапк: ['профил'], подпис: ['подпись'], план: ['контент-план', 'таблиц'], снять: ['тем', 'идея', 'план', 'съёмк'], клиент: ['продаж', 'оффер', 'директ'], продат: ['оффер', 'продаж', 'прогрев'] };
  const normz = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const stem = w => w.length >= 7 ? w.slice(0, -3) : w.length >= 5 ? w.slice(0, -2) : w;
  const STOP = new Set(['не', 'на', 'как', 'что', 'мне', 'мой', 'моя', 'для', 'это', 'где', 'или', 'по', 'из', 'за', 'от', 'до', 'я', 'и', 'в', 'с', 'моим', 'мои', 'моей', 'свой', 'свои', 'хочу', 'можно', 'нужно', 'надо', 'чтобы']);
  function terms(q) {
    return normz(q).split(/[^a-zа-я0-9]+/i).filter(w => w.length > 1 && !STOP.has(w)).map(w => {
      const s = stem(w), alts = [s];
      Object.keys(SYN).forEach(k => { if (s.startsWith(k) || k.startsWith(s) && s.length >= 3) SYN[k].forEach(a => alts.push(normz(a))); });
      return alts;
    });
  }
  // слово ищем с начала слова, чтобы «бот» не находил «работу»; из трёх слов запроса достаточно двух
  const wordsOf = s => ' ' + normz(s).replace(/[^a-zа-я0-9]+/gi, ' ') + ' ';
  function score(groups, title, body) {
    const t = wordsOf(title), b = wordsOf(body);
    let sc = 0, hit = 0;
    for (const g of groups) { if (g.some(a => t.includes(' ' + a))) { sc += 3; hit++; } else if (g.some(a => b.includes(' ' + a))) { sc += 1; hit++; } }
    return hit >= Math.ceil(groups.length * 0.6) ? sc : 0;
  }
  function mark(s, groups) {
    const out = esc(s), ws = [...new Set(groups.flat())].filter(w => w.length > 1).sort((a, b) => b.length - a.length);
    if (!ws.length) return out;
    return out.replace(new RegExp('(' + ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]')).join('|') + ')', 'gi'), '<mark>$1</mark>');
  }
  function snippet(text, groups) {
    const t = normz(text), a = groups.flat().map(w => t.indexOf(w)).filter(i => i >= 0).sort((x, y) => x - y)[0] || 0, s = Math.max(0, a - 40);
    return (s ? '…' : '') + text.slice(s, s + 140).replace(/\n/g, ' ') + (text.length > s + 140 ? '…' : '');
  }
  function searchResults(q) {
    const g = terms(q);
    if (!g.length) return '';
    const hits = { a: [], f: [], l: [], t: [] };
    const hit = (href, title, sub, small) => `<a class="hit" href="${href}"><b>${mark(title, g)}</b><span>${sub}</span><small>${small}</small></a>`;
    (D.faq || []).forEach(x => { const sc = score(g, x.q, x.a || ''); if (sc) hits.a.push([sc + (x.soon ? 0 : 1), hit('#/faq', x.q, x.soon ? 'Ответа пока нет, отвечу в канале.' : mark(x.a, g), 'частый вопрос' + (x.soon ? ' · скоро' : ''))]); });
    (D.glossary || []).forEach(w => { const sc = score(g, w.term, w.text); if (sc) hits.a.push([sc + 2, hit('#/words', w.term, mark(cap(w.text), g), 'словарь')]); });
    D.lessons.forEach(l => {
      const sc = score(g, l.title + ' ' + l.series + ' ' + l.headline, [l.hook, l.sub, l.who, l.need.join(' '), l.steps.map(s => s.title).join(' ')].join(' '));
      if (sc) hits.l.push([sc, hit('#/lesson/' + l.id, 'Урок ' + l.n + '. ' + l.title, mark(l.sub || l.headline, g), esc(shortTime(l)) + ' · ' + device(l))]);
      l.fix.forEach(f => { const s2 = score(g, f.q, f.a); if (s2) hits.f.push([s2, hit('#/lesson/' + l.id, f.q, mark(cap(f.a), g), 'урок ' + l.n + (f.step ? ' · шаг ' + f.step : ''))]); });
    });
    D.tools.forEach(t => { const sc = score(g, t.title, [t.text, t.why, t.of, kindOne(t.kind), topicTitle(t.topic)].join(' ')); if (sc) hits.t.push([sc, hit('#/item/' + encodeURIComponent(t.id), t.title, mark(snippet(t.why || t.text, g), g), esc(kindOne(t.kind)) + (t.ctx ? ' · ' + esc(t.ctx) : ''))]); });
    const block = (name, arr) => arr.length ? `<div class="res"><span class="label">${name} · ${arr.length}</span><div class="glass list">${arr.sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]).join('')}</div></div>` : '';
    return block('Ответы', hits.a) + block('Если что-то не так', hits.f) + block('Уроки', hits.l) + block('Полезное', hits.t)
      || `<div class="glass empty"><p class="hand">По «${esc(q)}» пока ничего.</p><p class="note">Попробуйте другое слово или спросите в комментариях под любым постом.</p></div>`;
  }
  const QUICK = ['что снять', 'пост моим голосом', 'хук', 'монтаж', 'скилл', 'кончился лимит', 'клиенты', 'не нашли кнопку'];
  function search(q) {
    return `<div class="search">${I.search}<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Урок, промпт или вопрос" value="${esc(q)}">
        <button class="clear${q ? '' : ' hide'}" data-act="clear" aria-label="Очистить">${I.x}</button></div>
      <p class="note hint${q ? ' hide' : ''}">Ищет по урокам, промптам, словарю и ответам. Пишите своими словами, например «не нашёл кнопку».</p>
      <div class="quick">${(q ? [] : QUICK).map(w => `<button data-act="q" data-id="${esc(w)}">${esc(w)}</button>`).join('')}</div>
      <div id="results">${searchResults(q)}</div>`;
  }

  // МОЁ: мой маршрут целиком, сохранённое, недавно скопированное, мои слова для шаблонов
  function me() {
    const secs = sections(), all = order(), nDone = all.filter(l => done.has(l.id)).length, nx = nextLesson().l;
    const sv = saved.map(T).filter(Boolean), rc = recent.map(T).filter(t => t && !saved.includes(t.id)).slice(0, 4);
    const ws = Object.entries(words).filter(([, v]) => v && v.trim());
    const st = streak(), stk = STICKERS(), sg = stk.filter(x => x.ok).length;
    // четыре понятные цифры: у каждой иконка, слово и что с ней делать
    const mt = (icon, num, what, hint, id) => `<${id ? `button data-act="jump" data-id="${id}"` : 'div'} class="glass mt">${ico(icon)}<b${/^\d+$/.test(String(num)) ? ` data-count="${num}"` : ''}>${num}</b><span>${what}</span><small>${hint}</small></${id ? 'button' : 'div'}>`;
    return `${lock(nDone, ['из ' + plural(all.length, 'урока', 'уроков', 'уроков'), 'пройдено'], 'мой маршрут')}
      <div class="mst">${mt('streak', st, word(st, 'день', 'дня', 'дней') + ' подряд', 'заходите каждый день, и серия растёт')}${mt('saved', sv.length, 'в сохранённом', 'промпты, которые вы отметили ☆', 'sec-saved')}${mt('copied', copies, 'скопировано', 'промптов и шаблонов вы забрали', rc.length ? 'sec-recent' : '')}${mt('award', sg, 'из ' + stk.length + ' ' + word(stk.length, 'наклейки', 'наклеек', 'наклеек'), 'даются за дела в аппе', 'sec-stk')}</div>
      <section class="sec" id="sec-saved">${secH('Сохранённое', sv.length ? '' : 'в полезное', '#/tools')}${sv.length ? `<div class="ilist">${sv.map(itemRow).join('')}</div>` : `<div class="glass empty"><p class="note">Нажмите ☆ у промпта или шаблона, и он будет здесь под рукой.</p></div>`}</section>
      ${rc.length ? `<section class="sec" id="sec-recent">${secH('Недавно копировали', '', '')}<div class="ilist">${rc.map(itemRow).join('')}</div></section>` : ''}
      <section class="sec">${secH('Маршрут', 'карта', '#/route', 'от нуля до продаж, по этапам')}
        <a class="glass mroute" href="#/route">${secs.map((s, i) => { const d = s.list.filter(l => done.has(l.id)).length;
          return `<div class="${s.list.includes(nx) ? 'cur' : ''}"><b>${String(i + 1).padStart(2, '0')}</b><span>${esc(s.title)}</span><em>${d}/${s.list.length}</em><i class="bar"><i style="width:${d / s.list.length * 100}%"></i></i></div>`; }).join('')}</a></section>
      ${stickerBoard()}
      <section class="sec"><a class="glass pfcta" href="#/profile"><b>✎</b><span><strong>Мой блог${profileDone() ? ': ' + esc(profile.niche) : ''}</strong>${profileDone() ? 'ответы подставляются во все шаблоны, нажмите, чтобы изменить' : '4 ответа, и шаблоны заполнятся сами'}</span>${I.arr}</a></section>
      <section class="sec">${secH('Мои слова для шаблонов', '', '')}${ws.length ? `<div class="glass plain mywords">${ws.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div><button class="btn ghost" style="margin-top:10px" data-act="forget">Стереть мои слова</button>` : `<p class="note">Когда заполните скобки в шаблоне, например [тема], я запомню и подставлю в остальные.</p>`}</section>
      ${D.path && D.site.show_goal ? `<section class="sec"><a class="glass pathbar" href="#/path"><span class="label">мой путь к 10к</span><div><b>${fmt(D.path.followers)}</b><span> из ${fmt(D.path.target)} в Instagram</span></div><i class="bar"><i style="width:${Math.max(1.5, D.path.followers / D.path.target * 100)}%"></i></i></a></section>` : ''}
      <button class="btn ghost wide" data-act="hello" style="margin-top:26px">Как пользоваться аппом</button>`;
  }
  // МАРШРУТ: карта от нуля до продаж. Этапы с итогом, дорога через уроки, пройденное закрашено, «вы здесь» на текущем
  function routeMap() {
    const secs = sections(), all = order(), nDone = all.filter(l => done.has(l.id)).length, nx = nextLesson().l;
    const ROW = 96, XS = [27, 73];
    let k = 0; // сквозной счёт остановок: дорога петляет слева направо через весь маршрут
    const stages = secs.map((s, i) => {
      const d = s.list.filter(l => done.has(l.id)).length, full = d === s.list.length, cur = s.list.includes(nx);
      const pts = s.list.map((l, j) => ({ l, x: XS[(k + j) % 2], y: j * ROW + ROW / 2 + 18 }));
      k += s.list.length;
      const H = s.list.length * ROW + 30;
      const seg = (a, b) => `M${a.x} ${a.y} C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;
      const start = { x: 50, y: 0 };
      const segs = [[start, pts[0], done.has(pts[0].l.id) || pts[0].l === nx], ...pts.slice(1).map((b, j) => [pts[j], b, done.has(pts[j].l.id) && (done.has(b.l.id) || b.l === nx)])];
      const road = `<svg class="road-svg" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">${segs.map(([a, b]) => `<path d="${seg(a, b)}" class="road-bg"/>`).join('')}${segs.filter(x => x[2]).map(([a, b]) => `<path d="${seg(a, b)}" class="road-on"/>`).join('')}</svg>`;
      const stops = pts.map(({ l, x, y }) => {
        const st = done.has(l.id) ? 'done' : l === nx ? 'now' : pct(l) ? 'half' : '';
        const side = x < 50 ? 'r' : 'l';
        return `<button class="stop ${st} ${side}" style="left:${x}%;top:${y}px" data-act="stop" data-id="${l.id}" aria-label="Урок ${l.n}. ${esc(l.title)}">
          <i style="--p:${pct(l)}">${done.has(l.id) ? I.check : l.n}</i>${st === 'now' ? '<span class="here">вы здесь</span>' : ''}
          <span class="sl"><b>${esc(l.title)}</b><small>${esc(shortTime(l))}${pct(l) && !done.has(l.id) ? ' · ' + pct(l) + '%' : ''}</small></span></button>`;
      }).join('');
      return `<section class="rstage${cur ? ' cur' : ''}${full ? ' full' : ''}">
        <div class="rs-card glass"><span class="rs-n">${String(i + 1).padStart(2, '0')}</span>
          <div class="rs-t"><span class="label">этап ${i + 1} · ${d} из ${s.list.length}</span><h2>${esc(s.title)}</h2>${s.goal ? `<p>В конце: ${esc(s.goal)}</p>` : ''}<i class="bar"><i style="width:${d / s.list.length * 100}%"></i></i></div>
          ${full ? `<button class="sticker blue rs-ok" data-act="stage" data-id="${i}">пройден ✓ · в сторис</button>` : cur ? '<span class="sticker rs-ok">идёте</span>' : ''}</div>
        <div class="road" style="height:${H}px">${road}${stops}</div></section>`;
    }).join('');
    return `${lock(nDone, ['из ' + plural(all.length, 'урока', 'уроков', 'уроков'), 'на маршруте'], 'от нуля до продаж')}
      <p class="lead">${secs.length} ${word(secs.length, 'этап', 'этапа', 'этапов')}, у каждого понятный итог. Идите по дороге сверху вниз, нажмите на остановку, чтобы открыть урок.</p>
      <div class="rlegend"><span><i class="lg done"></i>пройден</span><span><i class="lg half"></i>начат</span><span><i class="lg now"></i>вы здесь</span><span><i class="lg"></i>впереди</span></div>
      ${stages}
      <div class="finish">${tape('ФИНИШ ✦ ВАМ ПИШУТ И ПОКУПАЮТ')}<p class="note">Дальше новые уроки выходят в канале, они появятся на маршруте сами.</p></div>`;
  }
  // шторка остановки: что за урок и что сделать, без ухода с карты
  function stopSheet(l) {
    closeSheet();
    const d = done.has(l.id), p = pct(l);
    const el = document.createElement('div');
    el.id = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-act="close"></div><div class="sheet" role="dialog" aria-label="Урок ${l.n}"><div class="grip"></div>
      <div class="ss-h"><span class="lr-n tint-${esc(l.tint)}" style="background-image:url('${esc(l.bg)}')"><b>${l.n}</b></span><div><span class="label">урок ${l.n}${d ? ' · пройден' : p ? ' · пролистали ' + p + '%' : ''}</span><h3>${esc(l.title)}</h3></div></div>
      <p class="ss-sub">${esc(l.sub || l.headline || '')}</p>
      <div class="chips">${l.time ? `<span class="chip time">${esc(fixTime(l.time))}</span>` : ''}<span class="chip dev">${device(l)}</span>${l.skills.length ? '<span class="chip">со скиллом</span>' : ''}</div>
      <div class="row2"><a class="btn main" href="#/lesson/${l.id}">Открыть урок</a>${l.pages.length ? `<button class="btn ghost" data-act="pdf" data-id="${l.id}">${readp[l.id] && !d ? 'Листать дальше' : 'Листать PDF'}</button>` : ''}</div>
      <button class="btn ghost wide" data-act="done" data-id="${l.id}">${d ? 'Снять отметку «пройден»' : 'Я прошёл урок'}</button></div>`;
    document.body.appendChild(el);
    syncBack();
  }
  // МОЙ БЛОГ: 4 ответа, и все шаблоны открываются уже с вашими словами
  function tplCovered() {
    const al = PROFILE.filter(p => (profile[p.k] || '').trim()).flatMap(p => p.alias);
    return D.tools.filter(t => t.kind === 'template' && fields(t.text).some(f => al.includes(f))).length;
  }
  function profileScreen() {
    const n = tplCovered(), main = PROFILE.filter(p => !p.extra), more = PROFILE.filter(p => p.extra);
    const inp = p => `<label><span>${esc(p.q)}</span><input data-pf="${p.k}" value="${esc(profile[p.k] || '')}" placeholder="${esc(p.ph)}" autocomplete="off" enterkeyhint="next"></label>`;
    return `${lock(main.length, ['ответа', 'про ваш блог'], 'мой блог')}
      <p class="lead">Ответьте один раз, и шаблоны откроются уже с вашими словами: копируете и сразу отправляете в Claude. Видно только вам.</p>
      <div class="glass fill pf">${main.map(inp).join('')}
        <details class="pf-more"><summary>Ещё два, по желанию</summary>${more.map(inp).join('')}</details></div>
      <div class="glass pf-res"><b id="pfn">${n}</b><span>${word(n, 'шаблон', 'шаблона', 'шаблонов')} уже с вашими словами</span><a class="btn main" href="#/tools?k=template">Смотреть</a></div>
      <p class="note">Слово в отдельном шаблоне можно поменять прямо в нём, остальные не изменятся.</p>`;
  }

  // ПРОВЕРКА НА НЕЙРОСЛОП: вставили текст, подсветились обороты, которые выдают нейросеть, и как переписать
  const SLOP = (D.slop || []).map(r => { try { return { ...r, rx: new RegExp(r.re.replace(/\\w/g, '[\\wа-яё]'), 'gi') }; } catch (e) { return null; } }).filter(Boolean);
  function slopFind(text) {
    const hits = [];
    SLOP.forEach((r, ri) => { r.rx.lastIndex = 0; let m; while ((m = r.rx.exec(text))) { let a = m.index, b = a + m[0].length; while (a < b && /[\s«(]/.test(text[a])) a++; if (b > a) hits.push({ a, b, ri }); if (m[0].length === 0) r.rx.lastIndex++; } });
    hits.sort((x, y) => x.a - y.a || y.b - x.b);
    const merged = []; hits.forEach(h => { const last = merged[merged.length - 1]; if (last && h.a < last.b) { last.b = Math.max(last.b, h.b); last.rs.add(h.ri); } else merged.push({ a: h.a, b: h.b, rs: new Set([h.ri]) }); });
    return merged;
  }
  function slopResult(text) {
    if (!text.trim()) return '<p class="note">Вставьте пост, подпись или сценарий. Проверка идёт прямо здесь, текст никуда не отправляется.</p>';
    const m = slopFind(text);
    if (!m.length) return `<div class="glass ck-ok"><span class="sticker blue">чисто ✓</span><p>Оборотов, которые выдают нейросеть, не нашёл. Прочитайте вслух: если звучит как вы, можно выкладывать.</p></div>`;
    let html = '', pos = 0;
    m.forEach(h => { html += esc(text.slice(pos, h.a)) + `<mark class="slop" title="${esc([...h.rs].map(i => SLOP[i].name).join(', '))}">${esc(text.slice(h.a, h.b))}</mark>`; pos = h.b; });
    html += esc(text.slice(pos));
    const kinds = [...new Set(m.flatMap(h => [...h.rs]))];
    return `<div class="ck-sum"><b>${m.length}</b><span>${word(m.length, 'место выдаёт', 'места выдают', 'мест выдают')} нейросеть</span></div>
      <div class="glass ck-text">${html.replace(/\n/g, '<br>')}</div>
      <div class="glass fixes ck-list">${kinds.map(i => `<details open><summary>${esc(SLOP[i].name)}</summary><p>${esc(SLOP[i].fix)}</p></details>`).join('')}</div>
      <button class="btn white wide" data-act="ckprompt">Скопировать промпт «перепиши моими словами»</button>`;
  }
  function checkScreen() {
    let draft = ''; try { draft = localStorage.getItem('sfx-ck') || ''; } catch (e) {}
    return `${lock(SLOP.length, ['примет', 'нейрослопа'], 'проверка текста')}
      <p class="lead">Текст от нейросети видно с первой строки. Вставьте свой пост или сценарий, подсвечу места, которые его выдают, и подскажу, как переписать.</p>
      <div class="glass ck-in"><textarea id="ck" rows="7" placeholder="Вставьте текст сюда">${esc(draft)}</textarea>
        <div class="ck-btns"><button class="mini" data-act="ckpaste">Вставить из буфера</button><button class="mini" data-act="ckclear">Очистить</button></div></div>
      <div id="ckres">${slopResult(draft)}</div>`;
  }

  // ЧТО СНЯТЬ СЕГОДНЯ: барабан крутит формулу хука и формат ролика, на выходе готовый промпт под ваш блог
  const HOOKS = ((D.tools.find(t => t.id === 'hook-formulas') || {}).rows || []);
  const FORMATS = D.formats || [];
  let spinNow = null;
  function spinPrompt(h, f) {
    const niche = (profile.niche || '').trim() || '[тема]', aud = (profile.audience || '').trim() || '[кто ваши зрители]';
    return `Мой блог: ${niche}. Мои зрители: ${aud}. Придумай 5 тем для рилса в формате «${f[0]}» (${f[1]}). К каждой теме первая фраза по формуле «${h[0]}», как в примере: ${h[1]}. Каждая фраза до 12 слов, разговорным языком, без восклицательных знаков. Цифры не придумывай.`;
  }
  function spinScreen() {
    const r = spinNow;
    const cell = (cls, title, sub) => `<div class="reel ${cls}"><span class="label">${cls === 'r1' ? 'формула хука' : 'формат ролика'}</span><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;
    return `${lock('?', ['что снять', 'сегодня'], 'барабан')}
      <p class="lead">Нажмите «Крутить»: выпадет формула первой фразы и формат ролика. Под ними готовый промпт, Claude предложит 5 тем под ваш блог.</p>
      <div class="slot glass">${cell('r1', r ? r.h[0] : 'Формула', r ? r.h[1] : 'с чего начать ролик')}${cell('r2', r ? r.f[0] : 'Формат', r ? r.f[1] : 'как снимать')}</div>
      <button class="btn main wide spinbtn" data-act="spin">${r ? 'Крутить ещё' : 'Крутить'}</button>
      ${r ? `<section class="sec">${secH('Промпт', '', '', (profile.niche ? 'уже под ваш блог' : 'впишите блог в «Мой блог», и скобки заполнятся сами'))}
        <div class="copy"><div class="ch"><span>промпт</span><em>куда: чат Claude</em></div><div class="cb">${ph(spinPrompt(r.h, r.f))}</div>
        <div class="cf"><button class="btn white" data-act="spincopy">Скопировать</button></div></div>
        <div class="row2"><a class="btn ghost" href="#/lesson/L07">Урок 7: хуки</a><a class="btn ghost" href="#/lesson/L06">Урок 6: структура</a></div></section>` : ''}
      ${!profile.niche ? `<a class="glass pfcta" href="#/profile"><b>✎</b><span><strong>Мой блог за минуту</strong>4 ответа, и промпт будет сразу про ваш блог</span>${I.arr}</a>` : ''}`;
  }
  function doSpin(btn) {
    if (!HOOKS.length || !FORMATS.length) return;
    const h = HOOKS[Math.floor(Math.random() * HOOKS.length)], f = FORMATS[Math.floor(Math.random() * FORMATS.length)];
    const r1 = $('.reel.r1'), r2 = $('.reel.r2');
    btn.disabled = true;
    let t = 0;
    const steps = 14, tick = () => {
      t++;
      const a = HOOKS[(Math.random() * HOOKS.length) | 0], b = FORMATS[(Math.random() * FORMATS.length) | 0];
      if (t < steps) { $('b', r1).textContent = a[0]; $('span:last-child', r1).textContent = a[1]; if (t < steps - 3) { $('b', r2).textContent = b[0]; $('span:last-child', r2).textContent = b[1]; } r1.classList.toggle('blur', true); r2.classList.toggle('blur', t < steps - 3); haptic.pick(); setTimeout(tick, 40 + t * t * 1.6); }
      else { spinNow = { h, f }; spins++; store.set('spins', spins); haptic.ok(); render(); checkStickers(); }
    };
    tick();
  }

  // УРОК ПО ШАГАМ: как сторис, шаг за шагом. Страница PDF этого шага, промпты к нему, «Сделал, дальше»
  function stepsView(id, k) {
    const l = L(id);
    if (!l || !l.steps.length) return lesson(id);
    const n = l.steps.length, i = Math.max(0, Math.min(k, n));
    const seg = `<div class="stv-bar">${l.steps.map((s, j) => `<i class="${j < i ? 'on' : j === i ? 'now' : ''}"></i>`).join('')}<i class="${i === n ? 'now' : ''}"></i></div>`;
    const head = `<div class="stv-h"><button data-act="go" data-id="#/lesson/${l.id}" aria-label="Закрыть">${I.x}</button><span>урок ${l.n} · ${esc(l.title)}</span></div>`;
    if (i === n) return `<div class="stv">${seg}${head}<div class="stv-card stv-fin"><span class="sticker blue">последний шаг</span><h1>Урок пройден?</h1>
      <p>Отметьте, и он закрасится на маршруте. Файлы и скилл лежат в комментариях под постом урока.</p>
      <button class="btn main wide" data-act="stepsdone" data-id="${l.id}">${done.has(l.id) ? 'Уже отмечен ✓' : 'Да, я прошёл урок'}</button>
      <button class="btn ghost wide" data-act="files" data-id="${l.id}">Файлы урока</button></div>
      <div class="stv-nav"><button class="btn ghost" data-act="step" data-id="${l.id}" data-k="${i - 1}">← Назад</button><a class="btn white" href="#/lesson/${l.id}">К уроку</a></div></div>`;
    const s = l.steps[i], pg = l.pages[s.page];
    const tools = D.tools.filter(t => t.lesson === l.id && t.step === s.n && t.kind !== 'skill');
    if (pg && (readp[l.id] || 0) < s.page + 1) { readp[l.id] = s.page + 1; store.set('read', readp); }
    opened[l.id] = Date.now(); store.set('opened', opened);
    return `<div class="stv">${seg}${head}
      <div class="stv-card"><span class="label">шаг ${s.n} из ${n}</span><h1>${esc(s.title)}</h1>
        ${pg ? `<button class="stv-page" data-act="page" data-id="${l.id}" data-k="${s.page}"><img src="${esc(pg)}" alt="Страница шага ${s.n}"><em>нажмите, чтобы увеличить</em></button>` : ''}
        ${tools.map(t => `<div class="copy stv-copy"><div class="ch"><span>${esc(t.title)}</span><em>${esc(kindOne(t.kind))}</em></div><div class="cb">${t.kind === 'template' ? filledHtml(t) : ph(t.text)}</div><div class="cf"><button class="btn white" data-act="copy" data-id="${esc(t.id)}">Скопировать</button></div></div>`).join('')}
      </div>
      <div class="stv-nav${i ? '' : ' one'}">${i ? `<button class="btn ghost" data-act="step" data-id="${l.id}" data-k="${i - 1}">← Назад</button>` : ''}<button class="btn main" data-act="step" data-id="${l.id}" data-k="${i + 1}">Сделал, дальше →</button></div></div>`;
  }

  // НАКЛЕЙКИ: за дела, а не за заходы. Новая приходит тостом, вся доска в «Моё»
  function STICKERS() {
    const secs = sections(), nd = D.lessons.filter(l => done.has(l.id)).length, sk = streak();
    const short = ['Claude настроен', 'Сценарист', 'Снято и смонтировано', 'Профиль упакован', 'Воронка работает', 'Продаю'];
    return [
      { id: 'copy1', g: '✦', t: 'Первый промпт', h: 'скопируйте любой промпт', ok: copies >= 1 },
      { id: 'copy10', g: '10', t: 'Десять промптов', h: 'скопируйте 10 промптов', ok: copies >= 10 },
      { id: 'save1', g: '★', t: 'В закладках', h: 'сохраните звёздочкой', ok: saved.length >= 1 },
      { id: 'blog', g: '✎', t: 'Мой блог', h: 'ответьте на 4 вопроса', ok: profileDone() },
      { id: 'les1', g: '1', t: 'Первый урок', h: 'пройдите урок', ok: nd >= 1 },
      { id: 'les5', g: '5', t: 'Пять уроков', h: 'пройдите 5 уроков', ok: nd >= 5 },
      { id: 'str3', g: '3д', t: 'Три дня подряд', h: 'заходите 3 дня подряд', ok: sk >= 3 },
      { id: 'str7', g: '7д', t: 'Неделя подряд', h: 'заходите 7 дней подряд', ok: sk >= 7 },
      { id: 'clean', g: '✓', t: 'Без нейрослопа', h: 'проверьте текст, чтобы был чистым', ok: clean >= 1 },
      { id: 'spin', g: '↻', t: 'Что снять', h: 'покрутите барабан', ok: spins >= 1 },
      ...secs.slice(0, 6).map((s, i) => ({ id: 'st' + (i + 1), g: String(i + 1).padStart(2, '0'), t: short[i] || s.title, h: 'пройдите этап ' + (i + 1), ok: s.list.every(l => done.has(l.id)), stage: i })),
      { id: 'all', g: '★★', t: 'Весь маршрут', h: 'пройдите все уроки', ok: D.lessons.every(l => done.has(l.id)) },
    ];
  }
  function checkStickers() {
    const now = STICKERS().filter(x => x.ok).map(x => x.id);
    if (stkSeen === null) { stkSeen = now; store.set('stk', now); return; } // первый запуск: старое не празднуем
    const fresh = now.filter(x => !stkSeen.includes(x));
    if (!fresh.length) return;
    stkSeen = [...stkSeen, ...fresh]; store.set('stk', stkSeen);
    const s = STICKERS().find(x => x.id === fresh[0]);
    if (s.stage !== undefined) stageModal(s.stage); else { haptic.ok(); setTimeout(() => toast('Новая наклейка: ' + s.t + ' ✦', true), 300); }
  }
  function stickerBoard() {
    const all = STICKERS(), got = all.filter(x => x.ok).length;
    return `<section class="sec" id="sec-stk">${secH('Наклейки', '', '', got + ' из ' + all.length + '. Даются за дела: копируете, проходите, проверяете')}
      <div class="stkb glass">${all.map((x, i) => `<div class="stk${x.ok ? ' ok' : ''}${x.stage !== undefined ? ' stg' : ''}" style="--r:${[-6, 4, -3, 5, -5, 3][i % 6]}deg"${x.ok && x.stage !== undefined ? ` data-act="stage" data-id="${x.stage}"` : ''}><b>${esc(x.ok ? x.g : '?')}</b><span>${esc(x.ok ? x.t : x.h)}</span></div>`).join('')}</div></section>`;
  }
  // окно «Этап пройден»: картинка для сторис (assets/story), поделиться или сохранить
  function stageModal(i) {
    closeSheet();
    const secs = sections(), s = secs[i]; if (!s) return;
    const all = D.lessons.every(l => done.has(l.id));
    const img = all ? 'assets/story/finish.jpg' : `assets/story/etap-${i + 1}.jpg`;
    const abs = new URL(img, location.href).href;
    const canStory = tg && tg.shareToStory && tg.isVersionAtLeast && tg.isVersionAtLeast('7.8') && /^https:/.test(abs);
    const el = document.createElement('div');
    el.id = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-act="close"></div><div class="sheet win" role="dialog" aria-label="Этап пройден"><div class="confetti">${Array.from({ length: 18 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k % 6) * .12}s;--c:${['#2f5fe8', '#fff', '#8fb0ff', '#ffb648'][k % 4]}"></i>`).join('')}</div><div class="grip"></div>
      <span class="sticker blue">${all ? 'весь маршрут' : 'этап ' + (i + 1)} пройден ✓</span>
      <h3>${esc(all ? 'Вы прошли все уроки' : s.title)}</h3><p class="note">${esc(s.goal ? 'Теперь ' + s.goal + '.' : '')} Поделитесь в сторис, пусть друзья тоже придут за уроками.</p>
      <img class="win-img" src="${img}" alt="Картинка для сторис">
      <div class="row2">${canStory ? `<button class="btn main" data-act="story" data-id="${esc(abs)}">В сторис</button>` : `<button class="btn main" data-act="saveimg" data-id="${esc(abs)}">Открыть картинку</button>`}<button class="btn ghost" data-act="close">Позже</button></div>
      ${canStory ? '' : '<p class="note">Зажмите картинку, чтобы сохранить, и выложите в сторис со ссылкой на канал.</p>'}</div>`;
    document.body.appendChild(el);
    haptic.ok();
    syncBack();
  }
  function path() {
    const p = D.path;
    if (!p) return `${lock('10K', ['путь', 'к 10 000'], '')}<p class="lead">Цифры появятся после первой выгрузки статистики.</p>`;
    const left = Math.max(0, Math.round((new Date(p.deadline) - new Date()) / 864e5)), need = Math.max(0, p.target - p.followers), perDay = left ? Math.ceil(need / left) : need;
    return `${lock(fmt(p.followers), [word(p.followers, 'подписчик', 'подписчика', 'подписчиков'), 'из ' + fmt(p.target)], 'на ' + dmy(p.updated))}
      <p class="lead">Веду блог в открытую: сколько подписчиков в Instagram, что сработало и что нет. Цель: <b>${fmt(p.target)} к ${dmy(p.deadline)}</b>.</p>
      <div class="glass pathbig"><i class="bar"><i style="width:${Math.max(1.5, p.followers / p.target * 100)}%"></i></i><div class="ticks"><span>0</span><span>2,5K</span><span>5K</span><span>10K</span></div></div>
      <div class="stats"><div class="glass"><b>${fmt(p.best_views)}</b><span>просмотров у лучшего рилса</span></div><div class="glass"><b>${fmt(p.median_views)}</b><span>обычно набирает рилс</span></div>
        <div class="glass"><b>${left}</b><span>${word(left, 'день', 'дня', 'дней')} до цели</span></div><div class="glass"><b>~${perDay}</b><span>новых в день, чтобы успеть</span></div></div>
      <section class="sec">${secH('Кто ведёт канал', '', '')}<div class="plates">${(D.site.about || []).map((t, i) => `<span class="plate" style="--r:${[-1.5, 1, -.6][i % 3]}deg"><i>${i + 1}</i>${esc(t)}</span>`).join('')}</div></section>
      <p class="note">Цифры из Instagram @mrsafalex на ${dmy(p.updated)}.</p>`;
  }

  // ---------- шторка файлов и просмотр PDF ----------
  function sheet(l) {
    closeSheet();
    const files = l.files.length ? l.files : [{ name: l.pdf || 'PDF урока', what: 'шаги с картинками' }];
    const el = document.createElement('div');
    el.id = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-act="close"></div><div class="sheet" role="dialog" aria-label="Файлы урока"><div class="grip"></div>
      <h3>Файлы к уроку ${l.n}</h3><p class="note">Лежат в комментариях под постом урока в канале.</p>
      ${files.map(f => { const ext = (f.name.match(/\.(\w+)$/) || [, /skill|safalex/i.test(f.name) ? 'zip' : 'pdf'])[1]; return `<div class="file"><i>${esc(ext)}</i><div><b>${esc(f.name)}</b><span>${esc(cap(f.what))}</span></div></div>`; }).join('')}
      <button class="btn main wide" data-url="${esc(l.links.comments)}">Открыть пост и комментарии${qtag(l.links.comments)}</button>
      ${/zip|skill/i.test(files.map(f => f.name).join(' ')) ? '<p class="note">Архив со скиллом удобнее скачать на компьютер: там же он и понадобится.</p>' : ''}</div>`;
    document.body.appendChild(el);
    syncBack();
  }
  function closeSheet() { const s = $('#sheet'); if (s) { s.remove(); syncBack(); return true; } return false; }
  function viewer(l, k) {
    closeViewer();
    const el = document.createElement('div');
    el.className = 'viewer'; el.id = 'viewer';
    el.innerHTML = `<div class="vh"><span id="vpos">${k + 1} / ${l.pages.length}</span><span>урок ${l.n}</span><button data-act="vclose">Закрыть</button></div>
      <div class="strip">${l.pages.map((p, i) => `<div><img ${Math.abs(i - k) < 2 ? '' : 'loading="lazy" '}decoding="async" src="${esc(p)}" alt="Страница ${i + 1}"></div>`).join('')}</div>
      <div class="vf"><button class="btn white" data-url="${esc(l.links.comments)}">Скачать PDF</button><button class="btn ghost" data-act="done" data-id="${l.id}">${done.has(l.id) ? 'Пройден ✓' : 'Я прошёл'}</button></div>`;
    document.body.appendChild(el);
    const strip = $('.strip', el);
    strip.scrollLeft = k * strip.clientWidth;
    opened[l.id] = Date.now(); store.set('opened', opened);
    const seen = i => { if ((readp[l.id] || 0) < i + 1) { readp[l.id] = i + 1; store.set('read', readp); } };
    seen(k);
    strip.addEventListener('scroll', () => { const i = Math.round(strip.scrollLeft / strip.clientWidth); $('#vpos').textContent = `${i + 1} / ${l.pages.length}`; seen(i); }, { passive: true });
    syncBack();
  }
  function closeViewer() { const v = $('#viewer'); if (v) { v.remove(); syncBack(); return true; } return false; }

  // ---------- тост, копирование ----------
  let tt;
  function toast(text, blue) {
    const old = $('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (blue ? ' blue' : '');
    el.textContent = text;
    document.body.appendChild(el);
    clearTimeout(tt); tt = setTimeout(() => el.remove(), 2400);
  }
  function copyText(text, msg) {
    const done1 = ok => { if (ok) { haptic.ok(); toast(msg || 'Скопировано ✓'); copies++; store.set('copies', copies); checkStickers(); } else { haptic.warn(); toast('Не скопировалось. Зажмите текст и скопируйте вручную', true); } };
    const fb = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok; };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done1(true), () => done1(fb())); else done1(fb());
  }
  function copy(id) {
    const t = T(id); if (!t) return;
    const text = t.kind === 'template' ? filled(t) : t.text;
    const left = t.kind === 'template' && /\[[^\]]+\]/.test(text);
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok;
    };
    const fin = ok => {
      if (!ok) { haptic.warn(); toast('Не скопировалось. Зажмите текст и скопируйте вручную', true); return; }
      haptic.ok(); toast('Скопировано ✓ ' + (left ? 'Поменяйте [скобки] на своё' : (KINDS[t.kind] || {}).paste || ''));
      recent = [id, ...recent.filter(x => x !== id)].slice(0, 8); store.set('recent', recent);
      copies++; store.set('copies', copies); checkStickers();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => fin(true), () => fin(fallback()));
    else fin(fallback());
  }

  // ---------- роутер ----------
  const TABS = [['', 'Главная', 'home'], ['lessons', 'Уроки', 'lessons'], ['tools', 'Полезное', 'tools'], ['me', 'Моё', 'me']];
  let depth = 0, lastRoute = '', lastWall = '', wallNow = '', lastSeenSet = false;
  let arrival = null; // пришёл из рилса по кодовому слову: на первом экране объясняем, где он
  function arrivalBanner() {
    if (!arrival || location.hash !== arrival.to) return '';
    const what = route().name === 'lesson' ? 'Это урок, который я обещал в рилсе. PDF листается прямо здесь, файлы лежат в комментариях под постом.' : 'Это то, что я обещал в рилсе. Нажмите «Скопировать» и вставьте в Claude.';
    return `<div class="arrive glass"><button class="arr-x" data-act="arrx" aria-label="Скрыть">${I.x}</button><span class="sticker blue">по слову ${esc(arrival.word)}</span>
      <p>${what}</p><p class="note">Это приложение канала Safalex: внизу все уроки по задачам, промпты и ваш прогресс.</p></div>`;
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, ''), [p, qs] = h.split('?');
    const parts = p.split('/').map(decodeURIComponent);
    return { name: parts[0] || '', id: parts[1], k: parts[2], q: new URLSearchParams(qs || '') };
  }
  function render() {
    const r = route(), view = $('#view');
    let html, wall = r.name || 'home', tab = r.name;
    if (r.name === 'lessons') html = lessons(r.q.get('f') || '');
    else if (r.name === 'lesson' || r.name === 'pdf') { const l = L(r.id); if (l) { opened[l.id] = Date.now(); store.set('opened', opened); } html = lesson(r.id); wall = 'lesson:' + r.id; tab = 'lessons'; if (r.name === 'pdf' && l) setTimeout(() => viewer(l, +r.k || 0)); }
    else if (r.name === 'nav') { html = nav(); wall = 'lessons'; tab = 'lessons'; }
    else if (r.name === 'tools') html = tools(r.q.get('k') || '', r.q.get('topic') || '');
    else if (r.name === 'item') { html = item(r.id); wall = 'tools'; tab = 'tools'; }
    else if (r.name === 'words') { html = glossary(); wall = 'tools'; tab = 'tools'; }
    else if (r.name === 'faq') { html = faq(); wall = 'tools'; tab = 'tools'; }
    else if (r.name === 'search') { html = search(r.q.get('q') || ''); tab = ''; }
    else if (r.name === 'path' && D.site.show_goal) { html = path(); tab = 'me'; }
    else if (r.name === 'path') { html = me(); tab = 'me'; wall = 'me'; } // цель 10к пока не показываем
    else if (r.name === 'route') { html = routeMap(); tab = 'me'; wall = 'me'; }
    else if (r.name === 'profile') { html = profileScreen(); tab = 'me'; wall = 'me'; }
    else if (r.name === 'check') { html = checkScreen(); tab = 'tools'; wall = 'tools'; }
    else if (r.name === 'spin') { html = spinScreen(); tab = 'tools'; wall = 'tools'; }
    else if (r.name === 'steps') { html = stepsView(r.id, +r.k || 0); tab = 'lessons'; wall = 'lesson:' + r.id; }
    else if (r.name === 'me') html = me();
    else { html = home(); tab = ''; wall = 'home'; }
    view.innerHTML = `<div class="view">${arrivalBanner()}${html}</div>`;
    document.body.classList.toggle('immersive', r.name === 'steps');
    if (location.hash !== lastRoute) { window.scrollTo(0, 0); lastRoute = location.hash; }
    const t = r.q.get('t');
    if (r.name === 'lessons' && t) { const el = document.getElementById('task-' + t); if (el) el.scrollIntoView({ block: 'start' }); }
    setWall(wall);
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab && (tab !== '' || !r.name)));
    // синяя плашка под активной вкладкой
    const tnav = $('#tabs'), ti = TABS.findIndex(([h]) => h === tab && (tab !== '' || !r.name));
    if (tnav.dataset.i !== String(ti)) { tnav.dataset.i = ti; tnav.classList.toggle('none', ti < 0); if (ti >= 0) tnav.style.setProperty('--i', ti); }
    $('#sbtn').classList.toggle('on', r.name === 'search');
    fitLocks(view); hsInit(view); countUp(view);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { fitLocks(view); $$('.hs-wrap', view).forEach(w => w.firstChild.dispatchEvent(new Event('scroll'))); });
    // «новое в канале» считаем от прошлого визита: отмечаем просмотренным через пару секунд на главной
    if (!r.name && !lastSeenSet) { lastSeenSet = true; const mx = Math.max(0, ...D.lessons.map(postN)); setTimeout(() => { seenPost = mx; store.set('seen', mx); }, 1500); }
    syncBack();
  }
  function syncBack() {
    const nested = route().name !== '' || $('#sheet') || $('#viewer');
    if (tg && tg.BackButton) { try { nested ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) {} }
    $('#back').classList.toggle('on', !!nested && !inTg);
  }
  function goBack() {
    haptic.tap();
    if (closeViewer()) { if (route().name === 'pdf') history.back(); return; }
    if (closeSheet()) return;
    if (depth > 0) { depth--; history.back(); } else location.hash = '#/';
  }
  // стена раздела: в светлой теме светлое жидкое стекло, в тёмной тёмное (Magnific); стены-граффити остались на обложках уроков
  function setWall(key) {
    lastWall = key;
    const [sec, lid] = key.split(':');
    const map = (isDark() ? D.walls_dark : D.walls_light) || {};
    const src = map[lid ? 'lesson' : sec] || map.home || D.walls[sec] || '';
    if (!src || src === wallNow) return;
    wallNow = src;
    const w = $('.wall'), el = document.createElement('i');
    el.style.backgroundImage = `url('${src}')`;
    w.appendChild(el);
    const img = new Image();
    img.onload = img.onerror = () => { requestAnimationFrame(() => el.classList.add('on')); setTimeout(() => $$('i', w).forEach(x => { if (x !== el) x.remove(); }), 700); };
    img.src = src;
  }

  // ---------- события ----------
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && !a.dataset.act) { haptic.tap(); depth++; return; }
    const u = e.target.closest('[data-url]');
    if (u) { open(u.dataset.url); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    const keep = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
    if (act === 'copy') copy(id);
    else if (act === 'save') { const had = isSaved(id); saved = had ? saved.filter(x => x !== id) : [id, ...saved]; store.set('saved', saved); had ? haptic.pick() : haptic.ok(); keep(); toast(had ? 'Убрал из «Моё»' : 'Сохранил в «Моё» ★'); checkStickers(); }
    else if (act === 'done') {
      const had = done.has(id); had ? done.delete(id) : done.add(id); store.set('done', [...done]); had ? haptic.pick() : haptic.ok();
      if ($('#viewer')) b.textContent = had ? 'Я прошёл' : 'Пройден ✓';
      else if ($('#sheet') && route().name === 'route') { keep(); const l = L(id); if (l) stopSheet(l); }
      else keep();
      if (!had) { toast('Урок отмечен ✓'); checkStickers(); }
    }
    else if (act === 'spin') doSpin(b);
    else if (act === 'spincopy' && spinNow) copyText(spinPrompt(spinNow.h, spinNow.f), 'Скопировано ✓ Вставьте в чат Claude');
    else if (act === 'step') { haptic.tap(); history.replaceState(null, '', `#/steps/${id}/${b.dataset.k}`); lastRoute = location.hash; render(); window.scrollTo(0, 0); }
    else if (act === 'stepsdone') { if (!done.has(id)) { done.add(id); store.set('done', [...done]); haptic.ok(); toast('Урок отмечен ✓'); } keep(); checkStickers(); }
    else if (act === 'ckpaste') { try { navigator.clipboard.readText().then(t => { const ta = $('#ck'); ta.value = t; ta.dispatchEvent(new Event('input', { bubbles: true })); }, () => toast('Вставьте текст сами: зажмите поле и «Вставить»', true)); } catch (e) { toast('Вставьте текст сами: зажмите поле и «Вставить»', true); } }
    else if (act === 'ckclear') { const ta = $('#ck'); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); }
    else if (act === 'ckprompt') copyText('Перепиши этот текст моими словами: убери противопоставления «не X, а Y», длинные тире, штампы и громкие слова. Смысл и мои примеры оставь, ничего не добавляй.\n\n' + ($('#ck') ? $('#ck').value : ''), 'Скопировано ✓ Вставьте в чат Claude');
    else if (act === 'stage') stageModal(+id);
    else if (act === 'story') { try { tg.shareToStory(id, { text: 'Прохожу маршрут уроков Safalex: от нуля до продаж', widget_link: { url: (D.site.channel || {}).url, name: 'Уроки Safalex' } }); haptic.ok(); } catch (e) { open(id); } }
    else if (act === 'saveimg') { try { if (tg && tg.downloadFile && tg.isVersionAtLeast('8.0')) { tg.downloadFile({ url: id, file_name: 'safalex-etap.jpg' }); return; } } catch (e) {} open(id); }
    else if (act === 'stop') { const l = L(id); if (l) { stopSheet(l); haptic.tap(); } }
    else if (act === 'files') { const l = L(id); if (l) { closeViewer(); sheet(l); haptic.tap(); } }
    else if (act === 'pdf') { const l = L(id); if (l) { viewer(l, Math.max(0, Math.min((readp[l.id] || 1) - 1, l.pages.length - 1))); haptic.tap(); } }
    else if (act === 'page') { const l = L(id); if (l) { viewer(l, +b.dataset.k); haptic.tap(); } }
    else if (act === 'vclose') { closeViewer(); if (route().name === 'pdf') history.back(); else keep(); haptic.tap(); }
    else if (act === 'close') closeSheet();
    else if (act === 'share') share(id, b.dataset.text, b.dataset.fb);
    else if (act === 'go') { haptic.tap(); depth++; location.hash = id; }
    else if (act === 'onbnext') { const el = $('.onb'), tr = $('.onb-track', el), i = Math.round(tr.scrollLeft / tr.clientWidth); haptic.pick(); if (i < 2) tr.scrollTo({ left: (i + 1) * tr.clientWidth, behavior: 'smooth' }); else onbClose(el._go); }
    else if (act === 'onbskip') onbClose('');
    else if (act === 'hello') onboarding();
    else if (act === 'jump') { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); haptic.pick(); } }
    else if (act === 'lfilter') { haptic.pick(); history.replaceState(null, '', '#/lessons' + (id ? '?f=' + id : '')); lastRoute = location.hash; render(); }
    else if (act === 'topic') { haptic.pick(); const k = b.dataset.k; history.replaceState(null, '', '#/tools' + (k || id ? '?' + [k ? 'k=' + k : '', id ? 'topic=' + id : ''].filter(Boolean).join('&') : '')); lastRoute = location.hash; keep(); }
    else if (act === 'q') { haptic.pick(); history.replaceState(null, '', '#/search?q=' + encodeURIComponent(id)); lastRoute = location.hash; render(); }
    else if (act === 'clear') { history.replaceState(null, '', '#/search'); lastRoute = location.hash; render(); $('#q').focus(); }
    else if (act === 'forget') { words = {}; store.set('words', words); haptic.pick(); keep(); toast('Стёр'); }
    else if (act === 'arrx') { arrival = null; const x = $('.arrive'); if (x) x.remove(); }
    else if (act === 'theme') { const t = isDark() ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem('sfx-theme', t); } catch (e) {} b.innerHTML = t === 'dark' ? I.sun : I.moon; }
  });
  let qt;
  document.addEventListener('input', e => {
    if (e.target.dataset.field) {
      // поля шаблона: текст в плашке обновляется сразу
      words[e.target.dataset.field] = e.target.value; store.set('words', words);
      const t = T(route().id); if (t) $('#cb').innerHTML = filledHtml(t);
      return;
    }
    if (e.target.dataset.pf) {
      profile[e.target.dataset.pf] = e.target.value; store.set('profile', profile);
      const n = tplCovered(), el = $('#pfn'); if (el) { el.textContent = n; el.nextElementSibling.textContent = word(n, 'шаблон', 'шаблона', 'шаблонов') + ' уже с вашими словами'; }
      clearTimeout(qt); qt = setTimeout(checkStickers, 800);
      return;
    }
    if (e.target.id === 'ck') {
      const v = e.target.value; try { localStorage.setItem('sfx-ck', v); } catch (x) {}
      clearTimeout(qt); qt = setTimeout(() => { $('#ckres').innerHTML = slopResult(v); if (v.trim().length >= 200 && !slopFind(v).length && !clean) { clean = 1; store.set('clean', 1); checkStickers(); } }, 250);
      return;
    }
    if (e.target.id !== 'q') return;
    clearTimeout(qt);
    qt = setTimeout(() => {
      const v = e.target.value;
      history.replaceState(null, '', '#/search' + (v ? '?q=' + encodeURIComponent(v) : '')); lastRoute = location.hash;
      $('#results').innerHTML = searchResults(v);
      $('.quick').innerHTML = (v ? [] : QUICK).map(w => `<button data-act="q" data-id="${esc(w)}">${esc(w)}</button>`).join('');
      $('.search .clear').classList.toggle('hide', !v);
      const hint = $('#view .hint'); if (hint) hint.classList.toggle('hide', !!v);
    }, 160);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'q' || e.target.dataset.field)) { const n = e.target.closest('label') && e.target.closest('label').nextElementSibling, inp = n && $('input', n); inp ? inp.focus() : e.target.blur(); }
    if (e.key === 'Escape') closeViewer() || closeSheet();
  });
  let tx = 0, ty = 0;
  document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', e => {
    const r = route(); if (r.name !== 'steps' || $('#viewer') || $('#sheet')) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
    const l = L(r.id); if (!l) return;
    const k = Math.max(0, Math.min(l.steps.length, (+r.k || 0) + (dx < 0 ? 1 : -1)));
    haptic.pick(); history.replaceState(null, '', `#/steps/${l.id}/${k}`); lastRoute = location.hash; render();
  }, { passive: true });
  window.addEventListener('hashchange', () => { closeSheet(); if (route().name !== 'pdf') closeViewer(); render(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => fitLocks($('#view')), 120); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) { wallNow = ''; setWall(lastWall); } }); } catch (e) {}

  // ---------- старт ----------
  // фон живёт: капли и теги плывут при прокрутке, блик на стекле идёт за пальцем
  let sraf = 0;
  addEventListener('scroll', () => { if (!sraf) sraf = requestAnimationFrame(() => { sraf = 0; document.documentElement.style.setProperty('--sy', Math.round(scrollY)); }); }, { passive: true });
  const shine = e => { const g = e.target.closest && e.target.closest('.glass, .irow, .link'); if (!g) return; const b = g.getBoundingClientRect(); g.style.setProperty('--mx', Math.round(e.clientX - b.left) + 'px'); g.style.setProperty('--my', Math.round(e.clientY - b.top) + 'px'); };
  document.addEventListener('pointermove', shine, { passive: true });
  document.addEventListener('pointerdown', shine, { passive: true });
  // листалки: край тает, у карусели точки и стрелки ← →, у чипсов стрелка справа; в первый раз карусель сама чуть сдвигается
  let nudged = {}; try { nudged = JSON.parse(localStorage.getItem('sfx-nudge') || '{}'); } catch (e) {}
  const nudgeIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; const el = e.target, k = el.dataset.hs; nudgeIO.unobserve(el);
    if (nudged[k] || el.scrollLeft > 4 || el.scrollWidth - el.clientWidth < 40) return;
    nudged[k] = 1; try { localStorage.setItem('sfx-nudge', JSON.stringify(nudged)); } catch (x) {}
    setTimeout(() => { el.scrollBy({ left: 80, behavior: 'smooth' }); setTimeout(() => el.scrollBy({ left: -80, behavior: 'smooth' }), 650); }, 500);
  }), { threshold: .7 }) : null;
  // цифры набегают при первом показе экрана за сессию
  const counted = new Set();
  function countUp(root) {
    if (counted.has(location.hash)) return; counted.add(location.hash);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('[data-count]', root).forEach(el => {
      const to = +el.dataset.count, pad = +(el.dataset.pad || 0); if (!to) return;
      const t0 = performance.now(), f = t => { const k = Math.min(1, (t - t0) / 900); el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))).padStart(pad, '0'); if (k < 1) requestAnimationFrame(f); };
      el.textContent = String(0).padStart(pad, '0'); requestAnimationFrame(f);
    });
  }
  // ПЕРВЫЙ ВХОД: три экрана, что тут есть, как учиться и один вопрос про ваш блог
  function onboarding() {
    if ($('.onb')) return;
    const all = order(), total = all.length, nDone = all.filter(l => done.has(l.id)).length;
    const nS = D.tools.filter(t => t.kind === 'skill').length, nP = D.tools.length - nS;
    const el = document.createElement('div'); el.className = 'onb';
    el.innerHTML = `<button class="onb-skip" data-act="onbskip">Пропустить</button>
      <div class="onb-track">
        <section class="onb-s"><div class="onb-hero md"><i></i><img src="assets/me/s.webp" alt="" width="420" height="420"></div>
          <p class="label">приложение канала</p><h1 class="onb-t one"><b>Safalex</b></h1>
          <p class="onb-p">${total} ${word(total, 'урок', 'урока', 'уроков')} по задачам блога, от настройки Claude до первых продаж. А ещё здесь:</p>
          <div class="onb-list">
            <div><img class="ico" src="assets/obj/wand.webp" alt=""><span><b>${nP} ${word(nP, 'промпт и шаблон', 'промпта и шаблона', 'промптов и шаблонов')}</b>копируете кнопкой и вставляете в Claude</span></div>
            <div><img class="ico" src="assets/obj/puzzle.webp" alt=""><span><b>${nS} ${word(nS, 'скилл', 'скилла', 'скиллов')} для Claude</b>готовые инструкции из уроков, Claude работает по ним сам</span></div>
            <div><img class="ico" src="assets/icons/reel.webp" alt=""><span><b>Барабан идей и проверка текста</b>что снять сегодня и где текст выдаёт нейросеть</span></div>
            <div><img class="ico" src="assets/obj/trophy.webp" alt=""><span><b>Маршрут и наклейки</b>видно, что пройдено и что дальше</span></div></div></section>
        <section class="onb-s"><p class="label">как здесь учиться</p><h1 class="onb-t"><b>Три шага</b>на урок</h1>
          <div class="onb-steps">
            <div class="glass"><img class="ico" src="assets/obj/map.webp" alt=""><span><b>Выберите задачу</b>снять ролик, оформить профиль, продать услугу</span></div>
            <div class="glass"><img class="ico" src="assets/obj/stairs.webp" alt=""><span><b>Пройдите по шагам</b>страница урока, промпт, следующий шаг</span></div>
            <div class="glass"><img class="ico" src="assets/obj/copy.webp" alt=""><span><b>Заберите промпт</b>копируется кнопкой, файлы лежат под постом урока</span></div></div></section>
        <section class="onb-s"><div class="onb-hero sm"><i></i><img src="assets/icons/notebook.webp" alt="" width="168" height="168"></div>
          <p class="label">один вопрос</p><h1 class="onb-t"><b>О чём</b>ваш блог?</h1>
          <p class="onb-p">Ответ подставится во все шаблоны, и вы копируете их уже под себя. Видно только вам.</p>
          <label class="onb-in glass"><input data-pf="niche" value="${esc(profile.niche || '')}" placeholder="например: домашняя выпечка" autocomplete="off" enterkeyhint="done"></label></section>
      </div>
      <div class="onb-f"><div class="onb-dots"><i class="on"></i><i></i><i></i></div><button class="btn main" data-act="onbnext">Дальше</button></div>`;
    document.body.appendChild(el); document.body.classList.add('onb-on');
    const tr = $('.onb-track', el), dots = $$('.onb-dots i', el), btn = $('[data-act="onbnext"]', el);
    el._last = 'Приступим!';
    el._go = nDone ? '' : '#/lesson/' + all[0].id;
    tr.addEventListener('scroll', () => { const i = Math.round(tr.scrollLeft / tr.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', j === i)); btn.textContent = i === 2 ? el._last : 'Дальше'; el.dataset.i = i; }, { passive: true });
  }
  function onbClose(go) {
    const el = $('.onb'); if (!el) return;
    store.set('onb', 1); el.classList.add('out'); document.body.classList.remove('onb-on');
    setTimeout(() => el.remove(), 320); if (go) location.hash = go; checkStickers();
  }
  function hsInit(root) {
    $$('.shelf, .pages, .seg, .tasknav', root).forEach(el => {
      if (el.parentNode.classList.contains('hs-wrap')) return;
      const cards = el.matches('.shelf, .pages'), wrap = document.createElement('div');
      wrap.className = 'hs-wrap' + (cards ? ' cards' : ''); el.parentNode.insertBefore(wrap, el); wrap.appendChild(el); el.classList.add('hs'); el.dataset.hs = cards ? 'cards' : 'chips';
      const step = d => el.scrollBy({ left: d * el.clientWidth * .8, behavior: 'smooth' });
      let dots = null, prev = null, next = null;
      if (cards) {
        wrap.insertAdjacentHTML('beforeend', `<div class="hs-ctl"><div class="hs-dots"></div><div class="hs-btns"><button class="hs-b" type="button" aria-label="Назад">${I.left}</button><button class="hs-b" type="button" aria-label="Дальше">${I.right}</button></div></div>`);
        dots = $('.hs-dots', wrap); [prev, next] = $$('.hs-b', wrap); prev.onclick = () => step(-1); next.onclick = () => step(1);
      } else {
        wrap.insertAdjacentHTML('beforeend', `<button class="hs-arrow" type="button" aria-label="Листать дальше">${I.right}</button>`);
        $('.hs-arrow', wrap).onclick = () => step(1);
      }
      const upd = () => {
        const max = el.scrollWidth - el.clientWidth, x = el.scrollLeft;
        wrap.classList.toggle('more-r', x < max - 4); wrap.classList.toggle('more-l', x > 4);
        if (!dots) return;
        const n = max > 4 ? Math.min(8, Math.ceil(el.scrollWidth / el.clientWidth)) : 0;
        if (dots.children.length !== n) dots.innerHTML = '<i></i>'.repeat(n);
        const a = max > 0 ? Math.round(x / max * (n - 1)) : 0; [...dots.children].forEach((d, j) => d.classList.toggle('on', j === a));
        prev.disabled = x <= 4; next.disabled = x >= max - 4; wrap.querySelector('.hs-ctl').classList.toggle('hide', max <= 4);
      };
      let raf = 0; el.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; upd(); }); }, { passive: true });
      upd(); if (el.querySelector('img')) el.querySelectorAll('img').forEach(im => im.complete || im.addEventListener('load', upd, { once: true }));
      if (nudgeIO && cards) nudgeIO.observe(el);
    });
  }
  $('#tabs').innerHTML = TABS.map(([h, t, ic]) => `<a href="#/${h}" data-tab="${h}">${I[ic]}<span>${t}</span></a>`).join('');
  $('#back').innerHTML = I.back;
  $('#back').addEventListener('click', goBack);
  $('#sbtn').innerHTML = I.search;
  let theme0 = null; try { theme0 = localStorage.getItem('sfx-theme'); } catch (e) {}
  if (inTg) setTheme(tg.colorScheme === 'light' ? 'light' : 'dark'); else if (theme0) setTheme(theme0);
  if (!inTg) $('#prev').innerHTML = `<button class="tbtn" data-act="theme" aria-label="Сменить тему">${isDark() ? I.sun : I.moon}</button>`;
  // кодовое слово из рилса или номер урока: t.me/<бот>/<апп>?startapp=montazh, вне Telegram …#montazh или #l12
  function resolveStart(sp) {
    const v = String(sp).toLowerCase();
    const code = (D.site.codes || []).find(c => c.param === v || normz(c.word) === normz(sp));
    if (code) { if (!code.to) return ''; arrival = { word: code.word, to: '#/' + code.to }; return '#/' + code.to; }
    const m = v.match(/^l(\d+)$/);
    if (m) { const id = 'L' + m[1].padStart(2, '0'); return L(id) ? '#/lesson/' + id : ''; }
    if (/^item-/.test(v)) return '#/item/' + encodeURIComponent(sp.slice(5));
    if (/^(tools|lessons|search|me|words|faq|nav|path|route|profile|check|spin)$/.test(v)) return '#/' + v;
    return '';
  }
  let startHash = '';
  if (tg) {
    try {
      tg.ready(); tg.expand();
      tg.BackButton.onClick(goBack);
      tg.onEvent('themeChanged', () => setTheme(tg.colorScheme === 'light' ? 'light' : 'dark'));
      tg.disableVerticalSwipes && tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes();
    } catch (e) {}
    const sp = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (sp) startHash = resolveStart(sp);
  }
  if (!startHash && /^#[A-Za-z0-9_-]+$/.test(location.hash) && !/^#tgWebApp/.test(location.hash)) startHash = resolveStart(location.hash.slice(1)) || '#/';
  if (/^#tgWebApp/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + (startHash || '#/'));
  else if (!/^#\//.test(location.hash) || location.hash === '#/') { if (startHash || location.hash) history.replaceState(null, '', location.pathname + location.search + (startHash || '#/')); }
  loadCloud();
  render();
  checkStickers();
  if (!startHash && !store.get('onb', 0)) onboarding();
})();
