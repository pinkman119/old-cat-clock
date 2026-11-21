(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s) };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)) };
  var api = window.desktopApi;
  var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* 国务院办公厅《2026年部分节假日安排》国办发明电〔2025〕7号（与 @maomao/shared 保持一致） */
  var HOLIDAYS_2026 = [
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
  ];
  var MAKEUP_2026 = ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'];

  var POEM_FALLBACK = [
    { t: '静夜思', a: '李白 · 唐', c: ['床前明月光，疑是地上霜。', '举头望明月，低头思故乡。'] },
    { t: '春晓', a: '孟浩然 · 唐', c: ['春眠不觉晓，处处闻啼鸟。', '夜来风雨声，花落知多少。'] },
    { t: '登鹳雀楼', a: '王之涣 · 唐', c: ['白日依山尽，黄河入海流。', '欲穷千里目，更上一层楼。'] },
    { t: '相思', a: '王维 · 唐', c: ['红豆生南国，春来发几枝。', '愿君多采撷，此物最相思。'] },
    { t: '赠汪伦', a: '李白 · 唐', c: ['李白乘舟将欲行，忽闻岸上踏歌声。', '桃花潭水深千尺，不及汪伦送我情。'] }
  ];
  var SAYING_FALLBACK = [
    '就算如此，我也要去。就算全部的棋子被夺走，棋盘上只剩下了王，也绝对不会投降。',
    '今天的我，是昨天的我从未想象过的我，明天的我也许会忘记今天的我。',
    '书上说好奇心害死猫，但猫有九条命，所以它其实什么都不怕。',
    '我决定从今天开始早睡，这个决定我已经坚持取消了三年。',
    '月亮不睡我不睡，我是秃头小宝贝。',
    '如果生活欺骗了你，不要悲伤，不要心急，反正明天也一样。'
  ];

  /* ===== 核心状态（全部数据来自服务器，本地只做实时计算） ===== */
  var cfg = null;            // WorkConfig
  var user = null;           // PublicUser
  var todayRecord = null;    // WorkDayRecord（当日打卡 + 加班）
  var todos = [];            // 当前选中日期的待办
  var todoRung = {};         // id -> 本会话已提醒标记
  var todoDate = null;       // 待办页当前选中日期
  var noteEditDate = null;
  var calendarCache = {};    // 'YYYY-MM' -> SalaryMonthSummary
  var calY = 0, calM = 0, selectedKey = null;
  var toastTimer = null;
  var nextRemind = 0;
  var promptKey = '';        // 当日下班询问已弹（内存）
  var otArmedAt = {}, otCelebratedKey = ''; // 加班庆祝用（内存）
  var loveText = '正在向你走来…';
  var loveHour = -1;
  var booted = false;
  var saveTimer = null;
  var tickTimer = null;
  var mode = 'full';

  /* ===== 工具函数 ===== */
  function pad(n) { return n < 10 ? '0' + n : '' + n }
  function money(n) { return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
  function timeToMin(t) { var p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0) }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  function dateKeyAdd(k, delta) { var p = k.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + delta); return keyOf(d) }
  function minToTime(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60) }
  function fmtHM(min) { var m = Math.max(0, Math.round(min)); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm' }
  function fmtDuration(min) { var sec = Math.max(0, Math.floor(min * 60)); return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec % 3600 / 60)) + ':' + pad(sec % 60) }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function numOf(s) { return parseFloat(String(s == null ? '' : s).replace(/,/g, '')) || 0 }
  function nowDate() { return new Date() } // 只跟真实时间，无演示逻辑

  function isHoliday(date) {
    if (!cfg || !cfg.excludeHolidays) return false;
    var k = keyOf(date);
    return HOLIDAYS_2026.indexOf(k) >= 0 || (cfg.customHolidays || []).indexOf(k) >= 0;
  }
  function isMakeup(date) {
    return !!(cfg && cfg.excludeHolidays && MAKEUP_2026.indexOf(keyOf(date)) >= 0 && !isHoliday(date));
  }
  function isWorkDay(date) {
    if (isHoliday(date)) return false;
    if (isMakeup(date)) return true;
    var dow = date.getDay();
    return dow !== 0 && dow !== 6;
  }
  function dailySalary() { return cfg.monthly / Math.max(1, cfg.workDays) }
  function otPayOf(end) {
    var pay = 0;
    (cfg.tiers || []).forEach(function (t) { if (timeToMin(end) >= timeToMin(t.time)) pay = Math.max(pay, +t.pay || 0) });
    return pay;
  }
  function workState(now) {
    var cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var s = timeToMin(cfg.workStart), e = timeToMin(cfg.workEnd), ls = timeToMin(cfg.lunchStart), le = timeToMin(cfg.lunchEnd);
    var rest = Math.max(0, le - ls), total = Math.max(1, e - s - rest), worked = 0;
    if (cur >= e) worked = total;
    else if (cur > s) { worked = cur - s; if (cur > le) worked -= rest; else if (cur > ls) worked -= (cur - ls) }
    worked = Math.max(0, Math.min(total, worked));
    var status = cur >= e ? '已下班' : (cur >= ls && cur < le ? '休息中' : (cur >= s ? '正在蓄重' : '尚未上班'));
    return { eMin: e, total: total, worked: worked, status: status, cur: cur };
  }
  function lifeState(now) {
    var cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var s = timeToMin(cfg.workStart), e = timeToMin(cfg.workEnd), ls = timeToMin(cfg.lunchStart), le = timeToMin(cfg.lunchEnd), ot = timeToMin(cfg.otStart);
    if (isHoliday(now)) return { key: 'rest', label: '节假日', desc: '今天不上班 · 好好陪陪她' };
    if (ot > 0 && cur >= ot) return { key: 'hustle', label: '奋斗中', desc: minToTime(ot) + ' 起加班 · 每一分钟都在增值' };
    if (cur >= ls && cur < le) return { key: 'rest', label: '休息中', desc: cfg.lunchStart + '–' + cfg.lunchEnd + ' 午休 · 伸个懒腰吧' };
    if (cur >= s && cur < e) return { key: 'work', label: '工作中', desc: cfg.workStart + '–' + cfg.workEnd + ' · 认真搬砖中' };
    if (cur >= e) return { key: 'rest', label: '已下班', desc: '今天辛苦啦 · 该好好休息了' };
    return { key: 'rest', label: '未上班', desc: cfg.workStart + ' 打卡 · 养足精神再出发' };
  }

  /* ===== toast / 系统通知 ===== */
  function toastMsg(t) {
    var el = $('#toastText'); if (el) el.textContent = t;
    var box = $('#toast');
    if (box) { box.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { box.classList.remove('show') }, 4200) }
  }
  function notifyApp(title, body) { if (api && api.notify) api.notify(title, body).catch(function () { }) }

  /* ===== 情话：服务器按小时确定性下发，跨小时自动刷新 ===== */
  function renderLove() {
    var el = $('#catLove');
    if (el.textContent !== loveText) { el.textContent = loveText; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap') }
    var h = new Date().getHours() + 1;
    $('#catNext').textContent = '下次更新 ' + (h === 24 ? '00' : pad(h)) + ':00';
  }
  async function loadLoveNote() {
    var hour = new Date().getHours();
    try {
      var r = await api.getLoveNote();
      if (r && r.content) loveText = r.content;
    } catch (e) { /* 网络异常时保留上一句 */ }
    loveHour = hour;
    renderLove();
  }

  /* ===== 电子计数器：按位翻滚 ===== */
  function buildRoll(host, str) {
    host.innerHTML = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (/\d/.test(ch)) {
        var slot = document.createElement('span'); slot.className = 'roll-slot';
        var col = document.createElement('span'); col.className = 'roll-col';
        for (var n = 0; n < 20; n++) { var d = document.createElement('span'); d.className = 'roll-d'; d.textContent = n % 10; col.appendChild(d) }
        slot.appendChild(col); host.appendChild(slot);
        var dig = +ch; col.style.transition = 'none'; col.style.transform = 'translateY(-' + (dig * 1.12) + 'em)';
        col.dataset.dig = dig; col.dataset.pos = dig;
      } else {
        var st = document.createElement('span'); st.className = 'roll-static'; st.textContent = ch; host.appendChild(st);
      }
    }
    host.dataset.sig = str.replace(/\d/g, 'd');
    void host.offsetWidth;
    Array.prototype.forEach.call(host.querySelectorAll('.roll-col'), function (c) { c.style.transition = '' });
  }
  function setRollingNumber(host, str) {
    if (host.dataset.sig !== str.replace(/\d/g, 'd')) { buildRoll(host, str); return }
    for (var i = 0; i < str.length; i++) {
      var ch = str[i]; if (!/\d/.test(ch)) continue;
      var col = host.children[i].firstElementChild;
      var prev = +col.dataset.dig, next = +ch; if (next === prev) continue;
      var pos = +col.dataset.pos + (next - prev + 10) % 10;
      col.style.transform = 'translateY(-' + (pos * 1.12) + 'em)';
      col.dataset.dig = next; col.dataset.pos = pos;
      (function (c) {
        clearTimeout(c._t); c._t = setTimeout(function () {
          var p = +c.dataset.pos;
          if (p >= 10) { c.style.transition = 'none'; c.style.transform = 'translateY(-' + ((p - 10) * 1.12) + 'em)'; c.dataset.pos = p - 10; void c.offsetWidth; c.style.transition = '' }
        }, 570);
      })(col);
    }
  }
  function pulseGain(box, delta, fxId) {
    if (!box || !(delta > 0)) return;
    var stamp = '_lastGain_' + (fxId || 'main');
    if (Date.now() - (box[stamp] || 0) < 1200) return;
    box[stamp] = Date.now();
    box.classList.remove('gain-pulse'); void box.offsetWidth; box.classList.add('gain-pulse');
    spawnGain(delta, fxId);
  }
  function spawnGain(delta, fxId) {
    var fx = $(fxId || '#gainFx'); if (!fx) return;
    var ring = document.createElement('span'); ring.className = 'gain-ring';
    ring.style.setProperty('--x', (50 + Math.random() * 8) + '%');
    fx.appendChild(ring);
    setTimeout(function () { if (ring.parentNode) fx.removeChild(ring) }, 820);
    var pop = document.createElement('span'); pop.className = 'gain-pop';
    pop.textContent = '+¥' + money(delta);
    pop.style.setProperty('--x', (54 + Math.random() * 10) + '%');
    pop.style.setProperty('--y', (10 + Math.random() * 10) + '%');
    fx.appendChild(pop);
    setTimeout(function () { if (pop.parentNode) fx.removeChild(pop) }, 1200);
    var n = 6 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); s.className = 'gain-spark';
      s.style.left = (52 + Math.random() * 12) + '%';
      s.style.top = (40 + Math.random() * 14) + '%';
      var dx = (Math.random() * 2 - 1) * 48, dy = -(24 + Math.random() * 46);
      s.style.setProperty('--dx', dx.toFixed(1) + 'px');
      s.style.setProperty('--dy', dy.toFixed(1) + 'px');
      s.style.setProperty('--mx', (dx * .25).toFixed(1) + 'px');
      s.style.setProperty('--my', (dy * .25).toFixed(1) + 'px');
      s.style.setProperty('--dur', (0.72 + Math.random() * 0.38).toFixed(2) + 's');
      if (i % 3 === 0) s.style.background = '#eaf5b8';
      fx.appendChild(s);
      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 1250) })(s);
    }
  }

  /* ===== 时钟页渲染 ===== */
  function renderPhaseTimeline(now, w) {
    var s = timeToMin(cfg.workStart), e = timeToMin(cfg.workEnd), ls = timeToMin(cfg.lunchStart), le = timeToMin(cfg.lunchEnd);
    var dur = Math.max(1, e - s);
    var w1 = Math.max(0, ls - s), wl = Math.max(0, le - ls), w2 = Math.max(0, e - le);
    $('#tlSegWork1').style.flex = w1 + ' 1 0px'; $('#tlSegLunch').style.flex = wl + ' 1 0px'; $('#tlSegWork2').style.flex = w2 + ' 1 0px';
    var cur = w.cur;
    $('#tlSegWork1').classList.toggle('done', cur >= s);
    $('#tlSegLunch').classList.toggle('done', cur >= ls);
    $('#tlSegWork2').classList.toggle('done', cur >= le);
    var pos = Math.max(0, Math.min(dur, cur - s)) / dur * 100;
    $('#tlNow').style.left = pos.toFixed(2) + '%';
    $('#tlNow').style.display = (cur < s || cur > e) ? 'none' : 'block';
    $('#tlTimeStart').textContent = cfg.workStart;
    $('#tlTimeLunchS').textContent = cfg.lunchStart;
    $('#tlTimeLunchE').textContent = cfg.lunchEnd;
    $('#tlTimeEnd').textContent = cfg.workEnd;
    $('#tlTimeStart').style.left = '0%'; $('#tlTimeStart').style.transform = 'none';
    $('#tlTimeLunchS').style.left = (w1 / dur * 100).toFixed(2) + '%'; $('#tlTimeLunchS').style.transform = 'translateX(-50%)';
    $('#tlTimeLunchE').style.left = ((w1 + wl) / dur * 100).toFixed(2) + '%'; $('#tlTimeLunchE').style.transform = 'translateX(-50%)';
    $('#tlTimeEnd').style.left = '100%'; $('#tlTimeEnd').style.transform = 'translateX(-100%)';
  }
  function renderOtProgress(w) {
    var rec = todayRecord, box = $('#otProgress');
    if (!rec || !rec.overtime) { box.hidden = true; return }
    var otMin = Math.max(0, timeToMin(rec.otEnd || '20:40') - timeToMin(rec.otStart || cfg.otStart));
    if (!(w.total > 0) || !(otMin > 0)) { box.hidden = true; return }
    box.hidden = false;
    var pct = 100 + (otMin / w.total) * 100;
    var maxPct = Math.max(120, Math.ceil(pct / 10) * 10);
    $('#otPct').textContent = pct.toFixed(1) + '%';
    $('#otMinText').textContent = fmtHM(otMin);
    $('#otFill').style.width = Math.min(100, pct / maxPct * 100).toFixed(2) + '%';
    $('#otMark').style.left = (100 / maxPct * 100).toFixed(2) + '%';
  }
  function renderClock() {
    if (!cfg || !booted) return;
    var now = nowDate(), w = workState(now), daily = dailySalary(), hol = isHoliday(now), mk = isMakeup(now);
    var earned = hol ? 0 : daily * w.worked / w.total, pct = hol ? 0 : w.worked / w.total;
    $('#dateText').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + week[now.getDay()] + (mk ? ' · 调休上班' : '');
    var st = lifeState(now);
    $('#statusText').textContent = st.label;
    $('#statusPill').setAttribute('data-state', st.key);
    var cat = $('#catCard');
    if (cat.getAttribute('data-state') !== st.key) cat.setAttribute('data-state', st.key);
    if (new Date().getHours() !== loveHour) loadLoveNote();
    var en = $('#earnedNum'), ms = money(earned);
    if (en.dataset.val !== ms) {
      var hasPrev = en.dataset.val !== undefined && en.dataset.val !== '';
      var prev = hasPrev ? numOf(en.dataset.val) : numOf(ms);
      var next = numOf(ms);
      setRollingNumber(en, ms); en.dataset.val = ms;
      pulseGain($('#earnAmount'), hasPrev && next > prev ? next - prev : 0);
    }
    $('#hourlyNum').textContent = 'CNY ' + money(daily / (w.total / 60));
    $('#targetNum').textContent = money(daily);
    $('#workRangeText').textContent = cfg.workStart + ' —— ' + cfg.workEnd;
    var pp = (pct * 100).toFixed(1) + '%'; $('#progressPct').textContent = pp;
    var pw = (pct * 100).toFixed(2) + '%';
    var pf = $('#progressFill'), ph = $('#progressHead');
    pf.style.width = pw; ph.style.left = pw; $('#compactFill').style.width = pw;
    var fillDur = (0.9 - pct * 0.55).toFixed(2);
    pf.style.setProperty('--fill-dur', fillDur + 's');
    pf.style.setProperty('--shimmer-dur', (2.3 - pct * 1.45).toFixed(2) + 's');
    ph.style.setProperty('--fill-dur', fillDur + 's');
    ph.style.setProperty('--shake-dur', (0.24 - pct * 0.14).toFixed(3) + 's');
    ph.style.setProperty('--shake-amp', (0.6 + pct * 2.6).toFixed(2) + 'px');
    ph.style.setProperty('--trail-op', (0.12 + pct * 0.78).toFixed(2));
    $('#compactPct').textContent = Math.round(pct * 100) + '%';
    var ce = $('#compactEarn');
    if (ce.dataset.val !== ms) {
      var cHas = ce.dataset.val !== undefined && ce.dataset.val !== '';
      var cPrev = cHas ? numOf(ce.dataset.val) : numOf(ms), cNext = numOf(ms);
      setRollingNumber(ce, ms); ce.dataset.val = ms;
      pulseGain($('#compactEarnBox'), cHas && cNext > cPrev ? cNext - cPrev : 0, '#compactGainFx');
    }
    renderPhaseTimeline(now, w);
    renderOtProgress(w);
    var recNow = todayRecord, otEndMin = (recNow && recNow.overtime && recNow.otEnd) ? timeToMin(recNow.otEnd) : 0;
    var cdMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var cdHTML;
    if (hol) cdHTML = '<small>今日</small> 不上班';
    else if (otEndMin && cdMin < otEndMin) cdHTML = '<small>距加班结束</small> ' + fmtDuration(otEndMin - cdMin);
    else if (otEndMin && cdMin >= otEndMin) cdHTML = '<small>今日</small> 加班完成';
    else if (w.cur >= w.eMin) cdHTML = '<small>今日</small> 已下班';
    else cdHTML = fmtDuration(w.eMin - w.cur);
    $('#countdown').innerHTML = cdHTML;
    $('#compactCountdown').innerHTML = cdHTML;
    if (Date.now() >= nextRemind) { nextRemind = Date.now() + cfg.remindMin * 60000; fire() }
    checkAutoOff();
    checkOtEnd();
    checkTodoRings();
  }
  function fire() {
    $('#toastText').textContent = loveText;
    var t = $('#toast'); t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show') }, 5600);
  }

  /* ===== 下班询问 / 加班记录（写入服务器） ===== */
  function openOffDialog(mode) {
    mode = (mode === 'setup') ? 'setup' : 'ask';
    var md = $('#offMask .modal');
    $('#offEnd').value = (todayRecord && todayRecord.otEnd) || '20:40';
    md.setAttribute('data-mode', mode);
    $('#offMark').textContent = mode === 'ask' ? '🎉' : '⏰';
    $('#offTitle').textContent = mode === 'ask' ? '下班时间到！' : '提前设置加班';
    $('#offSub').innerHTML = mode === 'ask'
      ? '今天辛苦啦，先好好歇一会儿。<br>想再加会儿班吗？加班费会按梯度自动结算。'
      : '还没到下班时间？先把加班安排好，<br>到点后加班费会按梯度自动结算。';
    $('#offPanel').hidden = (mode !== 'setup');
    $('#offMask').classList.add('show');
    updateOffPreview();
    if (mode === 'ask') celebrate();
  }
  function updateOffPreview() {
    if (!cfg) return;
    var pay = otPayOf($('#offEnd').value);
    $('#offPay').textContent = '¥' + pay;
    $('#offTotal').textContent = '¥' + Math.round(dailySalary() + pay);
  }
  function checkAutoOff() {
    if (!cfg) return;
    var now = new Date(), k = keyOf(now);
    if (now.getHours() * 60 + now.getMinutes() >= timeToMin(cfg.workEnd) && promptKey !== k) {
      promptKey = k;
      openOffDialog('ask');
    }
  }
  function checkOtEnd() {
    if (!cfg || !todayRecord) return;
    var now = new Date(), k = keyOf(now);
    if (!todayRecord.overtime || !todayRecord.otEnd || otCelebratedKey === k) return;
    if (otArmedAt[k] && Date.now() - otArmedAt[k] < 3000) return; // 刚记下来先给用户看进度
    if (now.getHours() * 60 + now.getMinutes() < timeToMin(todayRecord.otEnd)) return;
    otCelebratedKey = k;
    finale('ot');
  }
  async function confirmOvertime() {
    var end = $('#offEnd').value, k = keyOf(new Date());
    if (!end) return;
    $('#offMask').classList.remove('show');
    try {
      todayRecord = await api.setOvertime(end);
      otArmedAt[k] = Date.now();
      calendarCache = {};
      renderClock();
      if (!$('#pageCalendar').hidden) renderCalendar();
      toastMsg('记下啦，加班到 ' + end + '，加班进度已开启，到点再为你撒花～');
    } catch (e) { toastMsg('加班设置失败：' + e.message) }
  }

  /* ===== 撒花庆祝 ===== */
  var confettiRaf = null, finaleRaf = null;
  function sizeConfetti() { var c = $('#confettiCanvas'); if (c) { c.width = window.innerWidth; c.height = window.innerHeight } }
  function celebrate() {
    var c = $('#confettiCanvas'); if (!c) return; sizeConfetti();
    closeFinale();
    var ctx = c.getContext('2d'), W = c.width, H = c.height;
    var colors = ['#d3e489', '#b9cd80', '#e7c98a', '#e6a58a', '#9fc7d4', '#f2f6ea', '#c8dfa0'];
    var ps = [], n = Math.min(190, Math.max(90, Math.round(W * H / 6500)));
    for (var i = 0; i < n; i++) {
      var fromTop = Math.random() < .72;
      ps.push({
        x: Math.random() * W,
        y: fromTop ? -20 - Math.random() * H * .5 : (H * .32 + Math.random() * H * .3),
        w: 5 + Math.random() * 7, h: 8 + Math.random() * 9,
        c: colors[Math.floor(Math.random() * colors.length)],
        vx: -1.1 + Math.random() * 2.2,
        vy: fromTop ? 1.6 + Math.random() * 2.8 : -(2.5 + Math.random() * 3.4),
        rot: Math.random() * 6.28, vr: -.14 + Math.random() * .28,
        sway: Math.random() * 6.28, sv: .02 + Math.random() * .05,
        shape: Math.random() < .32 ? 'circle' : 'rect',
        life: 0, max: 190 + Math.random() * 90
      });
    }
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    var start = performance.now();
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      var alive = false, dt = Math.min(2, (t - (frame.prev || t)) / 16); frame.prev = t;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i]; p.life += dt; if (p.life > p.max) continue;
        p.vy += .045 * dt; p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.sway) * .7) * dt; p.sway += p.sv * dt; p.rot += p.vr * dt;
        if (p.y > H + 40) continue;
        alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = .92; ctx.fillStyle = p.c;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.283); ctx.fill() }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive && t - start < 6200) confettiRaf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); confettiRaf = null }
    }
    confettiRaf = requestAnimationFrame(frame);
  }
  var FINALE_TEXT = {
    off: { emoji: '🎉', big: '正式下班啦！', sub: '今天圆满收工' },
    ot: { emoji: '💪', big: '加班也拿下！', sub: '又多赚了一笔，记得早点休息' }
  };
  function finale(type) {
    var c = $('#confettiCanvas'); if (!c) return; sizeConfetti();
    if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null }
    if (finaleRaf) { cancelAnimationFrame(finaleRaf); finaleRaf = null }
    var t = FINALE_TEXT[type] || FINALE_TEXT.off;
    $('#fbEmoji').textContent = t.emoji; $('#fbBig').textContent = t.big; $('#fbSub').textContent = t.sub;
    var b = $('#finaleBanner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    var ctx = c.getContext('2d'), W = c.width, H = c.height;
    var colors = ['#d3e489', '#b9cd80', '#e7c98a', '#e6a58a', '#9fc7d4', '#f2f6ea', '#c8dfa0', '#f0d7a6'];
    var ps = [], n = Math.min(300, Math.max(150, Math.round(W * H / 4200)));
    function seed(p) {
      var m2 = Math.random(), x, y, vx, vy;
      if (m2 < .5) { x = Math.random() * W; y = -24 - Math.random() * H * .45; vx = -1.3 + Math.random() * 2.6; vy = 1.8 + Math.random() * 3.2 }
      else if (m2 < .75) { x = -24; y = H * .62 + Math.random() * H * .2; vx = 3.4 + Math.random() * 4.8; vy = -(3 + Math.random() * 4.4) }
      else { x = W + 24; y = H * .62 + Math.random() * H * .2; vx = -(3.4 + Math.random() * 4.8); vy = -(3 + Math.random() * 4.4) }
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0;
    }
    for (var i = 0; i < n; i++) {
      var p = {
        w: 5 + Math.random() * 8, h: 8 + Math.random() * 10,
        c: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 6.28, vr: -.18 + Math.random() * .36,
        sway: Math.random() * 6.28, sv: .02 + Math.random() * .06,
        shape: Math.random() < .34 ? 'circle' : 'rect', max: 250 + Math.random() * 130, life: 0
      };
      seed(p); ps.push(p);
    }
    function frame(now) {
      ctx.clearRect(0, 0, W, H);
      var dt = Math.min(2, (now - (frame.prev || now)) / 16); frame.prev = now;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i]; p.life += dt;
        if (p.life > p.max || p.y > H + 60 || p.x < -60 || p.x > W + 60) seed(p);
        p.vy += .055 * dt; p.x += (p.vx + Math.sin(p.sway) * .9) * dt; p.y += p.vy * dt; p.sway += p.sv * dt; p.rot += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = .96; ctx.fillStyle = p.c;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.283); ctx.fill() }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      finaleRaf = requestAnimationFrame(frame);
    }
    finaleRaf = requestAnimationFrame(frame);
  }
  function closeFinale() {
    var b = $('#finaleBanner'); if (b) b.classList.remove('show');
    if (finaleRaf) { cancelAnimationFrame(finaleRaf); finaleRaf = null }
    var c = $('#confettiCanvas'); if (c) { var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height) }
  }

  /* ===== 待办（服务器存储） ===== */
  async function fetchTodos() {
    try { todos = await api.listTodos(todoDate) } catch (e) { toastMsg('待办加载失败：' + e.message) }
    renderTodos();
  }
  function syncTodoDateBar() {
    var today = keyOf(new Date()), p = todoDate.split('-');
    var md = (+p[1]) + '月' + (+p[2]) + '日';
    var rel = todoDate === today ? '今天' : (todoDate === dateKeyAdd(today, 1) ? '明天' : (todoDate === dateKeyAdd(today, -1) ? '昨天' : null));
    var label = rel ? (rel + ' · ' + md) : (md + ' ' + week[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]);
    $('#tpDateLabel').textContent = label;
    $('#tpDatePick').value = todoDate;
    $('#tpToday').hidden = todoDate === today;
  }
  function renderTodos() {
    if (!todoDate) return;
    var list = $('#tpList');
    syncTodoDateBar();
    var day = todos.slice().sort(function (a, b) { return timeToMin(a.remindAt) - timeToMin(b.remindAt) });
    var doneCount = day.filter(function (t) { return t.done }).length;
    $('#tpCount').innerHTML = '<b>' + doneCount + '</b> / ' + day.length + ' 完成';
    $('#tpClear').disabled = doneCount === 0;
    if (!day.length) {
      list.innerHTML = '<div class="tp-empty"><span class="tp-empty-ico">✎</span>这天还没有安排<br>写下第一件要做的事，加上时间吧</div>';
      return;
    }
    list.innerHTML = day.map(function (t) {
      return '<div class="tp-item' + (t.done ? ' done' : '') + (todoRung[t.id] ? ' ringing' : '') + '" data-id="' + t.id + '">' +
        '<div class="tp-row"><span class="tp-time-label">' + escHtml(t.remindAt) + '</span><span class="tp-text">' + escHtml(t.text) + '</span></div>' +
        '<div class="tp-actions">' +
          '<button class="tp-check" data-todo-check="' + t.id + '" title="' + (t.done ? '标为未完成' : '标记完成') + '" aria-label="' + (t.done ? '标为未完成' : '标记完成') + '">' + (t.done ? '↺' : '✓') + '</button>' +
          '<button class="tp-del" data-todo-del="' + t.id + '" title="删除" aria-label="删除">×</button>' +
        '</div></div>';
    }).join('');
  }
  async function addTodo(text, time) {
    text = String(text || '').trim(); if (!text) return false;
    if (!/^\d{1,2}:\d{2}$/.test(time)) time = pad(new Date().getHours()) + ':' + pad(new Date().getMinutes());
    try {
      await api.createTodo(text, time, todoDate);
      await fetchTodos();
      return true;
    } catch (e) { toastMsg('待办保存失败：' + e.message); return false }
  }
  function checkTodoRings() {
    if (!todos.length) return;
    var now = new Date(), cur = now.getHours() * 60 + now.getMinutes(), today = keyOf(now);
    var changed = false;
    todos.forEach(function (t) {
      if (t.done || t.date !== today || todoRung[t.id]) return;
      if (cur >= timeToMin(t.remindAt)) {
        todoRung[t.id] = true; changed = true;
        toastMsg('⏰ 该做「' + t.text + '」啦（' + t.remindAt + '），加油～');
        notifyApp('耄猫时钟 · 待办提醒', '该做「' + t.text + '」啦（' + t.remindAt + '）');
      }
    });
    if (changed) renderTodos();
  }

  /* ===== 每日小记（服务器存储） ===== */
  function setNotePreview(txt) {
    var el = $('#notePreview');
    el.textContent = txt ? txt.trim() : '记录此刻的心情与感悟…';
    el.classList.toggle('empty', !txt);
  }
  async function loadNotePreview() {
    try { var n = await api.getNote(keyOf(new Date())); setNotePreview(n && n.content || '') } catch (e) { setNotePreview('') }
  }
  async function openNoteEditor(k) {
    noteEditDate = k || keyOf(new Date());
    var p = noteEditDate.split('-');
    $('#noteModalDate').textContent = (+p[1]) + '月' + (+p[2]) + '日 · 记下此刻的心情与感悟';
    var v = '';
    try { var n = await api.getNote(noteEditDate); v = (n && n.content) || '' } catch (e) { }
    $('#noteArea').value = v;
    $('#noteCharCount').textContent = v.length + ' / 500';
    $('#noteDelete').hidden = !v;
    $('#noteMask').classList.add('show');
    setTimeout(function () { try { $('#noteArea').focus() } catch (e) { } }, 150);
  }
  function closeNoteEditor() { $('#noteMask').classList.remove('show') }
  async function saveNote() {
    var v = $('#noteArea').value.replace(/\s+$/, '');
    try { await api.saveNote(noteEditDate, v) } catch (e) { toastMsg('小记保存失败：' + e.message); return }
    closeNoteEditor();
    if (noteEditDate === keyOf(new Date())) setNotePreview(v);
    if (!$('#calDetailView').hidden && selectedKey === noteEditDate) renderDayExtras(selectedKey);
    toastMsg(v ? '✓ 感悟已记下，日历里也能看到啦' : '✓ 已删除这天的小记');
  }

  /* ===== 摸鱼魔盒（主进程直连三方 + 本地兜底） ===== */
  var imgSerial = 0, poemSerial = 0, sayingSerial = 0;
  function openImgBox() { $('#moyuImgMask').classList.add('show'); loadRandomImg() }
  async function loadRandomImg() {
    imgSerial++;
    var serial = imgSerial;
    $('#imgErr').hidden = true; $('#moyuImgEl').hidden = true; $('#imgLoading').hidden = false;
    var img = $('#moyuImgEl');
    img.onload = function () { if (serial !== imgSerial) return; $('#imgLoading').hidden = true; img.hidden = false };
    img.onerror = function () { if (serial !== imgSerial) return; $('#imgLoading').hidden = true; $('#imgErr').hidden = false };
    try {
      var r = await api.moyuImage();
      if (serial !== imgSerial) return;
      img.src = r.url;
    } catch (e) {
      if (serial !== imgSerial) return;
      img.src = 'https://picsum.photos/600/400?t=' + Date.now(); // 主进程不可达时直连兜底
    }
  }
  function closeImgBox() { $('#moyuImgMask').classList.remove('show') }
  function openPoemBox() { $('#moyuPoemMask').classList.add('show'); loadRandomPoem() }
  async function loadRandomPoem() {
    poemSerial++;
    var serial = poemSerial;
    $('#poemErr').hidden = true; $('#moyuPoemEl').hidden = true; $('#poemLoading').hidden = false;
    function show(p) {
      if (serial !== poemSerial) return;
      $('#poemTitle').textContent = p.title;
      $('#poemMeta').textContent = p.meta;
      $('#poemLines').innerHTML = p.lines.map(function (l) { return '<p>' + escHtml(l) + '</p>' }).join('');
      $('#poemLoading').hidden = true; $('#moyuPoemEl').hidden = false;
    }
    try {
      var p = await api.moyuPoem();
      show(p);
    } catch (e) {
      var f = POEM_FALLBACK[Math.floor(Math.random() * POEM_FALLBACK.length)];
      show({ title: f.t, meta: f.a, lines: f.c });
    }
  }
  function closePoemBox() { $('#moyuPoemMask').classList.remove('show') }
  function openSayingBox() { $('#moyuSayingMask').classList.add('show'); loadRandomSaying() }
  async function loadRandomSaying() {
    sayingSerial++;
    var serial = sayingSerial;
    $('#sayingErr').hidden = true; $('#moyuSayingEl').hidden = true; $('#sayingLoading').hidden = false;
    function show(t) {
      if (serial !== sayingSerial) return;
      $('#sayingText').textContent = t;
      $('#sayingLoading').hidden = true; $('#moyuSayingEl').hidden = false;
    }
    try {
      var r = await api.moyuSaying();
      show(r.text);
    } catch (e) {
      show(SAYING_FALLBACK[Math.floor(Math.random() * SAYING_FALLBACK.length)]);
    }
  }
  function closeSayingBox() { $('#moyuSayingMask').classList.remove('show') }

  /* ===== 日历（服务器月度聚合 + 缓存） ===== */
  async function renderCalendar() {
    if (!cfg) return;
    var month = calY + '-' + pad(calM + 1);
    var sum = calendarCache[month];
    if (!sum) {
      try { sum = await api.getSalaryCalendar(month); calendarCache[month] = sum }
      catch (e) { toastMsg('日历加载失败：' + e.message); return }
    }
    $('#calMonthTitle').textContent = calY + '年' + (calM + 1) + '月';
    var showHol = cfg.excludeHolidays;
    $('#legendHoli').hidden = !showHol; $('#legendMakeup').hidden = !showHol;
    var lead = new Date(calY, calM, 1).getDay(), days = sum.monthDays;
    var html = ['日', '一', '二', '三', '四', '五', '六'].map(function (w) { return '<div class="cal-wd">' + w + '</div>' }).join('');
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell empty"></div>';
    var byDate = {};
    sum.days.forEach(function (d) { byDate[d.date] = d });
    var today = keyOf(new Date());
    for (var d = 1; d <= days; d++) {
      var k = month + '-' + pad(d);
      var s = byDate[k] || { isWork: false, holiday: false, makeup: false, overtime: false, pay: 0 };
      var cls = 'cal-cell' + (s.isWork ? ' iswork' : ' weekend') + (s.holiday ? ' holiday' : '') + (s.makeup ? ' makeup' : '') + (k === today ? ' today' : '') + (s.overtime ? ' has-ot' : '');
      var st = s.isWork ? (s.makeup ? '调休' : '工作') : (s.holiday ? '法定假' : '休息');
      html += '<button class="' + cls + '" data-date="' + k + '"><span class="d">' + d + '</span><span class="st">' + st + '</span><span class="amt">¥' + Math.round(s.pay) + '</span></button>';
    }
    $('#calGrid').innerHTML = html;
    $('#calHours').textContent = (sum.totalMin / 60).toFixed(1) + 'h';
    $('#calIncome').textContent = '¥' + Math.round(sum.totalPay).toLocaleString('zh-CN');
    $('#calAvg').textContent = (sum.avgMin / 60).toFixed(1) + 'h';
    $('#calWorkDays').textContent = sum.workDays + '天';
    $('#calRestDays').textContent = sum.restDays + '天';
    $('#calOtDays').textContent = sum.otDays + '天';
  }
  async function renderDayExtras(k) {
    // 当天感悟
    var nc = $('#dayNoteContent'), txt = '';
    try { var n = await api.getNote(k); txt = ((n && n.content) || '').trim() } catch (e) { }
    nc.textContent = txt || '这天还没有写下感悟。';
    nc.classList.toggle('empty', !txt);
    // 当天待办（只读时间线）
    var day = [];
    try { day = await api.listTodos(k) } catch (e) { }
    day.sort(function (a, b) { return timeToMin(a.remindAt) - timeToMin(b.remindAt) });
    $('#dayTodoCount').textContent = day.length ? (day.filter(function (t) { return t.done }).length + '/' + day.length + ' 完成') : '无安排';
    $('#dayTodoContent').innerHTML = day.length ? day.map(function (t) {
      return '<div class="dt-item' + (t.done ? ' done' : '') + '"><div class="dt-row"><span class="tp-time-label">' + escHtml(t.remindAt) + '</span><span class="tp-text">' + escHtml(t.text) + '</span></div></div>';
    }).join('') : '<div class="dt-empty">这天没有安排待办</div>';
  }
  async function openDetail(k) {
    selectedKey = k;
    var p = k.split('-'), date = new Date(+p[0], +p[1] - 1, +p[2]);
    var sum = calendarCache[p[0] + '-' + p[1]];
    var s = null;
    if (sum) sum.days.forEach(function (d) { if (d.date === k) s = d });
    if (!s) {
      try { s = (await api.getSalaryDay(k)).summary } catch (e) { }
    }
    if (!s) return;
    $('#detailTitle').textContent = (+p[1]) + '月' + (+p[2]) + '日';
    $('#detailWeek').textContent = week[date.getDay()] + (s.isWork ? ' · 工作日' : (s.holiday ? ' · 法定假' : ' · 休息日'));
    $('#dayPay').textContent = '¥' + Math.round(s.pay);
    var badge = $('#dayOtBadge');
    badge.textContent = s.overtime ? '已加班' : '未加班';
    badge.className = 'dh-badge ' + (s.overtime ? 'yes' : 'no');
    $('#dayPaySub').textContent = s.overtime ? ('基本 ¥' + Math.round(s.base) + ' + 加班 ¥' + Math.round(s.ot)) : (s.isWork ? '基本工资，未计加班' : '休息日 · 无基本工资');
    $('#dayHours').textContent = fmtHM(s.totalMin);
    $('#dayHoursNote').textContent = s.overtime ? ('净工时 ' + fmtHM(s.netMin) + ' + 加班 ' + fmtHM(s.otMin)) : (s.isWork ? '净工作时长（已扣休息）' : '当天无工作时长');
    $('#dayPay2').textContent = '¥' + Math.round(s.pay);
    $('#dayPay2Note').textContent = s.overtime ? '基本 + 加班' : '仅基本工资';
    $('#dayStart').textContent = s.checkinAt || s.start;
    $('#dayStartNote').textContent = s.checkinAt ? '启动客户端打卡时间' : '未打卡 · 按默认上班时间';
    $('#dayEnd').textContent = s.end;
    $('#dayEndNote').textContent = s.checkinAt ? '按打卡 + 工作时长推算' : '按设置的下班时间';
    $('#dayNote').innerHTML = '开启「<b>开机启动并打卡</b>」后，以启动打卡时刻为起点，按工作时长推算下班时间。加班记录来自倒计时归零时的询问弹窗。';
    $('#calListView').hidden = true; $('#calDetailView').hidden = false;
    renderDayExtras(k);
  }

  /* ===== 设置页（保存到服务器） ===== */
  function syncSettingsInputs() {
    if (!cfg) return;
    $('#cfgMonthly').value = cfg.monthly;
    $('#cfgStart').value = cfg.workStart;
    $('#cfgEnd').value = cfg.workEnd;
    $('#cfgLunchS').value = cfg.lunchStart;
    $('#cfgLunchE').value = cfg.lunchEnd;
    $('#cfgOtStart').value = cfg.otStart;
    $('#cfgRemind').value = cfg.remindMin;
    var hs = $('#cfgHoliday');
    hs.classList.toggle('on', !!cfg.excludeHolidays);
    hs.setAttribute('aria-checked', String(!!cfg.excludeHolidays));
    $('#holiPanel').hidden = !cfg.excludeHolidays;
    renderTiers($('#defaultTiers'), cfg.tiers);
    renderCustomHolidays();
  }
  async function syncBootSwitch() {
    var on = false;
    try { on = !!await api.getBootStatus() } catch (e) { }
    var ab = $('#cfgAutoBoot');
    ab.classList.toggle('on', on);
    ab.setAttribute('aria-checked', String(on));
  }
  function renderTiers(host, list) {
    host.innerHTML = list.map(function (t, i) {
      return '<div class="tier-row"><input class="t-time" type="time" value="' + t.time + '" data-tier="default" data-i="' + i + '" data-f="time" aria-label="到点时间"><span class="t-sep">赚</span><input class="t-pay" type="number" min="0" step="10" value="' + t.pay + '" data-tier="default" data-i="' + i + '" data-f="pay" aria-label="加班费"><button class="t-del" data-del="default" data-i="' + i + '" aria-label="删除该档">×</button></div>';
    }).join('');
  }
  function renderCustomHolidays() {
    var list = (cfg && cfg.customHolidays) || [];
    $('#holiChips').innerHTML = list.length ? list.map(function (k, i) {
      return '<span class="holi-chip">' + k + '<button data-delholi="' + i + '" aria-label="移除 ' + k + '">×</button></span>';
    }).join('') : '<span class="empty-tip">尚未添加 · 可把调休或请假日剔除</span>';
  }
  function scheduleSave() {
    if (!booted || !cfg) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      try {
        cfg = await api.saveSalaryConfig(cfg);
        calendarCache = {}; // 配置变化后让日历重新聚合
      } catch (e) { toastMsg('设置保存失败：' + e.message) }
    }, 500);
  }

  /* ===== 页面切换 / 窗口模式 ===== */
  function setTab(name) {
    var wb = $('.w-body');
    if (wb) wb.scrollTop = 0;
    $$('.w-page').forEach(function (p) { p.hidden = p.getAttribute('data-page') !== name });
    $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === name)) });
    if (name === 'calendar') { $('#calListView').hidden = false; $('#calDetailView').hidden = true; selectedKey = null; renderCalendar() }
    if (name === 'settings') { syncSettingsInputs(); syncBootSwitch() }
    if (name === 'todo') { renderTodos() }
  }
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    api.setMode(m).catch(function () { });
  }

  /* ===== 登录 / 启动流程 ===== */
  function showLogin() {
    document.body.dataset.view = 'login';
    $('#loginView').hidden = false;
    $('#appView').hidden = true;
  }
  function showApp() {
    document.body.dataset.view = 'app';
    document.body.dataset.mode = mode;
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
  }
  async function doLogin() {
    var btn = $('#loginSubmit');
    btn.disabled = true; btn.textContent = '登录中…';
    $('#loginError').textContent = '';
    try {
      var result = await api.login($('#username').value.trim(), $('#password').value);
      user = result.user;
      $('#password').value = '';
      await enterApp();
    } catch (e) {
      $('#loginError').textContent = e.message || '登录失败，请检查账号密码';
    }
    btn.disabled = false; btn.textContent = '登录';
  }
  async function enterApp() {
    showApp();
    try {
      cfg = await api.getSalaryConfig();
      var today = keyOf(new Date());
      todoDate = today;
      calY = new Date().getFullYear(); calM = new Date().getMonth();
      // 启动即打卡：当日首次启动记录时刻（用于 autoBoot 推算下班）
      todayRecord = await api.checkin();
      var day = await api.getSalaryDay(today);
      if (day && day.record) todayRecord = day.record;
      await fetchTodos();
      await loadNotePreview();
      await loadLoveNote();
      await syncBootSwitch();
      booted = true;
      nextRemind = Date.now() + cfg.remindMin * 60000;
      setTab('clock');
      syncSettingsInputs();
      renderClock();
      checkTodoRings();
      if (!tickTimer) tickTimer = setInterval(renderClock, 1000);
    } catch (e) {
      toastMsg('初始化失败：' + e.message);
    }
  }
  async function boot() {
    var st = $('#loginServerStatus');
    try { await api.checkHealth(); st.textContent = '在线' }
    catch (e) { st.textContent = '离线'; st.style.color = '#b3564a' }
    var u = null;
    try { u = await api.restoreSession() } catch (e) { u = null }
    if (u && u.id) { user = u; enterApp() } else { showLogin() }
  }

  /* ===== 事件绑定 ===== */
  document.addEventListener('click', async function (ev) {
    if ($('#finaleBanner').classList.contains('show') && !ev.target.closest('.finale-banner')) closeFinale();
    if (ev.target.closest('.finale-banner')) { closeFinale(); return }
    var tab = ev.target.closest('[data-tab]');
    if (tab) { if (booted) setTab(tab.getAttribute('data-tab')); return }
    var act = ev.target.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'compact') setMode('compact');
      if (a === 'expand') setMode('full');
      if (a === 'close') api.closeApp().catch(function () { });
      return;
    }
    // 迷你小窗：点击卡片主体（倒计时/进度/已赚）任意处也可展开还原
    if (mode === 'compact' && ev.target.closest('#widgetCompact') && !ev.target.closest('.c-expand')) {
      setMode('full');
      return;
    }
    if (ev.target.closest('#moyuImg')) { openImgBox(); return }
    if (ev.target.closest('#moyuPoem')) { openPoemBox(); return }
    if (ev.target.closest('#moyuSaying')) { openSayingBox(); return }
    if (ev.target.closest('#imgAgain')) { loadRandomImg(); return }
    if (ev.target.closest('#poemAgain')) { loadRandomPoem(); return }
    if (ev.target.closest('#sayingAgain')) { loadRandomSaying(); return }
    if (ev.target.id === 'moyuImgMask') { closeImgBox(); return }
    if (ev.target.id === 'moyuPoemMask') { closePoemBox(); return }
    if (ev.target.id === 'moyuSayingMask') { closeSayingBox(); return }
    if (!booted) {
      return;
    }
    var chk = ev.target.closest('[data-todo-check]');
    if (chk) {
      var cid = chk.getAttribute('data-todo-check');
      var cur = todos.filter(function (t) { return t.id === cid })[0];
      if (cur) {
        try { await api.updateTodo(cid, { done: !cur.done }); await fetchTodos() }
        catch (e) { toastMsg('待办更新失败：' + e.message) }
      }
      return;
    }
    var td = ev.target.closest('[data-todo-del]');
    if (td) {
      try { await api.deleteTodo(td.getAttribute('data-todo-del')); await fetchTodos() }
      catch (e) { toastMsg('待办删除失败：' + e.message) }
      return;
    }
    if (ev.target.closest('#tpClear')) {
      try { await api.clearTodos(todoDate); await fetchTodos() }
      catch (e) { toastMsg('清除失败：' + e.message) }
      return;
    }
    if (ev.target.closest('#tpPrev')) { todoDate = dateKeyAdd(todoDate, -1); fetchTodos(); return }
    if (ev.target.closest('#tpNext')) { todoDate = dateKeyAdd(todoDate, 1); fetchTodos(); return }
    if (ev.target.closest('#tpToday')) { todoDate = keyOf(new Date()); fetchTodos(); return }
    if (ev.target.closest('#cfgHoliday')) {
      var hs = $('#cfgHoliday'), on = !hs.classList.contains('on');
      cfg.excludeHolidays = on;
      hs.classList.toggle('on', on); hs.setAttribute('aria-checked', String(on));
      $('#holiPanel').hidden = !on;
      scheduleSave(); calendarCache = {};
      renderClock(); if (!$('#pageCalendar').hidden) renderCalendar();
      return;
    }
    if (ev.target.closest('#addHoli')) {
      var hv = $('#holiDate').value; if (!hv) return;
      cfg.customHolidays = cfg.customHolidays || [];
      if (cfg.customHolidays.indexOf(hv) < 0) {
        cfg.customHolidays.push(hv);
        scheduleSave(); calendarCache = {};
        renderCustomHolidays(); renderClock(); if (!$('#pageCalendar').hidden) renderCalendar();
      }
      $('#holiDate').value = '';
      return;
    }
    var dh = ev.target.closest('[data-delholi]');
    if (dh) {
      cfg.customHolidays.splice(+dh.getAttribute('data-delholi'), 1);
      scheduleSave(); calendarCache = {};
      renderCustomHolidays(); renderClock(); if (!$('#pageCalendar').hidden) renderCalendar();
      return;
    }
    if (ev.target.closest('#cfgAutoBoot')) {
      var ab = $('#cfgAutoBoot'), enable = !ab.classList.contains('on');
      var real = enable;
      try { real = !!(await api.setBoot(enable)) } catch (e) { toastMsg('开机自启设置失败：' + e.message) }
      ab.classList.toggle('on', real); ab.setAttribute('aria-checked', String(real));
      cfg.autoBoot = real;
      scheduleSave(); calendarCache = {};
      toastMsg(real ? '✓ 已开启开机自启，启动即打卡' : '已关闭开机自启');
      return;
    }
    if (ev.target.closest('#countdownCard')) { openOffDialog('setup'); return }
    if (ev.target.closest('#offNo')) { $('#offMask').classList.remove('show'); finale('off'); return }
    if (ev.target.closest('#offYes')) { $('#offPanel').hidden = false; updateOffPreview(); return }
    if (ev.target.closest('#offConfirm')) { confirmOvertime(); return }
    if (ev.target.closest('#prevMonth')) { calM--; if (calM < 0) { calM = 11; calY-- } renderCalendar(); return }
    if (ev.target.closest('#nextMonth')) { calM++; if (calM > 11) { calM = 0; calY++ } renderCalendar(); return }
    if (ev.target.closest('#backToCal')) { $('#calDetailView').hidden = true; $('#calListView').hidden = false; selectedKey = null; renderCalendar(); return }
    if (ev.target.closest('#noteEntry')) { openNoteEditor(); return }
    if (ev.target.closest('#editDayNote')) { openNoteEditor(selectedKey); return }
    if (ev.target.closest('#noteSave')) { saveNote(); return }
    if (ev.target.closest('#noteDelete')) { $('#noteArea').value = ''; saveNote(); return }
    if (ev.target.id === 'noteMask') { closeNoteEditor(); return }
    if (ev.target.closest('#addDefaultTier')) { cfg.tiers.push({ time: '23:00', pay: 150 }); renderTiers($('#defaultTiers'), cfg.tiers); scheduleSave(); return }
    var del = ev.target.closest('[data-del]');
    if (del) { cfg.tiers.splice(+del.getAttribute('data-i'), 1); renderTiers($('#defaultTiers'), cfg.tiers); scheduleSave(); return }
    var cell = ev.target.closest('[data-date]');
    if (cell) { openDetail(cell.getAttribute('data-date')); return }
    if (ev.target.id === 'offMask') { $('#offMask').classList.remove('show'); return }
  });
  document.addEventListener('input', function (ev) {
    if (!booted) return;
    var t = ev.target.closest('[data-tier]');
    if (t) {
      var i = +t.getAttribute('data-i'), f = t.getAttribute('data-f');
      cfg.tiers[i][f] = f === 'pay' ? (+t.value || 0) : t.value;
      scheduleSave(); updateOffPreview();
      return;
    }
    if (ev.target.id === 'offEnd') { updateOffPreview(); return }
    if (ev.target.id === 'noteArea') { $('#noteCharCount').textContent = ev.target.value.length + ' / 500'; return }
    var map = { cfgMonthly: 'monthly', cfgStart: 'workStart', cfgEnd: 'workEnd', cfgLunchS: 'lunchStart', cfgLunchE: 'lunchEnd', cfgOtStart: 'otStart', cfgRemind: 'remindMin' };
    if (map[ev.target.id]) {
      var key = map[ev.target.id];
      cfg[key] = (key === 'monthly' || key === 'remindMin') ? (+ev.target.value || 1) : ev.target.value;
      if (key === 'remindMin') nextRemind = Date.now() + cfg.remindMin * 60000;
      scheduleSave(); calendarCache = {};
      renderClock(); updateOffPreview();
      return;
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'tpDatePick' && ev.target.value) { todoDate = ev.target.value; fetchTodos() }
  });
  document.addEventListener('submit', async function (ev) {
    if (ev.target.id === 'loginForm') { ev.preventDefault(); doLogin(); return }
    if (ev.target.id === 'tpForm') {
      ev.preventDefault();
      if (!booted) return;
      var text = $('#tpInput').value, time = $('#tpTime').value;
      var ok = await addTodo(text, time);
      if (ok) {
        $('#tpInput').value = ''; $('#tpInput').focus();
        var p = todoDate.split('-'), dstr = (todoDate === keyOf(new Date()) ? '' : (p[1] + '月' + p[2] + '日 '));
        toastMsg('✓ 已记下「' + text.trim() + '」' + (time ? ('（' + dstr + time + '）') : (dstr ? ('（' + dstr + '）') : '')));
      } else { $('#tpInput').focus() }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $('#offMask').classList.remove('show');
      closeNoteEditor(); closeImgBox(); closePoemBox(); closeSayingBox(); closeFinale();
    }
  });
  window.addEventListener('resize', function () { sizeConfetti() });

  /* 全窗体滚轮：内容区交给浏览器原生滚动（最灵敏、自带平滑）；
     标题栏 / 导航等非内容区域滚轮由 JS 驱动同一个容器，保证全窗体都能滚。 */
  function wheelUnit(ev, body) {
    return ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? body.clientHeight : 1);
  }
  document.addEventListener('wheel', function (ev) {
    if (ev.ctrlKey || mode !== 'full') return;
    if ($('.mask.show')) return;
    var body = $('.w-body');
    if (!body || body.scrollHeight <= body.clientHeight) return;
    if (body.contains(ev.target)) {
      // 内部可滚容器优先；滚到边界时把这一格接力给外层，避免卡住
      var inner = ev.target.closest && ev.target.closest('.tp-list,.note-content,.mm-body');
      if (inner && inner.scrollHeight > inner.clientHeight) {
        var atTop = inner.scrollTop <= 0 && ev.deltaY < 0;
        var atBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1 && ev.deltaY > 0;
        if (atTop || atBottom) body.scrollTop += ev.deltaY * wheelUnit(ev, body);
      }
      return; // 不拦截，交给原生滚动
    }
    ev.preventDefault();
    body.scrollTop += ev.deltaY * wheelUnit(ev, body) * 1.3;
  }, { passive: false, capture: true });

  /* ===== 启动 ===== */
  if (!api) {
    document.body.innerHTML = '<div style="color:#f2f6ea;font:14px sans-serif;padding:30px;text-align:center">桌面环境加载失败，请通过耄猫时钟客户端打开。</div>';
    return;
  }
  $('#tpTime').value = pad(new Date().getHours()) + ':' + pad(new Date().getMinutes());
  showLogin();
  boot();
})();
