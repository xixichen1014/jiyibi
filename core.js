/*!
 * 记一笔 · core.js
 * 纯数据层：日期 / 金额工具、统计聚合、预算计算、种子数据。
 * 不依赖 DOM，可在浏览器（window.LedgerCore）和 Node（module.exports）中复用。
 */
(function (root, factory) {
  var api = factory();
  root.LedgerCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DB_VERSION = 1;

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */
  function pad2(n) { return String(n).padStart(2, '0'); }

  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function currentYM(d) { return todayISO(d).slice(0, 7); }

  function ymOf(dateStr) { return String(dateStr || '').slice(0, 7); }

  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function daysInMonth(ym) {
    var p = ym.split('-');
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }

  function ymAdd(ym, delta) {
    var p = ym.split('-');
    var idx = Number(p[0]) * 12 + (Number(p[1]) - 1) + delta;
    var y = Math.floor(idx / 12);
    var m = idx % 12 + 1;
    return y + '-' + pad2(m);
  }

  function monthLabel(ym) {
    var p = ym.split('-');
    return Number(p[0]) + '年' + Number(p[1]) + '月';
  }

  function shortMonthLabel(ym) {
    var p = ym.split('-');
    return Number(p[1]) + '月';
  }

  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function weekdayLabel(dateStr) { return WEEKDAYS[parseYMD(dateStr).getDay()]; }

  function dayLabel(dateStr, now) {
    var t = todayISO(now);
    var one = 86400000;
    var base = now ? new Date(now) : new Date();
    base.setHours(12, 0, 0, 0);
    var yest = todayISO(new Date(base.getTime() - one));
    var before = todayISO(new Date(base.getTime() - 2 * one));
    if (dateStr === t) return '今天';
    if (dateStr === yest) return '昨天';
    if (dateStr === before) return '前天';
    var d = parseYMD(dateStr);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function round2(n) {
    if (!isFinite(n)) return 0;
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function toNum(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /** 金额格式化：1234.5 -> "1,234.50" */
  function fmtMoney(n, decimals) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    var d = decimals === undefined ? 2 : decimals;
    var neg = n < 0;
    var s = Math.abs(n).toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  /** 图表轴用的短金额：12345 -> "1.2万" */
  function fmtShort(n) {
    n = Number(n) || 0;
    var abs = Math.abs(n);
    if (abs >= 100000000) return (n / 100000000).toFixed(abs >= 1000000000 ? 0 : 1) + '亿';
    if (abs >= 10000) return (n / 10000).toFixed(abs >= 100000 ? 0 : 1) + '万';
    if (abs >= 1000) return (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
    return String(Math.round(n));
  }

  /** 输入框回填用：去掉多余的 0 */
  function plainNum(n) {
    var v = round2(toNum(n));
    return String(v);
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7);
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /* ------------------------------------------------------------------ *
   * 种子数据
   * ------------------------------------------------------------------ */
  var EXPENSE_SEED = [
    { name: '餐饮', icon: '🍜', color: '#f97316', weight: 9, base: 28 },
    { name: '交通', icon: '🚌', color: '#3b82f6', weight: 5, base: 12 },
    { name: '购物', icon: '🛍️', color: '#ec4899', weight: 4, base: 120 },
    { name: '居住', icon: '🏠', color: '#8b5cf6', weight: 2, base: 900 },
    { name: '娱乐', icon: '🎮', color: '#06b6d4', weight: 3, base: 60 },
    { name: '医疗', icon: '💊', color: '#ef4444', weight: 1, base: 80 },
    { name: '学习', icon: '📚', color: '#6366f1', weight: 2, base: 70 },
    { name: '人情', icon: '🎁', color: '#f43f5e', weight: 1, base: 200 },
    { name: '通讯', icon: '📱', color: '#0ea5e9', weight: 1, base: 50 },
    { name: '其他', icon: '✨', color: '#94a3b8', weight: 2, base: 40 }
  ];

  var INCOME_SEED = [
    { name: '工资', icon: '💼', color: '#16a34a', weight: 1, base: 8000 },
    { name: '奖金', icon: '🏆', color: '#eab308', weight: 1, base: 1500 },
    { name: '兼职', icon: '🧾', color: '#14b8a6', weight: 1, base: 600 },
    { name: '理财', icon: '📈', color: '#0d9488', weight: 1, base: 300 },
    { name: '红包', icon: '🧧', color: '#dc2626', weight: 1, base: 200 },
    { name: '其他', icon: '✨', color: '#94a3b8', weight: 1, base: 100 }
  ];

  var ACCOUNT_SEED = [
    { name: '微信', type: 'ewallet', initial: 0 },
    { name: '支付宝', type: 'ewallet', initial: 0 },
    { name: '银行卡', type: 'debit', initial: 0 },
    { name: '现金', type: 'cash', initial: 0 }
  ];

  function makeCategories(ledgerId, kind, seedList) {
    return seedList.map(function (c, i) {
      return {
        id: uid('c'),
        ledgerId: ledgerId,
        kind: kind,
        name: c.name,
        icon: c.icon,
        color: c.color,
        base: c.base,
        weight: c.weight || 1,
        order: i
      };
    });
  }

  /**
   * 创建一个新账本（含默认账户、分类、预算）。
   * 返回 { ledger, accounts, categories, budgets }
   */
  function createLedgerBundle(name, opts) {
    opts = opts || {};
    var ledgerId = uid('l');
    var accounts = ACCOUNT_SEED.map(function (a, i) {
      return { id: uid('a'), ledgerId: ledgerId, name: a.name, type: a.type, initial: toNum(a.initial), order: i };
    });
    var categories = makeCategories(ledgerId, 'expense', EXPENSE_SEED)
      .concat(makeCategories(ledgerId, 'income', INCOME_SEED));
    var budgets = opts.withBudget === false ? [] : [
      { id: uid('b'), ledgerId: ledgerId, scope: 'total', categoryId: null, amount: 6000 }
    ];
    return {
      ledger: { id: ledgerId, name: name || '日常账本', createdAt: new Date().toISOString() },
      accounts: accounts,
      categories: categories,
      budgets: budgets
    };
  }

  function emptyDb() {
    return {
      version: DB_VERSION,
      activeLedgerId: null,
      ledgers: [],
      accounts: [],
      categories: [],
      txs: [],
      budgets: [],
      settings: { currency: '¥', seededDemo: false }
    };
  }

  /** 首次启动的基础数据（空账本，不造假记录） */
  function createSeedData(opts) {
    opts = opts || {};
    var db = emptyDb();
    var bundle = createLedgerBundle('日常账本');
    db.ledgers.push(bundle.ledger);
    db.accounts = bundle.accounts;
    db.categories = bundle.categories;
    db.budgets = bundle.budgets;
    db.activeLedgerId = bundle.ledger.id;
    if (opts.demo) {
      seedDemo(db, bundle.ledger.id);
      db.settings.seededDemo = true;
    }
    return db;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(list, rand) {
    var total = list.reduce(function (s, c) { return s + (c.weight || 1); }, 0);
    var r = rand() * total;
    for (var i = 0; i < list.length; i++) {
      r -= (list[i].weight || 1);
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  /** 生成最近 3 个月的示例流水，方便第一次打开就能看到统计效果 */
  function seedDemo(db, ledgerId) {
    var rand = mulberry32(2026);
    var expCats = db.categories.filter(function (c) { return c.ledgerId === ledgerId && c.kind === 'expense'; });
    var incCats = db.categories.filter(function (c) { return c.ledgerId === ledgerId && c.kind === 'income'; });
    var accs = db.accounts.filter(function (a) { return a.ledgerId === ledgerId; });
    var today = new Date();
    var nowYM = currentYM(today);
    var rentCat = expCats.filter(function (c) { return c.name === '居住'; })[0] || null;
    var dailyPool = expCats.filter(function (c) { return !rentCat || c.id !== rentCat.id; });

    for (var k = 2; k >= 0; k--) {
      var ym = ymAdd(nowYM, -k);
      var dim = daysInMonth(ym);
      var maxDay = ym === nowYM ? today.getDate() : dim;

      // 每月一笔房租，金额稳定
      if (rentCat) {
        db.txs.push({
          id: uid('t'), ledgerId: ledgerId, kind: 'expense',
          amount: round2(1600 + rand() * 600),
          date: ym + '-01', categoryId: rentCat.id, accountId: (accs[2] || accs[0]).id,
          note: '房租', createdAt: new Date(ym + '-01').getTime()
        });
      }

      for (var d = 1; d <= maxDay; d++) {
        var n = Math.floor(rand() * 3.2);
        for (var i = 0; i < n; i++) {
          var cat = pickWeighted(dailyPool, rand);
          var amount = round2(cat.base * (0.35 + rand() * 1.7));
          if (amount < 1) amount = 1;
          db.txs.push({
            id: uid('t'),
            ledgerId: ledgerId,
            kind: 'expense',
            amount: amount,
            date: ym + '-' + pad2(d),
            categoryId: cat.id,
            accountId: accs[Math.floor(rand() * accs.length)].id,
            note: '',
            createdAt: new Date(ym + '-' + pad2(d)).getTime() + i * 1000
          });
        }
      }
      var salary = incCats[0];
      db.txs.push({
        id: uid('t'), ledgerId: ledgerId, kind: 'income', amount: 8200 + Math.round(rand() * 900),
        date: ym + '-10', categoryId: salary.id, accountId: (accs[2] || accs[0]).id,
        note: '月薪', createdAt: new Date(ym + '-10').getTime()
      });
      if (rand() > 0.45) {
        var bonus = incCats[4] || incCats[incCats.length - 1];
        db.txs.push({
          id: uid('t'), ledgerId: ledgerId, kind: 'income', amount: 200 + Math.round(rand() * 400),
          date: ym + '-' + pad2(Math.max(1, Math.floor(rand() * dim))), categoryId: bonus.id,
          accountId: accs[0].id, note: '红包', createdAt: Date.now() - 3600000
        });
      }
    }

    // 分类预算，制造一两条超支，方便看到提醒效果
    var byName = {};
    db.categories.forEach(function (c) { byName[c.name + '|' + c.kind] = c; });
    [
      ['餐饮', 1200], ['交通', 300], ['购物', 800], ['娱乐', 300]
    ].forEach(function (pair) {
      var c = byName[pair[0] + '|expense'];
      if (c) db.budgets.push({ id: uid('b'), ledgerId: ledgerId, scope: 'category', categoryId: c.id, amount: pair[1] });
    });

    // 让示例账户的期末余额看起来合理：按目标余额倒推初始余额
    var targetRange = { ewallet: [800, 1600], cash: [100, 400], debit: [0, 0], credit: [0, 0] };
    accs.forEach(function (a) {
      var net = 0;
      db.txs.forEach(function (t) {
        if (t.ledgerId !== ledgerId) return;
        if (t.accountId === a.id) net += (t.kind === 'income' ? t.amount : -t.amount);
        if (t.toAccountId === a.id) net += t.amount;
      });
      var range = targetRange[a.type] || [0, 0];
      var target = range[0] + rand() * (range[1] - range[0]);
      a.initial = round2(Math.max(0, target - net));
    });

    db.txs.sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0);
    });
    return db;
  }

  /* ------------------------------------------------------------------ *
   * 数据的兜底与校验
   * ------------------------------------------------------------------ */
  var ARRAY_FIELDS = ['ledgers', 'accounts', 'categories', 'txs', 'budgets'];

  function normalizeDb(db) {
    if (!db || typeof db !== 'object') return null;
    ARRAY_FIELDS.forEach(function (k) { if (!Array.isArray(db[k])) db[k] = []; });
    db.version = toNum(db.version) || DB_VERSION;
    db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
    if (!db.settings.currency) db.settings.currency = '¥';

    db.txs = db.txs.filter(function (t) { return t && t.id && t.date && toNum(t.amount) > 0; }).map(function (t) {
      t.amount = round2(toNum(t.amount));
      t.kind = t.kind === 'income' || t.kind === 'transfer' ? t.kind : 'expense';
      t.note = typeof t.note === 'string' ? t.note : '';
      t.createdAt = toNum(t.createdAt) || 0;
      return t;
    });

    if (!db.ledgers.length) {
      var bundle = createLedgerBundle('日常账本');
      db.ledgers.push(bundle.ledger);
      db.accounts = db.accounts.concat(bundle.accounts);
      db.categories = db.categories.concat(bundle.categories);
      db.budgets = db.budgets.concat(bundle.budgets);
    }
    var hasActive = db.ledgers.some(function (l) { return l.id === db.activeLedgerId; });
    if (!hasActive) db.activeLedgerId = db.ledgers[0].id;

    db.accounts.forEach(function (a, i) { a.initial = toNum(a.initial); a.order = toNum(a.order) || i; });
    db.categories.forEach(function (c, i) { c.order = toNum(c.order) || i; if (!c.color) c.color = '#94a3b8'; });
    db.budgets.forEach(function (b) { b.amount = toNum(b.amount); b.scope = b.scope === 'category' ? 'category' : 'total'; });
    return db;
  }

  function isValidDb(db) {
    return !!(db && typeof db === 'object' && Array.isArray(db.ledgers) &&
      Array.isArray(db.txs) && Array.isArray(db.accounts) && Array.isArray(db.categories));
  }

  /* ------------------------------------------------------------------ *
   * 查询与统计
   * ------------------------------------------------------------------ */
  function txsOf(db, ledgerId) {
    return db.txs.filter(function (t) { return t.ledgerId === ledgerId; });
  }

  /**
   * 某月流水，按日期倒序（同日按创建时间倒序）
   * opts: { kind: 'expense'|'income'|'transfer'|'all', accountId }
   */
  function monthTxs(db, ledgerId, ym, opts) {
    opts = opts || {};
    var out = [];
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId) continue;
      if (ymOf(t.date) !== ym) continue;
      if (opts.kind && opts.kind !== 'all' && t.kind !== opts.kind) continue;
      if (opts.accountId && t.accountId !== opts.accountId && t.toAccountId !== opts.accountId) continue;
      out.push(t);
    }
    out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return out;
  }

  /** 月度汇总，transfer 不计入收支 */
  function monthSummary(db, ledgerId, ym) {
    var income = 0, expense = 0, count = 0;
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId || ymOf(t.date) !== ym) continue;
      count++;
      if (t.kind === 'income') income += t.amount;
      else if (t.kind === 'expense') expense += t.amount;
    }
    income = round2(income); expense = round2(expense);
    return { ym: ym, income: income, expense: expense, net: round2(income - expense), count: count };
  }

  /** 某月分类占比（降序） */
  function categoryBreakdown(db, ledgerId, ym, kind) {
    kind = kind || 'expense';
    var catMap = {};
    db.categories.forEach(function (c) { catMap[c.id] = c; });
    var buckets = {};
    var total = 0;
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId || t.kind !== kind || ymOf(t.date) !== ym) continue;
      var key = t.categoryId || '__none';
      if (!buckets[key]) buckets[key] = { categoryId: t.categoryId || null, amount: 0, count: 0 };
      buckets[key].amount += t.amount;
      buckets[key].count++;
      total += t.amount;
    }
    var list = Object.keys(buckets).map(function (k) {
      var b = buckets[k];
      var c = b.categoryId ? catMap[b.categoryId] : null;
      return {
        categoryId: b.categoryId,
        name: c ? c.name : '未分类',
        icon: c ? c.icon : '❓',
        color: c ? c.color : '#cbd5e1',
        amount: round2(b.amount),
        count: b.count,
        pct: total > 0 ? round2(b.amount / total * 100) : 0
      };
    });
    list.sort(function (a, b) { return b.amount - a.amount; });
    return { total: round2(total), items: list };
  }

  /** 账户余额：初始余额 + 收入 - 支出 + 转入 - 转出 */
  function accountBalances(db, ledgerId) {
    var accs = db.accounts.filter(function (a) { return a.ledgerId === ledgerId; })
      .slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var bal = {};
    accs.forEach(function (a) { bal[a.id] = toNum(a.initial); });
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId) continue;
      if (t.kind === 'income') {
        if (bal[t.accountId] !== undefined) bal[t.accountId] += t.amount;
      } else if (t.kind === 'expense') {
        if (bal[t.accountId] !== undefined) bal[t.accountId] -= t.amount;
      } else if (t.kind === 'transfer') {
        if (bal[t.accountId] !== undefined) bal[t.accountId] -= t.amount;
        if (bal[t.toAccountId] !== undefined) bal[t.toAccountId] += t.amount;
      }
    }
    var total = 0;
    accs.forEach(function (a) { total += bal[a.id]; });
    return {
      total: round2(total),
      items: accs.map(function (a) {
        return { id: a.id, name: a.name, type: a.type, balance: round2(bal[a.id]) };
      })
    };
  }

  /** 近 n 个月的收支趋势（升序，最后一个是 endYM） */
  function monthlyTrend(db, ledgerId, endYM, n) {
    n = n || 6;
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var ym = ymAdd(endYM, -i);
      var s = monthSummary(db, ledgerId, ym);
      out.push({ ym: ym, label: shortMonthLabel(ym), income: s.income, expense: s.expense, net: s.net });
    }
    return out;
  }

  /** 某月每天支出（用于日历式热力/折线，暂用于统计） */
  function dailySpend(db, ledgerId, ym) {
    var days = daysInMonth(ym);
    var arr = [];
    for (var d = 1; d <= days; d++) arr.push({ day: d, date: ym + '-' + pad2(d), expense: 0, income: 0 });
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId || ymOf(t.date) !== ym) continue;
      var day = Number(t.date.slice(8, 10));
      if (!arr[day - 1]) continue;
      if (t.kind === 'expense') arr[day - 1].expense = round2(arr[day - 1].expense + t.amount);
      else if (t.kind === 'income') arr[day - 1].income = round2(arr[day - 1].income + t.amount);
    }
    return arr;
  }

  /**
   * 预算执行情况。
   * 预算是「每月重复」的：每个账本最多一条总预算 + 每条分类预算。
   */
  function budgetStatus(db, ledgerId, ym, todayStr) {
    var today = todayStr || todayISO();
    var isCurrent = ym === today.slice(0, 7);
    var dim = daysInMonth(ym);
    var dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : dim;
    var daysLeft = isCurrent ? dim - dayOfMonth + 1 : 0;

    var summary = monthSummary(db, ledgerId, ym);
    var spentByCat = {};
    for (var i = 0; i < db.txs.length; i++) {
      var t = db.txs[i];
      if (t.ledgerId !== ledgerId || t.kind !== 'expense' || ymOf(t.date) !== ym) continue;
      var k = t.categoryId || '__none';
      spentByCat[k] = (spentByCat[k] || 0) + t.amount;
    }

    var budgets = db.budgets.filter(function (b) { return b.ledgerId === ledgerId; });
    var totalB = null, catList = [];
    var catMap = {};
    db.categories.forEach(function (c) { catMap[c.id] = c; });

    budgets.forEach(function (b) {
      if (b.scope === 'total') {
        if (totalB) return;
        totalB = b;
      } else {
        catList.push(b);
      }
    });

    function pack(amount, spent) {
      var a = round2(amount);
      var s = round2(spent);
      var remaining = round2(a - s);
      var pct = a > 0 ? round2(s / a * 100) : (s > 0 ? 100 : 0);
      return {
        amount: a,
        spent: s,
        remaining: remaining,
        pct: pct,
        over: s > a,
        overAmount: remaining < 0 ? round2(-remaining) : 0,
        dailyAvailable: daysLeft > 0 && remaining > 0 ? round2(remaining / daysLeft) : 0
      };
    }

    var total = totalB ? pack(totalB.amount, summary.expense) : null;

    var cats = catList.map(function (b) {
      var c = catMap[b.categoryId];
      var row = pack(b.amount, spentByCat[b.categoryId || '__none'] || 0);
      row.budgetId = b.id;
      row.categoryId = b.categoryId;
      row.name = c ? c.name : '已删除分类';
      row.icon = c ? c.icon : '❓';
      row.color = c ? c.color : '#cbd5e1';
      return row;
    }).sort(function (a, b) { return b.pct - a.pct; });

    return {
      total: total,
      categories: cats,
      daysLeft: daysLeft,
      dayOfMonth: dayOfMonth,
      overCount: (total && total.over ? 1 : 0) + cats.filter(function (c) { return c.over; }).length
    };
  }

  /** 把流水按日期分组 */
  function groupByDay(txs) {
    var map = {}, order = [];
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      if (!map[t.date]) { map[t.date] = { date: t.date, items: [], expense: 0, income: 0 }; order.push(t.date); }
      map[t.date].items.push(t);
      if (t.kind === 'expense') map[t.date].expense = round2(map[t.date].expense + t.amount);
      if (t.kind === 'income') map[t.date].income = round2(map[t.date].income + t.amount);
    }
    order.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });
    return order.map(function (d) { return map[d]; });
  }

  return {
    DB_VERSION: DB_VERSION,
    // 工具
    pad2: pad2, todayISO: todayISO, currentYM: currentYM, ymOf: ymOf, parseYMD: parseYMD,
    daysInMonth: daysInMonth, ymAdd: ymAdd, monthLabel: monthLabel, shortMonthLabel: shortMonthLabel,
    weekdayLabel: weekdayLabel, dayLabel: dayLabel, round2: round2, toNum: toNum,
    fmtMoney: fmtMoney, fmtShort: fmtShort, plainNum: plainNum, uid: uid, clamp: clamp,
    // 数据
    createSeedData: createSeedData, createLedgerBundle: createLedgerBundle, emptyDb: emptyDb,
    normalizeDb: normalizeDb, isValidDb: isValidDb,
    // 查询
    txsOf: txsOf, monthTxs: monthTxs, monthSummary: monthSummary, categoryBreakdown: categoryBreakdown,
    accountBalances: accountBalances, monthlyTrend: monthlyTrend, dailySpend: dailySpend,
    budgetStatus: budgetStatus, groupByDay: groupByDay
  };
});
