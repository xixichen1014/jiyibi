/*!
 * 记一笔 · app.js
 * 界面层：四个 Tab（明细 / 统计 / 预算 / 我的）、记账面板、各类管理表单。
 */
(function () {
  'use strict';

  var C = window.LedgerCore;
  var STORE_KEY = 'jiyibi.db.v1';

  var S = {
    db: null,
    tab: 'home',
    ym: null,
    statsKind: 'expense',
    catTab: 'expense',
    sheet: null,
    rec: null,
    form: null,
    statsCache: null,
    scrollTop: 0,
    toastTimer: null
  };

  /* ================================================================== *
   * 通用工具
   * ================================================================== */
  function $(sel, el) { return (el || document).querySelector(sel); }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch]; }); }

  function money(n) { return S.db.settings.currency + C.fmtMoney(n); }
  function money0(n) { return S.db.settings.currency + C.fmtMoney(n, 0); }

  /* ---------- 图标 ---------- */
  var svg = function (body, extra) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + body + '</svg>';
  };
  var ICONS = {
    list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
    chart: svg('<path d="M5 20v-9M12 20V4M19 20v-6"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
    book: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 7.5h6M9 11.5h6"/>'),
    caretDown: svg('<path d="M7 10l5 5 5-5"/>'),
    chevronL: svg('<path d="M14.5 6.5L9 12l5.5 5.5"/>'),
    chevronR: svg('<path d="M9.5 6.5L15 12l-5.5 5.5"/>'),
    calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    card: svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'),
    tag: svg('<path d="M11 3.5H4.5V10l9 9a2 2 0 0 0 2.8 0l3.2-3.2a2 2 0 0 0 0-2.8z"/><circle cx="8" cy="7" r="1.2" fill="currentColor" stroke="none"/>'),
    download: svg('<path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5"/><path d="M4.5 17.5v1A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-1"/>'),
    upload: svg('<path d="M12 15V5m0 0L8.5 8.5M12 5l3.5 3.5"/><path d="M4.5 17.5v1A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-1"/>'),
    trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L17.5 7"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };

  function activeLedger() {
    return S.db.ledgers.filter(function (l) { return l.id === S.db.activeLedgerId; })[0] || S.db.ledgers[0];
  }
  function lid() { return activeLedger().id; }
  function allCategories(kind) {
    return S.db.categories
      .filter(function (c) { return c.ledgerId === lid() && (!kind || c.kind === kind); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function allAccounts() {
    return S.db.accounts
      .filter(function (a) { return a.ledgerId === lid(); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function cat(id) { return S.db.categories.filter(function (c) { return c.id === id; })[0]; }
  function acc(id) { return S.db.accounts.filter(function (a) { return a.id === id; })[0]; }

  /* ---------- 持久化 ---------- */
  var saveTimer = null;
  function save(immediate) {
    if (immediate) { persist(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S.db));
    } catch (e) {
      toast('保存失败：存储空间可能已满');
    }
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('is-on');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 1800);
  }

  /* ================================================================== *
   * 图形绘制
   * ================================================================== */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2);
    h = Math.max(h, 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function setupCanvas(c) {
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth || 300;
    var h = c.clientHeight || Number(c.getAttribute('height')) || 160;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function drawDonut() {
    var c = document.getElementById('donut');
    if (!c || !S.statsCache) return;
    var items = S.statsCache.breakdown.items;
    var s = setupCanvas(c);
    var ctx = s.ctx, w = s.w, h = s.h;
    var cx = w / 2, cy = h / 2;
    var r = Math.min(w, h) / 2 - 6;
    var lw = Math.max(12, r * 0.3);

    ctx.beginPath();
    ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#eef1f6';
    ctx.lineWidth = lw;
    ctx.stroke();

    var total = items.reduce(function (sum, it) { return sum + it.amount; }, 0);
    if (total <= 0) return;

    var start = -Math.PI / 2;
    var gap = items.length > 1 ? 0.022 : 0;
    items.forEach(function (it) {
      var angle = (it.amount / total) * Math.PI * 2;
      // 起点内缩半个间隙、终点再留半个间隙，保证 a1 始终大于 a0
      // （否则占比极小的分类会让弧反向绕一整圈，把整个环涂成一种颜色）
      var a0 = start + gap / 2;
      var sweep = Math.max(angle - gap, 0.004);
      ctx.beginPath();
      ctx.arc(cx, cy, r - lw / 2, a0, a0 + sweep);
      ctx.strokeStyle = it.color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.stroke();
      start += angle;
    });
  }

  function drawTrend() {
    var c = document.getElementById('trend');
    if (!c || !S.statsCache) return;
    var data = S.statsCache.trend;
    var s = setupCanvas(c);
    var ctx = s.ctx, w = s.w, h = s.h;

    var padT = 22, padB = 24, padL = 2, padR = 2;
    var innerH = h - padT - padB;
    var max = 1;
    data.forEach(function (d) { max = Math.max(max, d.expense, d.income); });
    max = max * 1.15;

    ctx.strokeStyle = '#eef1f6';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 2; g++) {
      var gy = padT + innerH * g / 2;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
    }

    var slot = (w - padL - padR) / data.length;
    var barW = Math.min(9, slot * 0.24);
    var gap = 3;

    data.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var he = innerH * (d.expense / max);
      var hi = innerH * (d.income / max);

      // expense (left)
      ctx.fillStyle = '#ef4a56';
      roundRect(ctx, cx - barW - gap / 2, padT + innerH - he, barW, he, 3);
      ctx.fill();

      // income (right)
      ctx.fillStyle = '#5fd0a8';
      roundRect(ctx, cx + gap / 2, padT + innerH - hi, barW, hi, 3);
      ctx.fill();

      // label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px -apple-system, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(d.label, cx, h - padB + 7);
    });
  }

  function redrawCharts() {
    if (S.tab !== 'stats') return;
    requestAnimationFrame(function () {
      drawDonut();
      drawTrend();
    });
  }

  /* ================================================================== *
   * 路由与渲染
   * ================================================================== */
  function route() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    var tab = h.split('?')[0];
    if (['home', 'stats', 'budget', 'me'].indexOf(tab) >= 0) S.tab = tab;
    render();
  }

  function render() {
    var view = document.getElementById('view');
    var keep = view ? view.scrollTop : 0;
    var app = document.getElementById('app');
    app.innerHTML = '<main class="view" id="view">' + viewHTML() + '</main>' + tabbarHTML();
    var nv = document.getElementById('view');
    if (nv) nv.scrollTop = keep;
    if (S.tab === 'stats') redrawCharts();
  }

  function viewHTML() {
    if (S.tab === 'stats') return viewStats();
    if (S.tab === 'budget') return viewBudget();
    if (S.tab === 'me') return viewMe();
    return viewHome();
  }

  function tabbarHTML() {
    var tabs = [
      { id: 'home', label: '明细', icon: ICONS.list },
      { id: 'stats', label: '统计', icon: ICONS.chart },
      null,
      { id: 'budget', label: '预算', icon: ICONS.target },
      { id: 'me', label: '我的', icon: ICONS.user }
    ];
    return '<nav class="tabbar">' + tabs.map(function (t) {
      if (!t) return '<button class="fab" data-act="add-tx" aria-label="记一笔">' + ICONS.plus + '</button>';
      return '<a class="tab' + (S.tab === t.id ? ' is-on' : '') + '" href="#/' + t.id + '">' +
        t.icon + '<span>' + t.label + '</span></a>';
    }).join('') + '</nav>';
  }

  function monthNav() {
    var nextDisabled = S.ym >= C.currentYM();
    return '<div class="month-nav">' +
      '<button class="icon-btn" data-act="month-prev" aria-label="上个月">' + ICONS.chevronL + '</button>' +
      '<button class="month-label" data-act="month-pick">' + C.monthLabel(S.ym) + '</button>' +
      '<button class="icon-btn" data-act="month-next" aria-label="下个月"' + (nextDisabled ? ' disabled' : '') + '>' + ICONS.chevronR + '</button>' +
      '</div>';
  }

  /* ================================================================== *
   * 明细页
   * ================================================================== */
  function viewHome() {
    var ledger = activeLedger();
    var sum = C.monthSummary(S.db, lid(), S.ym);
    var txs = C.monthTxs(S.db, lid(), S.ym);
    var groups = C.groupByDay(txs);
    var st = C.budgetStatus(S.db, lid(), S.ym);
    var overBanner = '';

    if (st.total && st.total.over) {
      overBanner = '<button class="banner" data-act="go" data-tab="budget">' +
        '<span class="banner-ico">⚠️</span>' +
        '<span class="banner-text">本月总预算已超支 <b>' + money(st.total.overAmount) + '</b>，点此查看</span>' +
        '<i>›</i></button>';
    } else if (st.overCount > 0) {
      overBanner = '<button class="banner" data-act="go" data-tab="budget">' +
        '<span class="banner-ico">⚠️</span>' +
        '<span class="banner-text">有 ' + st.overCount + ' 项预算超支了，点此查看</span><i>›</i></button>';
    }

    var body;
    if (!txs.length) {
      body = '<div class="empty">' +
        '<div class="empty-ico">🧾</div>' +
        '<p>这个月还没有记账</p>' +
        '<button class="btn" data-act="add-tx">记第一笔</button>' +
        '</div>';
    } else {
      body = groups.map(function (g) {
        return '<section class="day">' +
          '<div class="day-head">' +
          '<span class="day-date">' + C.dayLabel(g.date) + '</span>' +
          '<span class="day-wd">' + C.weekdayLabel(g.date) + '</span>' +
          '<span class="day-sum">' + (g.expense > 0 ? '-' + money0(g.expense) : '') + '</span>' +
          '</div>' +
          '<div class="day-body">' + g.items.map(txRow).join('') + '</div>' +
          '</section>';
      }).join('');
    }

    return '<header class="topbar">' +
      '<button class="ledger-chip" data-act="open-ledgers">' +
      '<span class="ledger-ico">' + ICONS.book + '</span>' +
      '<span class="ledger-name">' + esc(ledger.name) + '</span>' + ICONS.caretDown +
      '</button>' + monthNav() + '</header>' +
      '<section class="summary">' +
      '<div class="summary-label">' + C.monthLabel(S.ym) + ' 支出</div>' +
      '<div class="summary-value">' + money(sum.expense) + '</div>' +
      '<div class="summary-split">' +
      '<div><span>收入</span><b class="income">' + money(sum.income) + '</b></div>' +
      '<div><span>结余</span><b class="' + (sum.net < 0 ? 'expense' : '') + '">' + money(sum.net) + '</b></div>' +
      '<div><span>笔数</span><b>' + sum.count + '</b></div>' +
      '</div></section>' +
      overBanner +
      '<div class="tx-list">' + body + '</div>';
  }

  function txRow(t) {
    if (t.kind === 'transfer') {
      var from = acc(t.accountId), to = acc(t.toAccountId);
      return '<div class="tx-row" data-act="edit-tx" data-id="' + t.id + '">' +
        '<div class="cat-ico" style="background:#eef2ff;color:#4f46e5">⇄</div>' +
        '<div class="tx-main"><div class="tx-title">转账</div>' +
        '<div class="tx-sub">' + esc(from ? from.name : '?') + ' → ' + esc(to ? to.name : '?') + (t.note ? ' · ' + esc(t.note) : '') + '</div></div>' +
        '<div class="tx-amt transfer">' + money(t.amount) + '</div></div>';
    }
    var c = cat(t.categoryId);
    var a = acc(t.accountId);
    var isExpense = t.kind === 'expense';
    return '<div class="tx-row" data-act="edit-tx" data-id="' + t.id + '">' +
      '<div class="cat-ico" style="background:' + hexA(c ? c.color : '#94a3b8', 0.14) + '">' + (c ? esc(c.icon) : '❓') + '</div>' +
      '<div class="tx-main">' +
      '<div class="tx-title">' + esc(c ? c.name : '未分类') + '</div>' +
      '<div class="tx-sub">' + (a ? esc(a.name) : '未知账户') + (t.note ? ' · ' + esc(t.note) : '') + '</div>' +
      '</div>' +
      '<div class="tx-amt ' + (isExpense ? 'expense' : 'income') + '">' + (isExpense ? '-' : '+') + C.fmtMoney(t.amount) + '</div>' +
      '</div>';
  }

  function hexA(hex, alpha) {
    hex = String(hex || '#94a3b8').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(hex, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ================================================================== *
   * 统计页
   * ================================================================== */
  function viewStats() {
    var sum = C.monthSummary(S.db, lid(), S.ym);
    var kind = S.statsKind;
    var bd = C.categoryBreakdown(S.db, lid(), S.ym, kind);
    var trend = C.monthlyTrend(S.db, lid(), S.ym, 6);
    var balances = C.accountBalances(S.db, lid());
    S.statsCache = { breakdown: bd, trend: trend };

    var kindTotal = kind === 'expense' ? sum.expense : sum.income;

    var rank = bd.items.length ? bd.items.map(function (it) {
      return '<div class="rank-row">' +
        '<div class="rank-dot" style="background:' + it.color + '"></div>' +
        '<div class="rank-main">' +
        '<div class="rank-top"><span class="rank-name">' + esc(it.name) + '</span>' +
        '<span class="rank-amt">' + money(it.amount) + '</span></div>' +
        '<div class="rank-bar"><i style="width:' + Math.min(100, it.pct) + '%;background:' + it.color + '"></i></div>' +
        '<div class="rank-meta">' + it.count + ' 笔 · ' + it.pct.toFixed(1) + '%</div>' +
        '</div></div>';
    }).join('') : '<div class="empty empty--sm"><p>本月还没有' + (kind === 'expense' ? '支出' : '收入') + '</p></div>';

    var accRows = balances.items.map(function (a) {
      return '<div class="acc-row">' +
        '<span class="acc-ico">' + accountIcon(a.type) + '</span>' +
        '<span class="acc-name">' + esc(a.name) + '</span>' +
        '<span class="acc-bal ' + (a.balance < 0 ? 'expense' : '') + '">' + money(a.balance) + '</span>' +
        '</div>';
    }).join('');

    return '<header class="topbar">' +
      '<button class="ledger-chip" data-act="open-ledgers">' +
      '<span class="ledger-ico">' + ICONS.book + '</span>' +
      '<span class="ledger-name">' + esc(activeLedger().name) + '</span>' + ICONS.caretDown + '</button>' +
      monthNav() + '</header>' +
      '<div class="seg seg--wide">' +
      '<button class="' + (kind === 'expense' ? 'on' : '') + '" data-act="stats-kind" data-kind="expense">支出</button>' +
      '<button class="' + (kind === 'income' ? 'on' : '') + '" data-act="stats-kind" data-kind="income">收入</button>' +
      '</div>' +
      '<section class="card donut-card">' +
      '<div class="donut-wrap"><canvas id="donut" height="200"></canvas>' +
      '<div class="donut-center"><span class="donut-label">' + (kind === 'expense' ? '总支出' : '总收入') + '</span>' +
      '<b class="donut-value">' + money(kindTotal) + '</b>' +
      '<span class="donut-sub">' + bd.items.length + ' 个分类</span></div></div>' +
      '<div class="rank">' + rank + '</div>' +
      '</section>' +
      '<section class="card">' +
      '<div class="card-head"><h3>近 6 个月</h3>' +
      '<div class="legend"><i class="lg lg--expense"></i>支出<i class="lg lg--income"></i>收入</div></div>' +
      '<canvas id="trend" height="170"></canvas>' +
      '</section>' +
      '<section class="card">' +
      '<div class="card-head"><h3>账户余额</h3><b class="acc-total">' + money(balances.total) + '</b></div>' +
      accRows +
      '</section>';
  }

  function accountIcon(type) {
    if (type === 'cash') return '💵';
    if (type === 'debit') return '💳';
    if (type === 'credit') return '🏦';
    return '📱';
  }

  /* ================================================================== *
   * 预算页
   * ================================================================== */
  function viewBudget() {
    var st = C.budgetStatus(S.db, lid(), S.ym);
    var head = '<header class="topbar">' +
      '<button class="ledger-chip" data-act="open-ledgers">' +
      '<span class="ledger-ico">' + ICONS.book + '</span>' +
      '<span class="ledger-name">' + esc(activeLedger().name) + '</span>' + ICONS.caretDown + '</button>' +
      monthNav() + '</header>';

    var totalCard;
    if (st.total) {
      var t = st.total;
      totalCard = '<section class="card budget-card' + (t.over ? ' is-over' : '') + '">' +
        '<div class="budget-head"><span>本月总预算</span>' +
        '<button class="text-btn" data-act="edit-budget" data-scope="total">修改</button></div>' +
        '<div class="budget-nums"><b>' + money(t.spent) + '</b><span>/ ' + money(t.amount) + '</span></div>' +
        '<div class="bar bar--lg"><i style="width:' + Math.min(100, t.pct) + '%"></i></div>' +
        '<div class="budget-foot">' +
        (t.over
          ? '<span class="over-text">已超支 ' + money(t.overAmount) + '</span>'
          : '<span>还剩 <b>' + money(t.remaining) + '</b></span>') +
        '<span>' + (st.daysLeft > 0 ? '日均可用 ' + money(t.dailyAvailable) : '本月已结束') + '</span>' +
        '</div>' +
        (t.over ? '<div class="over-hint">💸 本月支出已超出预算，注意控制一下</div>' : '') +
        '</section>';
    } else {
      totalCard = '<section class="card budget-empty">' +
        '<div class="empty-ico">🎯</div>' +
        '<p>还没有设置月预算</p>' +
        '<button class="btn" data-act="edit-budget" data-scope="total">设置总预算</button></section>';
    }

    var catRows = st.categories.map(function (c) {
      return '<div class="budget-row' + (c.over ? ' is-over' : '') + '" data-act="edit-budget" data-scope="category" data-id="' + c.budgetId + '">' +
        '<div class="budget-ico" style="background:' + hexA(c.color, 0.15) + '">' + esc(c.icon) + '</div>' +
        '<div class="budget-row-main">' +
        '<div class="budget-row-top"><span class="budget-name">' + esc(c.name) + '</span>' +
        '<span class="budget-amt"><b>' + money(c.spent) + '</b> / ' + money(c.amount) + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, c.pct) + '%;background:' + (c.over ? '#ef4a56' : c.color) + '"></i></div>' +
        '<div class="budget-row-foot">' +
        (c.over ? '<span class="over-text">超支 ' + money(c.overAmount) + '</span>' : '<span>剩余 ' + money(c.remaining) + '</span>') +
        '<span>' + c.pct.toFixed(0) + '%</span></div>' +
        '</div></div>';
    }).join('');

    return head +
      (st.overCount > 0 ? '<div class="banner banner--solid">⚠️ 共 ' + st.overCount + ' 项预算超支</div>' : '') +
      totalCard +
      '<section class="card">' +
      '<div class="card-head"><h3>分类预算</h3>' +
      '<button class="text-btn" data-act="edit-budget" data-scope="category">＋ 添加</button></div>' +
      (st.categories.length ? catRows : '<div class="empty empty--sm"><p>给常花钱的分类设个上限吧</p></div>') +
      '</section>' +
      '<p class="footnote">预算按月重复生效，每月自动重置。</p>';
  }

  /* ================================================================== *
   * 我的页
   * ================================================================== */
  function viewMe() {
    var ledger = activeLedger();
    var txCount = S.db.txs.filter(function (t) { return t.ledgerId === lid(); }).length;
    return '<header class="topbar topbar--plain"><h1>我的</h1></header>' +
      '<section class="card group">' +
      '<div class="group-head">账本</div>' +
      '<button class="line" data-act="open-ledgers">' +
      '<span class="line-ico">' + ICONS.book + '</span><span class="line-label">当前账本</span>' +
      '<b class="line-value">' + esc(ledger.name) + '</b>' + ICONS.chevronR + '</button>' +
      '<button class="line" data-act="open-accounts">' +
      '<span class="line-ico">' + ICONS.card + '</span><span class="line-label">账户管理</span>' +
      '<b class="line-value">' + allAccounts().length + ' 个</b>' + ICONS.chevronR + '</button>' +
      '<button class="line" data-act="open-categories">' +
      '<span class="line-ico">' + ICONS.tag + '</span><span class="line-label">分类管理</span>' +
      '<b class="line-value">' + allCategories().length + ' 个</b>' + ICONS.chevronR + '</button>' +
      '</section>' +
      '<section class="card group">' +
      '<div class="group-head">数据</div>' +
      '<button class="line" data-act="export"><span class="line-ico">' + ICONS.download + '</span>' +
      '<span class="line-label">导出备份</span><b class="line-value">' + txCount + ' 笔</b>' + ICONS.chevronR + '</button>' +
      '<button class="line" data-act="import"><span class="line-ico">' + ICONS.upload + '</span>' +
      '<span class="line-label">导入备份</span>' + ICONS.chevronR + '</button>' +
      '<button class="line line--danger" data-act="reset"><span class="line-ico">' + ICONS.trash + '</span>' +
      '<span class="line-label">清空所有数据</span></button>' +
      '</section>' +
      '<p class="footnote">数据只保存在这台设备的浏览器里，不会上传服务器。<br>换手机前请先导出备份。版本 1.0</p>';
  }

  /* ================================================================== *
   * 记账面板
   * ================================================================== */
  function openRecord(txId) {
    var txs = S.db.txs.filter(function (t) { return t.id === txId; });
    var tx = txs[0];
    var accs = allAccounts();
    var ledger = activeLedger();
    var lastAcc = ledger.lastAccountId && acc(ledger.lastAccountId) ? ledger.lastAccountId : (accs[0] ? accs[0].id : null);

    if (tx) {
      S.rec = {
        id: tx.id, kind: tx.kind, amountStr: C.plainNum(tx.amount),
        categoryId: tx.categoryId || null, accountId: tx.accountId,
        toAccountId: tx.toAccountId || (accs[1] ? accs[1].id : null),
        date: tx.date, note: tx.note || ''
      };
    } else {
      var firstCat = allCategories('expense')[0];
      S.rec = {
        id: null, kind: 'expense', amountStr: '',
        categoryId: firstCat ? firstCat.id : null,
        accountId: lastAcc, toAccountId: accs[1] ? accs[1].id : null,
        date: C.todayISO(), note: ''
      };
    }
    S.sheet = { name: 'record' };
    renderSheet();
  }

  function displayAmount(s) {
    if (!s) return '0.00';
    var parts = String(s).split('.');
    parts[0] = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function recordSheetHTML() {
    var r = S.rec;
    var kinds = [{ k: 'expense', t: '支出' }, { k: 'income', t: '收入' }, { k: 'transfer', t: '转账' }];

    var kindHTML = '<div class="seg seg--rec">' + kinds.map(function (o) {
      return '<button class="' + (r.kind === o.k ? 'on' : '') + '" data-act="rec-kind" data-kind="' + o.k + '">' + o.t + '</button>';
    }).join('') + '</div>';

    return '<div class="sheet sheet--full" role="dialog" aria-label="记一笔">' +
      '<div class="rec-head">' +
      '<button class="text-btn" data-act="close-sheet">取消</button>' +
      kindHTML +
      '<button class="text-btn text-btn--primary' + (parseFloat(r.amountStr) > 0 ? ' is-ready' : '') + '" data-act="save-tx">保存</button>' +
      '</div>' +
      '<div class="rec-body">' +
      '<div class="amount-box"><span class="amount-cur">' + S.db.settings.currency + '</span>' +
      '<span id="amount-display" class="amount-value">' + displayAmount(r.amountStr) + '</span></div>' +
      '<div class="rec-mid">' + midHTML() + '</div>' +
      '<div class="rec-meta">' +
      '<label class="meta-chip"><span class="meta-ico">' + ICONS.calendar + '</span>' +
      '<input type="date" id="rec-date" value="' + r.date + '" max="' + C.todayISO() + '">' +
      '<span id="rec-date-label">' + C.dayLabel(r.date) + '</span></label>' +
      '<input class="note-input" id="rec-note" type="text" maxlength="40" placeholder="备注（可选）" value="' + esc(r.note) + '">' +
      '</div>' +
      (r.id ? '<button class="del-line" data-act="del-tx">删除这笔记录</button>' : '') +
      '</div>' +
      '<div class="keypad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(function (k) {
        return '<button class="key' + (k === 'del' ? ' key--del' : '') + '" data-act="key" data-key="' + k + '">' + (k === 'del' ? '⌫' : k) + '</button>';
      }).join('') +
      '</div></div>';
  }

  /** 分类九宫格 / 账户选择（转账时是转出转入）——单独抽出来，切换时只换这一块 */
  function midHTML() {
    var r = S.rec;
    var accs = allAccounts();
    if (r.kind === 'transfer') return transferHTML(r, accs);

    var cats = allCategories(r.kind);
    return '<div class="cat-grid">' + cats.map(function (c) {
      return '<button class="cat-cell' + (r.categoryId === c.id ? ' on' : '') + '" data-act="rec-cat" data-id="' + c.id + '">' +
        '<span class="cat-cell-ico" style="background:' + hexA(c.color, 0.14) + '">' + esc(c.icon) + '</span>' +
        '<span class="cat-cell-name">' + esc(c.name) + '</span></button>';
    }).join('') + '</div>' +
      '<div class="chip-row"><span class="chip-row-label">账户</span>' + accs.map(function (a) {
        return '<button class="chip' + (r.accountId === a.id ? ' on' : '') + '" data-act="rec-acc" data-id="' + a.id + '">' + esc(a.name) + '</button>';
      }).join('') + '</div>';
  }

  /** 只切换选中态，不重建 DOM —— 避免点一下闪一下 */
  function markSelected(selector, attr, value) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('on', nodes[i].getAttribute(attr) === value);
    }
  }

  function transferHTML(r, accs) {
    var fromChips = accs.map(function (a) {
      return '<button class="chip' + (r.accountId === a.id ? ' on' : '') + '" data-act="rec-from" data-id="' + a.id + '">' + esc(a.name) + '</button>';
    }).join('');
    var toChips = accs.map(function (a) {
      return '<button class="chip' + (r.toAccountId === a.id ? ' on' : '') + '" data-act="rec-to" data-id="' + a.id + '">' + esc(a.name) + '</button>';
    }).join('');
    return '<div class="transfer-box">' +
      '<div class="transfer-line"><span class="chip-row-label">从</span><div class="chip-row chip-row--wrap">' + fromChips + '</div></div>' +
      '<div class="transfer-arrow">↓</div>' +
      '<div class="transfer-line"><span class="chip-row-label">到</span><div class="chip-row chip-row--wrap">' + toChips + '</div></div>' +
      (accs.length < 2 ? '<p class="hint">至少需要 2 个账户才能转账</p>' : '') +
      '</div>';
  }

  /* ================================================================== *
   * 各类管理面板
   * ================================================================== */
  function ledgerSheetHTML() {
    var rows = S.db.ledgers.map(function (l) {
      var count = S.db.txs.filter(function (t) { return t.ledgerId === l.id; }).length;
      return '<li class="row' + (l.id === S.db.activeLedgerId ? ' is-active' : '') + '">' +
        '<button class="row-hit" data-act="switch-ledger" data-id="' + l.id + '">' +
        '<span class="row-main"><b>' + esc(l.name) + '</b><small>' + count + ' 笔记录</small></span>' +
        (l.id === S.db.activeLedgerId ? '<span class="row-check">✓</span>' : '') +
        '</button>' +
        '<span class="row-ops">' +
        '<button class="mini" data-act="ledger-form" data-id="' + l.id + '">改名</button>' +
        '<button class="mini mini--danger" data-act="del-ledger" data-id="' + l.id + '">删除</button>' +
        '</span></li>';
    }).join('');
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>账本</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body"><ul class="rows">' + rows + '</ul>' +
      '<button class="btn btn--block" data-act="ledger-form">＋ 新建账本</button></div>' +
      '</div>';
  }

  function ledgerFormHTML() {
    var f = S.form;
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>' + (f.id ? '重命名账本' : '新建账本') + '</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<label class="field"><span>名称</span><input id="f-name" type="text" maxlength="12" placeholder="例如：家庭账本" value="' + esc(f.name || '') + '"></label>' +
      '<button class="btn btn--block" data-act="save-ledger">保存</button>' +
      '</div></div>';
  }

  function accountsSheetHTML() {
    var bal = C.accountBalances(S.db, lid());
    var balMap = {};
    bal.items.forEach(function (a) { balMap[a.id] = a.balance; });
    var rows = allAccounts().map(function (a) {
      return '<li class="row">' +
        '<span class="row-ico">' + accountIcon(a.type) + '</span>' +
        '<span class="row-main"><b>' + esc(a.name) + '</b><small>余额 ' + money(balMap[a.id] || 0) + '</small></span>' +
        '<span class="row-ops">' +
        '<button class="mini" data-act="account-form" data-id="' + a.id + '">编辑</button>' +
        '<button class="mini mini--danger" data-act="del-account" data-id="' + a.id + '">删除</button>' +
        '</span></li>';
    }).join('');
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>账户</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body"><ul class="rows">' + rows + '</ul>' +
      '<button class="btn btn--block" data-act="account-form">＋ 新建账户</button>' +
      '<p class="hint">余额 = 初始余额 + 收入 − 支出 + 转入 − 转出</p></div></div>';
  }

  function accountFormHTML() {
    var f = S.form;
    var types = [{ t: 'ewallet', n: '电子钱包' }, { t: 'debit', n: '储蓄卡' }, { t: 'credit', n: '信用卡' }, { t: 'cash', n: '现金' }];
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>' + (f.id ? '编辑账户' : '新建账户') + '</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<label class="field"><span>名称</span><input id="f-name" type="text" maxlength="10" placeholder="例如：招商银行" value="' + esc(f.name || '') + '"></label>' +
      '<label class="field"><span>初始余额</span><input id="f-initial" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="' + (f.initial === '' || f.initial == null ? '' : f.initial) + '"></label>' +
      '<div class="field"><span>类型</span><div class="chip-row chip-row--wrap">' +
      types.map(function (o) {
        return '<button class="chip' + (f.type === o.t ? ' on' : '') + '" data-act="f-type" data-id="' + o.t + '">' + o.n + '</button>';
      }).join('') + '</div></div>' +
      '<button class="btn btn--block" data-act="save-account">保存</button>' +
      '</div></div>';
  }

  function categoriesSheetHTML() {
    var list = allCategories(S.catTab);
    var grid = list.map(function (c) {
      return '<button class="cat-tile" data-act="category-form" data-id="' + c.id + '">' +
        '<span class="cat-cell-ico" style="background:' + hexA(c.color, 0.14) + '">' + esc(c.icon) + '</span>' +
        '<span class="cat-cell-name">' + esc(c.name) + '</span></button>';
    }).join('');
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>分类</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<div class="seg seg--wide">' +
      '<button class="' + (S.catTab === 'expense' ? 'on' : '') + '" data-act="cat-tab" data-kind="expense">支出分类</button>' +
      '<button class="' + (S.catTab === 'income' ? 'on' : '') + '" data-act="cat-tab" data-kind="income">收入分类</button>' +
      '</div>' +
      '<div class="cat-grid cat-grid--manage">' + grid +
      '<button class="cat-tile cat-tile--add" data-act="category-form"><span class="cat-add">＋</span><span class="cat-cell-name">新增</span></button>' +
      '</div></div></div>';
  }

  var ICON_CHOICES = ['🍜', '🍚', '☕', '🚌', '🚇', '🚕', '🛍️', '👕', '🏠', '💡', '💧', '🎮', '🎬', '🎵', '💊', '🏥', '📚', '✏️', '🎁', '🧧', '📱', '🐱', '✈️', '🏋️', '💰', '💼', '📈', '🧾', '✨', '❓'];
  var COLOR_CHOICES = ['#f97316', '#ef4444', '#f43f5e', '#ec4899', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#16a34a', '#eab308', '#94a3b8'];

  function categoryFormHTML() {
    var f = S.form;
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>' + (f.id ? '编辑分类' : '新建分类') + '</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<label class="field"><span>名称</span><input id="f-name" type="text" maxlength="8" placeholder="例如：咖啡" value="' + esc(f.name || '') + '"></label>' +
      '<div class="field"><span>图标</span><div class="icon-grid">' +
      ICON_CHOICES.map(function (ic) {
        return '<button class="icon-cell' + (f.icon === ic ? ' on' : '') + '" data-act="f-icon" data-id="' + ic + '">' + ic + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span>颜色</span><div class="color-row">' +
      COLOR_CHOICES.map(function (co) {
        return '<button class="color-dot' + (f.color === co ? ' on' : '') + '" style="background:' + co + '" data-act="f-color" data-id="' + co + '"></button>';
      }).join('') + '</div></div>' +
      '<button class="btn btn--block" data-act="save-category">保存</button>' +
      (f.id ? '<button class="del-line" data-act="del-category">删除这个分类</button>' : '') +
      '</div></div>';
  }

  function budgetFormHTML() {
    var f = S.form;
    var isCat = f.scope === 'category';
    var expCats = allCategories('expense');
    var selectedCat = f.categoryId || (expCats[0] ? expCats[0].id : '');
    return '<div class="sheet-wrap">' +
      '<div class="sheet-head"><h3>' + (f.id ? '修改预算' : '添加预算') + '</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<div class="seg seg--wide">' +
      '<button class="' + (!isCat ? 'on' : '') + '" data-act="f-scope" data-id="total">总预算</button>' +
      '<button class="' + (isCat ? 'on' : '') + '" data-act="f-scope" data-id="category">分类预算</button>' +
      '</div>' +
      (isCat ? '<div class="field"><span>分类</span><div class="chip-row chip-row--wrap">' +
        expCats.map(function (c) {
          return '<button class="chip' + (selectedCat === c.id ? ' on' : '') + '" data-act="f-cat" data-id="' + c.id + '">' + esc(c.icon) + ' ' + esc(c.name) + '</button>';
        }).join('') + '</div></div>' : '') +
      '<label class="field"><span>每月上限</span><input id="f-amount" type="number" inputmode="decimal" step="1" min="0" placeholder="0" value="' + (f.amount == null ? '' : f.amount) + '"></label>' +
      '<button class="btn btn--block" data-act="save-budget">保存</button>' +
      (f.id ? '<button class="del-line" data-act="del-budget">删除这个预算</button>' : '') +
      '</div></div>';
  }

  function monthSheetHTML() {
    var year = Number(S.ym.slice(0, 4));
    var cur = C.currentYM();
    var cells = '';
    for (var m = 1; m <= 12; m++) {
      var ym = year + '-' + C.pad2(m);
      var on = ym === S.ym;
      var disabled = ym > cur;
      cells += '<button class="month-cell' + (on ? ' on' : '') + '" data-act="pick-month" data-ym="' + ym + '"' + (disabled ? ' disabled' : '') + '>' + m + '月</button>';
    }
    return '<div class="sheet-wrap sheet-wrap--auto">' +
      '<div class="sheet-head"><h3>选择月份</h3><button class="close-btn" data-act="close-sheet">' + ICONS.close + '</button></div>' +
      '<div class="sheet-body">' +
      '<div class="year-nav"><button class="icon-btn" data-act="year-prev">' + ICONS.chevronL + '</button>' +
      '<b>' + year + ' 年</b><button class="icon-btn" data-act="year-next"' + (year >= Number(cur.slice(0, 4)) ? ' disabled' : '') + '>' + ICONS.chevronR + '</button></div>' +
      '<div class="month-grid">' + cells + '</div>' +
      '</div></div>';
  }

  function confirmHTML() {
    var f = S.sheet;
    return '<div class="dialog-wrap"><div class="dialog">' +
      '<h3>' + esc(f.title) + '</h3>' +
      '<p>' + esc(f.message) + '</p>' +
      '<div class="dialog-actions">' +
      '<button class="btn btn--ghost" data-act="close-sheet">取消</button>' +
      '<button class="btn ' + (f.danger ? 'btn--danger' : '') + '" data-act="confirm-ok">' + esc(f.confirmText || '确定') + '</button>' +
      '</div></div></div>';
  }

  /* ================================================================== *
   * 面板渲染
   * ================================================================== */
  function renderSheet() {
    var root = document.getElementById('sheet-root');
    var html = '';
    switch (S.sheet.name) {
      case 'record': html = recordSheetHTML(); break;
      case 'ledgers': html = ledgerSheetHTML(); break;
      case 'ledger-form': html = ledgerFormHTML(); break;
      case 'accounts': html = accountsSheetHTML(); break;
      case 'account-form': html = accountFormHTML(); break;
      case 'categories': html = categoriesSheetHTML(); break;
      case 'category-form': html = categoryFormHTML(); break;
      case 'budget-form': html = budgetFormHTML(); break;
      case 'month': html = monthSheetHTML(); break;
      case 'confirm': html = confirmHTML(); break;
    }
    root.innerHTML = '<div class="sheet-backdrop" data-act="close-sheet"></div>' + html;
  }

  function openSheet(name, data) {
    S.sheet = Object.assign({ name: name }, data || {});
    renderSheet();
  }

  function closeSheet() {
    // 从确认框返回时，先回到它下面的那个面板
    if (S.sheet && S.sheet.back) {
      S.sheet = S.sheet.back;
      renderSheet();
      return;
    }
    S.sheet = null;
    S.rec = null;
    S.form = null;
    document.getElementById('sheet-root').innerHTML = '';
  }

  function confirmSheet(opts) {
    var back = S.sheet && S.sheet.name !== 'confirm' ? S.sheet : null;
    opts.back = back;
    openSheet('confirm', opts);
  }

  /* ================================================================== *
   * 动作处理
   * ================================================================== */
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var ds = el.dataset;

    switch (act) {
      /* ---- 导航 ---- */
      case 'go': location.hash = '#/' + ds.tab; break;
      case 'month-prev': S.ym = C.ymAdd(S.ym, -1); render(); break;
      case 'month-next':
        if (S.ym < C.currentYM()) { S.ym = C.ymAdd(S.ym, 1); render(); }
        break;
      case 'month-pick': openSheet('month'); break;
      case 'year-prev': S.ym = (Number(S.ym.slice(0, 4)) - 1) + '-' + S.ym.slice(5); renderSheet(); break;
      case 'year-next':
        if (Number(S.ym.slice(0, 4)) < Number(C.currentYM().slice(0, 4))) {
          S.ym = (Number(S.ym.slice(0, 4)) + 1) + '-' + S.ym.slice(5);
          renderSheet();
        }
        break;
      case 'pick-month': S.ym = ds.ym; closeSheet(); render(); break;
      case 'stats-kind': S.statsKind = ds.kind; render(); redrawCharts(); break;

      /* ---- 记账 ---- */
      case 'add-tx': openRecord(null); break;
      case 'edit-tx': openRecord(id); break;
      case 'rec-kind':
        if (S.rec.kind === ds.kind) break;
        S.rec.kind = ds.kind;
        // 切换收支时，原来选的分类可能不属于新类型，需要重选
        var curCat = cat(S.rec.categoryId);
        if (ds.kind === 'transfer') {
          S.rec.categoryId = null;
        } else if (!curCat || curCat.kind !== ds.kind) {
          var f = allCategories(ds.kind)[0];
          S.rec.categoryId = f ? f.id : null;
        }
        markSelected('[data-act="rec-kind"]', 'data-kind', ds.kind);
        document.querySelector('.rec-mid').innerHTML = midHTML();
        break;
      case 'rec-cat':
        S.rec.categoryId = id;
        markSelected('.cat-cell', 'data-id', id);
        break;
      case 'rec-acc':
        S.rec.accountId = id;
        markSelected('.chip[data-act="rec-acc"]', 'data-id', id);
        break;
      case 'rec-from':
        S.rec.accountId = id;
        markSelected('.chip[data-act="rec-from"]', 'data-id', id);
        break;
      case 'rec-to':
        S.rec.toAccountId = id;
        markSelected('.chip[data-act="rec-to"]', 'data-id', id);
        break;
      case 'key': keyPress(ds.key); break;
      case 'save-tx': saveRecord(); break;
      case 'del-tx': askDeleteTx(); break;

      /* ---- 账本 ---- */
      case 'open-ledgers': openSheet('ledgers'); break;
      case 'switch-ledger':
        S.db.activeLedgerId = id;
        save(true);
        closeSheet();
        S.statsCache = null;
        render();
        toast('已切换账本');
        break;
      case 'ledger-form':
        S.form = id ? { id: id, name: (S.db.ledgers.filter(function (l) { return l.id === id; })[0] || {}).name } : { id: null, name: '' };
        openSheet('ledger-form');
        setTimeout(function () { var n = document.getElementById('f-name'); if (n) n.focus(); }, 60);
        break;
      case 'save-ledger': saveLedger(); break;
      case 'del-ledger': askDeleteLedger(id); break;

      /* ---- 账户 / 分类 ---- */
      case 'open-accounts': openSheet('accounts'); break;
      case 'account-form':
        S.form = id
          ? (function () { var a = acc(id); return { id: a.id, name: a.name, initial: a.initial, type: a.type }; })()
          : { id: null, name: '', initial: '', type: 'ewallet' };
        openSheet('account-form');
        break;
      case 'f-type': S.form.type = ds.id; renderSheet(); break;
      case 'save-account': saveAccount(); break;
      case 'del-account': askDeleteAccount(id); break;

      case 'open-categories': openSheet('categories'); break;
      case 'cat-tab': S.catTab = ds.kind; renderSheet(); break;
      case 'category-form':
        S.form = id
          ? (function () { var c = cat(id); return { id: c.id, name: c.name, icon: c.icon, color: c.color, kind: c.kind }; })()
          : { id: null, name: '', icon: ICON_CHOICES[0], color: COLOR_CHOICES[0], kind: S.catTab };
        openSheet('category-form');
        break;
      case 'f-icon': S.form.icon = id; renderSheet(); break;
      case 'f-color': S.form.color = id; renderSheet(); break;
      case 'save-category': saveCategory(); break;
      case 'del-category': askDeleteCategory(S.form.id); break;
      case 'del-category': askDeleteCategory(id); break;

      /* ---- 预算 ---- */
      case 'edit-budget':
        if (ds.scope === 'total') {
          var tb = S.db.budgets.filter(function (b) { return b.ledgerId === lid() && b.scope === 'total'; })[0];
          S.form = { id: tb ? tb.id : null, scope: 'total', categoryId: null, amount: tb ? tb.amount : '' };
        } else if (id) {
          var bb = S.db.budgets.filter(function (b) { return b.id === id; })[0];
          S.form = { id: bb.id, scope: 'category', categoryId: bb.categoryId, amount: bb.amount };
        } else {
          S.form = { id: null, scope: 'category', categoryId: '', amount: '' };
        }
        openSheet('budget-form');
        break;
      case 'f-scope': S.form.scope = ds.id; renderSheet(); break;
      case 'f-cat': S.form.categoryId = id; renderSheet(); break;
      case 'save-budget': saveBudget(); break;
      case 'del-budget': askDeleteBudget(); break;

      /* ---- 数据 ---- */
      case 'export': exportData(); break;
      case 'import': importData(); break;
      case 'reset': askReset(); break;
      case 'confirm-ok': runConfirm(); break;
      case 'close-sheet': closeSheet(); break;
    }
  }

  /* ---------- 键盘记账 ---------- */
  function keyPress(k) {
    var r = S.rec;
    if (!r) return;
    var s = r.amountStr;
    if (k === 'del') {
      s = s.slice(0, -1);
    } else if (k === '.') {
      if (s.indexOf('.') < 0) s = (s === '' ? '0' : s) + '.';
    } else {
      var parts = s.split('.');
      if (parts[1] !== undefined && parts[1].length >= 2) return;
      if (parts[1] === undefined && parts[0].length >= 7) return;
      if (s === '0') s = k;
      else s += k;
    }
    r.amountStr = s;
    var disp = document.getElementById('amount-display');
    if (disp) disp.textContent = displayAmount(s);
    var btn = document.querySelector('[data-act="save-tx"]');
    if (btn) btn.classList.toggle('is-ready', parseFloat(s) > 0);
  }

  /* ---------- 保存一笔 ---------- */
  function saveRecord() {
    var r = S.rec;
    var amount = C.round2(parseFloat(r.amountStr));
    if (!(amount > 0)) { toast('请输入金额'); return; }
    if (r.kind === 'transfer') {
      if (!r.accountId || !r.toAccountId) { toast('请选择转出和转入账户'); return; }
      if (r.accountId === r.toAccountId) { toast('转出和转入不能是同一个账户'); return; }
    } else if (!r.categoryId) {
      toast('请选择一个分类'); return;
    }

    var now = Date.now();
    var noteEl = document.getElementById('rec-note');
    if (noteEl) r.note = noteEl.value;
    var payload = {
      kind: r.kind,
      amount: amount,
      date: r.date,
      categoryId: r.kind === 'transfer' ? null : r.categoryId,
      accountId: r.accountId,
      toAccountId: r.kind === 'transfer' ? r.toAccountId : null,
      note: String(r.note || '').trim()
    };

    if (r.id) {
      S.db.txs.forEach(function (t) { if (t.id === r.id) Object.assign(t, payload, { updatedAt: now }); });
    } else {
      S.db.txs.push(Object.assign({ id: C.uid('t'), ledgerId: lid(), createdAt: now }, payload));
    }
    activeLedger().lastAccountId = r.accountId;
    S.ym = r.date.slice(0, 7);
    save(true);
    var edited = !!r.id;
    closeSheet();
    if (S.tab === 'stats') S.statsCache = null;
    render();
    redrawCharts();
    toast(edited ? '已更新' : '记好了');
  }

  function askDeleteTx() {
    var id = S.rec.id;
    confirmSheet({
      title: '删除这笔记录？',
      message: '删除后不可恢复。',
      confirmText: '删除',
      danger: true,
      onOk: function () {
        S.db.txs = S.db.txs.filter(function (t) { return t.id !== id; });
        save(true);
        closeSheet();
        render();
        redrawCharts();
        toast('已删除');
      }
    });
  }

  /* ---------- 账本 ---------- */
  function saveLedger() {
    var nameEl = document.getElementById('f-name');
    var name = (nameEl ? nameEl.value : '').trim();
    if (!name) { toast('请输入账本名称'); return; }
    if (S.form.id) {
      S.db.ledgers.forEach(function (l) { if (l.id === S.form.id) l.name = name; });
    } else {
      var bundle = C.createLedgerBundle(name);
      S.db.ledgers.push(bundle.ledger);
      S.db.accounts = S.db.accounts.concat(bundle.accounts);
      S.db.categories = S.db.categories.concat(bundle.categories);
      S.db.budgets = S.db.budgets.concat(bundle.budgets);
      S.db.activeLedgerId = bundle.ledger.id;
    }
    save(true);
    closeSheet();
    render();
    toast('已保存');
  }

  function askDeleteLedger(id) {
    if (S.db.ledgers.length <= 1) { toast('至少要保留一个账本'); return; }
    var l = S.db.ledgers.filter(function (x) { return x.id === id; })[0];
    confirmSheet({
      title: '删除账本',
      message: '「' + l.name + '」及其全部记录都会被删除，不可恢复。',
      confirmText: '删除',
      danger: true,
      onOk: function () {
        S.db.ledgers = S.db.ledgers.filter(function (x) { return x.id !== id; });
        S.db.txs = S.db.txs.filter(function (t) { return t.ledgerId !== id; });
        S.db.accounts = S.db.accounts.filter(function (a) { return a.ledgerId !== id; });
        S.db.categories = S.db.categories.filter(function (c) { return c.ledgerId !== id; });
        S.db.budgets = S.db.budgets.filter(function (b) { return b.ledgerId !== id; });
        if (S.db.activeLedgerId === id) S.db.activeLedgerId = S.db.ledgers[0].id;
        save(true);
        closeSheet();
        render();
        toast('已删除');
      }
    });
  }

  /* ---------- 账户 ---------- */
  function saveAccount() {
    var f = S.form;
    var name = (document.getElementById('f-name').value || '').trim();
    var initial = C.round2(parseFloat(document.getElementById('f-initial').value) || 0);
    if (!name) { toast('请输入账户名称'); return; }
    if (f.id) {
      S.db.accounts.forEach(function (a) {
        if (a.id === f.id) { a.name = name; a.initial = initial; a.type = f.type; }
      });
    } else {
      var order = allAccounts().length;
      S.db.accounts.push({ id: C.uid('a'), ledgerId: lid(), name: name, type: f.type, initial: initial, order: order });
    }
    save(true);
    openSheet('accounts');
    toast('已保存');
  }

  function askDeleteAccount(id) {
    var a = acc(id);
    var used = S.db.txs.filter(function (t) { return t.accountId === id || t.toAccountId === id; }).length;
    confirmSheet({
      title: '删除账户',
      message: used > 0
        ? '「' + a.name + '」有 ' + used + ' 笔记录关联，删除后这些记录会显示为未知账户。'
        : '确定删除「' + a.name + '」？',
      confirmText: '删除',
      danger: true,
      onOk: function () {
        S.db.accounts = S.db.accounts.filter(function (x) { return x.id !== id; });
        save(true);
        openSheet('accounts');
        render();
        toast('已删除');
      }
    });
  }

  /* ---------- 分类 ---------- */
  function saveCategory() {
    var f = S.form;
    var name = (document.getElementById('f-name').value || '').trim();
    if (!name) { toast('请输入分类名称'); return; }
    if (f.id) {
      S.db.categories.forEach(function (c) {
        if (c.id === f.id) { c.name = name; c.icon = f.icon; c.color = f.color; }
      });
    } else {
      var order = allCategories(f.kind).length;
      S.db.categories.push({
        id: C.uid('c'), ledgerId: lid(), kind: f.kind, name: name,
        icon: f.icon, color: f.color, order: order
      });
    }
    save(true);
    openSheet('categories');
    render();
    toast('已保存');
  }

  function askDeleteCategory(id) {
    var c = cat(id);
    var used = S.db.txs.filter(function (t) { return t.categoryId === id; }).length;
    confirmSheet({
      title: '删除分类',
      message: used > 0 ? '「' + c.name + '」下有 ' + used + ' 笔记录，删除后这些记录会变成「未分类」。' : '确定删除「' + c.name + '」？',
      confirmText: '删除',
      danger: true,
      onOk: function () {
        S.db.categories = S.db.categories.filter(function (x) { return x.id !== id; });
        S.db.txs.forEach(function (t) { if (t.categoryId === id) t.categoryId = null; });
        S.db.budgets = S.db.budgets.filter(function (b) { return b.categoryId !== id; });
        save(true);
        openSheet('categories');
        render();
        toast('已删除');
      }
    });
  }

  /* ---------- 预算 ---------- */
  function saveBudget() {
    var f = S.form;
    var amount = C.round2(parseFloat(document.getElementById('f-amount').value) || 0);
    if (!(amount > 0)) { toast('请输入预算金额'); return; }

    if (f.scope === 'category' && !f.categoryId) { toast('请选择分类'); return; }

    if (f.id) {
      S.db.budgets.forEach(function (b) {
        if (b.id === f.id) {
          b.amount = amount;
          if (f.scope === 'category') b.categoryId = f.categoryId;
        }
      });
    } else {
      S.db.budgets.push({
        id: C.uid('b'), ledgerId: lid(), scope: f.scope,
        categoryId: f.scope === 'category' ? f.categoryId : null, amount: amount
      });
    }
    save(true);
    closeSheet();
    render();
    toast('已保存');
  }

  function askDeleteBudget() {
    var id = S.form.id;
    confirmSheet({
      title: '删除预算',
      message: '删除后不再按此预算提醒。',
      confirmText: '删除',
      danger: true,
      onOk: function () {
        S.db.budgets = S.db.budgets.filter(function (b) { return b.id !== id; });
        save(true);
        closeSheet();
        render();
        toast('已删除');
      }
    });
  }

  /* ---------- 数据 ---------- */
  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(S.db, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '记一笔-备份-' + C.todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('备份已导出');
    } catch (e) {
      toast('导出失败');
    }
  }

  function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(String(reader.result)); } catch (e) { toast('文件不是有效的备份'); return; }
        if (!C.isValidDb(data)) { toast('备份文件格式不对'); return; }
        confirmSheet({
          title: '导入备份',
          message: '导入会覆盖当前全部数据（' + S.db.txs.length + ' 笔记录），确定吗？',
          confirmText: '覆盖导入',
          danger: true,
          onOk: function () {
            S.db = C.normalizeDb(data);
            save(true);
            closeSheet();
            S.statsCache = null;
            render();
            toast('导入成功');
          }
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function askReset() {
    confirmSheet({
      title: '清空所有数据',
      message: '所有账本、账户、分类和记录都会被删除，且无法恢复。建议先导出备份。',
      confirmText: '全部清空',
      danger: true,
      onOk: function () {
        localStorage.removeItem(STORE_KEY);
        S.db = C.createSeedData({});
        S.db.settings.seededDemo = false;
        save(true);
        closeSheet();
        S.statsCache = null;
        location.hash = '#/home';
        render();
        toast('已清空');
      }
    });
  }

  function runConfirm() {
    var fn = S.sheet.onOk;
    S.sheet.back = null; // 确认后要真正关闭
    if (typeof fn === 'function') fn();
  }

  /* ================================================================== *
   * 启动
   * ================================================================== */
  function boot() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }

    var db = null;
    if (raw) {
      try { db = JSON.parse(raw); } catch (e) { db = null; }
    }

    if (db && C.isValidDb(db)) {
      S.db = C.normalizeDb(db);
    } else {
      var demo = /[?&]demo=1/.test(location.search);
      S.db = C.createSeedData({ demo: demo });
      persist();
    }

    S.ym = C.currentYM();
    route();

    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', route);
    window.addEventListener('resize', redrawCharts);
    document.addEventListener('keydown', function (e) {
      if (!S.sheet || S.sheet.name !== 'record') return;
      if (e.key >= '0' && e.key <= '9') { keyPress(e.key); e.preventDefault(); }
      else if (e.key === '.') { keyPress('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { keyPress('del'); e.preventDefault(); }
      else if (e.key === 'Enter') { saveRecord(); e.preventDefault(); }
      else if (e.key === 'Escape') { closeSheet(); }
    });

    // 输入框内容实时同步到状态，避免重绘丢失
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t.id) return;
      if (t.id === 'rec-note' && S.rec) S.rec.note = t.value;
      if (t.id === 'rec-date' && S.rec) {
        S.rec.date = t.value;
        var lb = document.getElementById('rec-date-label');
        if (lb) lb.textContent = C.dayLabel(t.value);
      }
    });

    registerSW();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').catch(function () { /* 离线能力不可用不影响使用 */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
