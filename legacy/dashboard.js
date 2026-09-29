/* ---- Utils.html ---- */
  /* ---- Next.js bridge ---------------------------------------------------- */
  // Google Apps Script의 google.script.run을 대체합니다.
  // 개인 데이터 CRUD는 브라우저 localStorage에 저장되어 별도의 DB 설정 없이 Vercel에서 동작하고,
  // 날씨/학교 정보는 Next.js 서버 API를 통해 원본 외부 사이트에서 가져옵니다.
  var STORAGE_PREFIX_ = 'my-dashboard-v1:';
  var ENTITY_SCHEMAS_ = {
    Bookmark: { fields: ['title', 'url', 'folder_id', 'icon_url', 'order'], types: { order: 'number' }, defaults: { order: 0 } },
    BookmarkFolder: { fields: ['name', 'parent_id'], types: {}, defaults: {} },
    Schedule: { fields: ['title', 'date', 'end_date', 'start_time', 'end_time', 'description', 'color', 'is_checklist', 'completed'], types: { is_checklist: 'boolean', completed: 'boolean' }, defaults: { color: 'indigo', is_checklist: false, completed: false } },
    Homework: { fields: ['title', 'date', 'subject', 'type', 'notes', 'completed'], types: { completed: 'boolean' }, defaults: { type: '숙제', completed: false } },
    Note: { fields: ['title', 'content'], types: {}, defaults: {} },
    Timetable: { fields: ['day', 'period', 'start_time', 'end_time', 'subject', 'detail'], types: { period: 'number' }, defaults: {} }
  };

  function storageKey_(name) { return STORAGE_PREFIX_ + 'entity:' + name; }

  function readEntity_(name) {
    try {
      var raw = localStorage.getItem(storageKey_(name));
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function writeEntity_(name, data) {
    localStorage.setItem(storageKey_(name), JSON.stringify(data));
    return data;
  }

  function randomId_() {
    try { return crypto.randomUUID(); } catch (e) {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
    }
  }

  function coerceEntity_(name, row) {
    var schema = ENTITY_SCHEMAS_[name] || { types: {} };
    var out = {};
    Object.keys(row || {}).forEach(function (k) { out[k] = row[k]; });
    Object.keys(schema.types || {}).forEach(function (f) {
      var t = schema.types[f];
      if (t === 'number') out[f] = (out[f] === '' || out[f] === undefined || out[f] === null) ? 0 : Number(out[f]);
      if (t === 'boolean') out[f] = (out[f] === true || out[f] === 'TRUE' || out[f] === 'true');
    });
    return out;
  }

  function defaultEntity_(name) {
    var defs = (ENTITY_SCHEMAS_[name] && ENTITY_SCHEMAS_[name].defaults) || {};
    var out = {};
    Object.keys(defs).forEach(function (k) { out[k] = defs[k]; });
    return out;
  }

  function compareEntity_(a, b, field, desc) {
    var av = a[field], bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null || av === '') return 1;
    if (bv === undefined || bv === null || bv === '') return -1;
    var cmp = av < bv ? -1 : 1;
    return desc ? -cmp : cmp;
  }

  function genericListLocal_(name, sort, limit) {
    var rows = readEntity_(name).map(function (r) { return coerceEntity_(name, r); });
    if (sort) {
      var desc = sort.charAt(0) === '-';
      var field = desc ? sort.slice(1) : sort;
      rows.sort(function (a, b) { return compareEntity_(a, b, field, desc); });
    }
    if (limit) rows = rows.slice(0, limit);
    return Promise.resolve(rows);
  }

  function genericCreateLocal_(name, data) {
    var rows = readEntity_(name);
    var now = new Date().toISOString();
    var row = defaultEntity_(name);
    Object.keys(data || {}).forEach(function (k) { row[k] = data[k]; });
    row.id = randomId_();
    row.created_date = now;
    row.updated_date = now;
    rows.push(row);
    writeEntity_(name, rows);
    return Promise.resolve(coerceEntity_(name, row));
  }

  function genericUpdateLocal_(name, id, patch) {
    var rows = readEntity_(name);
    var found = false;
    var updated;
    rows = rows.map(function (row) {
      if (String(row.id) !== String(id)) return row;
      found = true;
      var next = {};
      Object.keys(row).forEach(function (k) { next[k] = row[k]; });
      Object.keys(patch || {}).forEach(function (k) { next[k] = patch[k]; });
      next.updated_date = new Date().toISOString();
      updated = next;
      return next;
    });
    if (!found) return Promise.reject(new Error('항목을 찾을 수 없습니다: ' + id));
    writeEntity_(name, rows);
    return Promise.resolve(coerceEntity_(name, updated));
  }

  function genericDeleteLocal_(name, id) {
    var rows = readEntity_(name);
    var next = rows.filter(function (row) { return String(row.id) !== String(id); });
    writeEntity_(name, next);
    return Promise.resolve(next.length !== rows.length);
  }

  function genericDeleteManyLocal_(name, match) {
    var rows = readEntity_(name);
    var keys = Object.keys(match || {});
    var kept = rows.filter(function (row) {
      for (var i = 0; i < keys.length; i++) {
        if (String(row[keys[i]]) !== String(match[keys[i]])) return true;
      }
      return false;
    });
    writeEntity_(name, kept);
    return Promise.resolve(rows.length - kept.length);
  }

  function genericBulkCreateLocal_(name, arr) {
    var rows = readEntity_(name);
    var created = [];
    (arr || []).forEach(function (data) {
      var now = new Date().toISOString();
      var row = defaultEntity_(name);
      Object.keys(data || {}).forEach(function (k) { row[k] = data[k]; });
      row.id = randomId_();
      row.created_date = now;
      row.updated_date = now;
      rows.push(row);
      created.push(coerceEntity_(name, row));
    });
    writeEntity_(name, rows);
    return Promise.resolve(created);
  }

  function genericBulkUpdateLocal_(name, arr) {
    var rows = readEntity_(name);
    var updatedById = {};
    (arr || []).forEach(function (item) {
      var id = item.id;
      rows = rows.map(function (row) {
        if (String(row.id) !== String(id)) return row;
        var next = {};
        Object.keys(row).forEach(function (k) { next[k] = row[k]; });
        Object.keys(item).forEach(function (k) { if (k !== 'id') next[k] = item[k]; });
        next.updated_date = new Date().toISOString();
        updatedById[id] = coerceEntity_(name, next);
        return next;
      });
    });
    writeEntity_(name, rows);
    return Promise.resolve((arr || []).map(function (item) { return updatedById[item.id]; }).filter(Boolean));
  }

  function gsRun(fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var localEntityMap = {
      genericList: function () { return genericListLocal_(args[0], args[1], args[2]); },
      genericCreate: function () { return genericCreateLocal_(args[0], args[1]); },
      genericUpdate: function () { return genericUpdateLocal_(args[0], args[1], args[2]); },
      genericDelete: function () { return genericDeleteLocal_(args[0], args[1]); },
      genericDeleteMany: function () { return genericDeleteManyLocal_(args[0], args[1]); },
      genericBulkCreate: function () { return genericBulkCreateLocal_(args[0], args[1]); },
      genericBulkUpdate: function () { return genericBulkUpdateLocal_(args[0], args[1]); }
    };
    if (localEntityMap[fnName]) return localEntityMap[fnName]();

    return fetch('/api/functions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fnName: fnName, args: args })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (payload) {
        if (!res.ok || payload.error) throw new Error(payload.error || 'API 오류');
        return payload.data;
      });
    });
  }

  // base44.entities.X.list/create/update/delete(...) 와 동일한 형태
  var Entities = {
    list: function (name, sort, limit) { return gsRun('genericList', name, sort, limit); },
    create: function (name, data) { return gsRun('genericCreate', name, data); },
    update: function (name, id, patch) { return gsRun('genericUpdate', name, id, patch); },
    delete: function (name, id) { return gsRun('genericDelete', name, id); },
    deleteMany: function (name, match) { return gsRun('genericDeleteMany', name, match); },
    bulkCreate: function (name, arr) { return gsRun('genericBulkCreate', name, arr); },
    bulkUpdate: function (name, arr) { return gsRun('genericBulkUpdate', name, arr); }
  };

  var Functions = {
    getWeather: function (forceRefresh) { return gsRun('getWeather', !!forceRefresh); },
    getSchoolMeal: function (forceRefresh) { return gsRun('getSchoolMeal', !!forceRefresh); },
    getSchoolSchedule: function (forceRefresh) { return gsRun('getSchoolSchedule', !!forceRefresh); },
    getSchoolNotices: function (forceRefresh) { return gsRun('getSchoolNotices', !!forceRefresh); }
  };

  // ==========================================================================
  // 학교 데이터 캐시 (src/lib/schoolCache.js 이식 - 서버 캐시까지 실패했을 때
  // 최후의 수단으로 브라우저 localStorage 캐시를 보여줍니다)
  // ==========================================================================
  var SchoolCache = {
    PREFIX: 'school_cache_',
    fetch: function (key, fetcher) {
      var self = this;
      return fetcher().then(function (data) {
        try { localStorage.setItem(self.PREFIX + key, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
        return { data: data, cached: false };
      }).catch(function (err) {
        try {
          var raw = localStorage.getItem(self.PREFIX + key);
          if (raw) return { data: JSON.parse(raw).data, cached: true };
        } catch (e2) {}
        throw err;
      });
    }
  };

  function loadSchoolSchedule(forceRefresh) {
    return SchoolCache.fetch('schedule', function () { return Functions.getSchoolSchedule(forceRefresh); })
      .then(function (r) {
        return { items: (r.data && r.data.items) || [], year: r.data && r.data.year, cached: r.cached };
      })
      .catch(function () { return { items: [], year: null, cached: false }; });
  }
  function loadSchoolMeal(forceRefresh) {
    return SchoolCache.fetch('meal', function () { return Functions.getSchoolMeal(forceRefresh); })
      .then(function (r) { return { days: (r.data && r.data.days) || [], cached: r.cached }; })
      .catch(function () { return { days: [], cached: false }; });
  }
  function loadSchoolNotices(forceRefresh) {
    return SchoolCache.fetch('notices', function () { return Functions.getSchoolNotices(forceRefresh); })
      .then(function (r) { return { items: (r.data && r.data.items) || [], cached: r.cached }; })
      .catch(function () { return { items: [], cached: false }; });
  }
  function fetchMealForDate(date) {
    return loadSchoolMeal().then(function (r) {
      for (var i = 0; i < r.days.length; i++) if (r.days[i].date === date) return r.days[i];
      return null;
    });
  }

  // ==========================================================================
  // 공통 헬퍼
  // ==========================================================================
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2_(n) { return String(n).padStart(2, '0'); }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
  }

  function todayStr() { return fmtDate(new Date()); }

  function dateRange(startStr, endStr) {
    var result = [];
    if (!startStr) return result;
    var cur = new Date(startStr + 'T00:00:00');
    var end = endStr ? new Date(endStr + 'T00:00:00') : new Date(startStr + 'T00:00:00');
    while (cur <= end) {
      result.push(fmtDate(cur));
      var next = new Date(cur);
      next.setDate(next.getDate() + 1);
      cur = next;
    }
    return result;
  }

  function refreshIcons() {
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
  }

  // ==========================================================================
  // 모달(다이얼로그) - Radix Dialog 대체
  // ==========================================================================
  var __modalOnClose = null;

  function openModal(html, opts) {
    opts = opts || {};
    closeModal();
    __modalOnClose = opts.onClose || null;
    var overlay = document.createElement('div');
    overlay.className = 'ui-overlay';
    overlay.id = 'ui-modal-overlay';
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay && opts.dismissible !== false) closeModal();
    });
    var panel = document.createElement('div');
    panel.className = 'ui-dialog w-full ' + (opts.width || 'max-w-md');
    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escModalHandler_);
    refreshIcons();
    return panel;
  }
  function closeModal() {
    var el = document.getElementById('ui-modal-overlay');
    if (el) el.remove();
    document.removeEventListener('keydown', escModalHandler_);
    var cb = __modalOnClose;
    __modalOnClose = null;
    if (cb) cb();
  }
  function escModalHandler_(e) { if (e.key === 'Escape') closeModal(); }

  function alertModal(message) {
    var panel = openModal(
      '<p class="mb-4 text-sm text-neutral-800">' + esc(message) + '</p>' +
      '<div class="flex justify-end"><button class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800" id="ui-alert-ok">확인</button></div>',
      { width: 'max-w-sm' }
    );
    panel.querySelector('#ui-alert-ok').addEventListener('click', closeModal);
  }

  /* ---- DDayBar.html ---- */
var DDAY_COLOR_MAP_ = {
    indigo: 'bg-indigo-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500',
    amber: 'bg-amber-500', sky: 'bg-sky-500', violet: 'bg-violet-500'
  };

  function ddayLabel_(diff) {
    if (diff === 0) return 'D-DAY';
    if (diff > 0) return 'D-' + diff;
    return 'D+' + Math.abs(diff);
  }

  function mountDDayBar(container, schedulesPromise) {
    container.innerHTML = '<div class="text-xs text-neutral-400 px-1">불러오는 중...</div>';
    var p = schedulesPromise || Entities.list('Schedule', '-date', 500);
    p.then(function (schedules) {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var upcoming = schedules.filter(function (s) {
        var d = new Date(s.date + 'T00:00:00');
        d.setHours(0, 0, 0, 0);
        return d >= today;
      }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); })
        .slice(0, 3)
        .map(function (s) {
          var d = new Date(s.date + 'T00:00:00');
          d.setHours(0, 0, 0, 0);
          var diff = Math.round((d - today) / 86400000);
          var out = {}; for (var k in s) out[k] = s[k];
          out.diff = diff;
          return out;
        });

      if (upcoming.length === 0) {
        container.innerHTML =
          '<div class="mb-4 flex items-center gap-2 rounded-none border border-neutral-200 px-4 py-3">' +
          '<i data-lucide="calendar-clock" class="h-4 w-4 text-neutral-300"></i>' +
          '<p class="text-xs text-neutral-400">다가오는 일정이 없습니다. 달력에서 일정을 추가해 보세요.</p>' +
          '</div>';
        refreshIcons();
        return;
      }

      var html = '<div class="mb-4 grid grid-cols-3 gap-3">';
      upcoming.forEach(function (ev) {
        var dLabel = new Date(ev.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
        html +=
          '<div class="flex items-center gap-3 rounded-none border border-neutral-200 px-3 py-2.5">' +
          '<div class="flex flex-col items-center justify-center">' +
          '<span class="font-mono text-lg font-semibold leading-none tabular-nums ' + (ev.diff === 0 ? 'text-rose-500' : 'text-neutral-900') + '">' + ddayLabel_(ev.diff) + '</span>' +
          '</div>' +
          '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center gap-1">' +
          '<span class="h-1.5 w-1.5 flex-shrink-0 ' + (DDAY_COLOR_MAP_[ev.color] || 'bg-indigo-500') + '"></span>' +
          '<p class="truncate text-xs font-medium text-neutral-800">' + esc(ev.title) + '</p>' +
          '</div>' +
          '<p class="text-[10px] text-neutral-400">' + esc(dLabel) + (ev.start_time ? ' · ' + esc(ev.start_time) : '') + '</p>' +
          '</div>' +
          '</div>';
      });
      html += '</div>';
      container.innerHTML = html;
      refreshIcons();
    }).catch(function (e) {
      container.innerHTML = '<div class="mb-4 text-xs text-rose-400 px-1">일정을 불러오지 못했습니다.</div>';
      console.error(e);
    });
  }

  /* ---- Calendar.html ---- */
var CAL_COLOR_MAP_ = {
    indigo: 'bg-indigo-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500',
    amber: 'bg-amber-500', sky: 'bg-sky-500', violet: 'bg-violet-500'
  };
  var CAL_COLORS_ = [
    { key: 'indigo', dot: 'bg-indigo-500' }, { key: 'rose', dot: 'bg-rose-500' }, { key: 'emerald', dot: 'bg-emerald-500' },
    { key: 'amber', dot: 'bg-amber-500' }, { key: 'sky', dot: 'bg-sky-500' }, { key: 'violet', dot: 'bg-violet-500' }
  ];
  var CAL_WEEKDAYS_ = ['일', '월', '화', '수', '목', '금', '토'];

  function mountCalendar(container, preloadedSchedules) {
    var today = new Date();
    var state = {
      viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
      schedules: [],
      schoolItems: []
    };

    var clockInterval = setInterval(updateClock_, 1000);
    window.__cleanupCurrentTab = function () { clearInterval(clockInterval); };

    function loadSchedules() {
      return Entities.list('Schedule', '-date', 500).then(function (data) { state.schedules = data; });
    }
    function loadSchool() {
      return loadSchoolSchedule().then(function (r) { state.schoolItems = r.items; });
    }

    function eventsByDate_() {
      var map = {};
      state.schedules.forEach(function (s) {
        dateRange(s.date, s.end_date).forEach(function (d) {
          if (!map[d]) map[d] = [];
          map[d].push(s);
        });
      });
      state.schoolItems.forEach(function (it) {
        dateRange(it.date, it.end_date).forEach(function (d) {
          if (!map[d]) map[d] = [];
          map[d].push({ id: 'sch-' + d + '-' + it.title, __school: true, title: it.title, date: it.date, end_date: it.end_date, color: 'emerald' });
        });
      });
      return map;
    }

    function updateClock_() {
      var w = document.getElementById('cal-weekday');
      var t = document.getElementById('cal-time');
      var f = document.getElementById('cal-fulldate');
      if (!w || !t || !f) return;
      var now = new Date();
      w.textContent = now.toLocaleDateString('ko-KR', { weekday: 'long' });
      t.textContent = now.toLocaleTimeString('ko-KR', { hour12: false });
      f.textContent = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function render() {
      var year = state.viewDate.getFullYear();
      var month = state.viewDate.getMonth();
      var firstDay = new Date(year, month, 1);
      var startWeekday = firstDay.getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var cells = [];
      for (var i = 0; i < startWeekday; i++) cells.push(null);
      for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

      var evMap = eventsByDate_();
      var todayStrV = fmtDate(today);

      var html = '';
      html += '<div class="mb-4 flex items-start justify-between">';
      html += '<div><p class="font-mono text-xs uppercase tracking-widest text-neutral-400" id="cal-weekday"></p>';
      html += '<p class="font-mono text-2xl font-light tabular-nums text-neutral-900" id="cal-time"></p>';
      html += '<p class="text-xs text-neutral-400" id="cal-fulldate"></p></div>';
      html += '<div class="flex items-center gap-1">';
      html += '<button id="cal-prev" class="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><i data-lucide="chevron-left" class="h-4 w-4"></i></button>';
      html += '<button id="cal-today" class="rounded-none px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100">오늘</button>';
      html += '<button id="cal-next" class="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"><i data-lucide="chevron-right" class="h-4 w-4"></i></button>';
      html += '</div></div>';

      html += '<h2 class="mb-3 font-display text-xl font-medium text-neutral-900">' + year + '년 ' + (month + 1) + '월</h2>';

      html += '<div class="grid grid-cols-7 border-b border-neutral-200">';
      CAL_WEEKDAYS_.forEach(function (w, i) {
        html += '<div class="py-2 text-center text-xs font-medium ' + (i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-neutral-400') + '">' + w + '</div>';
      });
      html += '</div>';

      html += '<div class="grid flex-1 grid-cols-7">';
      cells.forEach(function (date) {
        if (!date) { html += '<div class="border-b border-r border-neutral-100"></div>'; return; }
        var dateStr = fmtDate(date);
        var dayEvents = evMap[dateStr] || [];
        var isToday = dateStr === todayStrV;
        var weekday = date.getDay();
        html += '<button data-date="' + dateStr + '" class="cal-day-btn group relative flex min-h-[72px] flex-col items-start border-b border-r border-neutral-100 p-1.5 text-left transition-colors hover:bg-neutral-50 ' + (isToday ? 'bg-neutral-900' : '') + '">';
        html += '<span class="text-xs font-medium tabular-nums ' + (isToday ? 'text-white' : weekday === 0 ? 'text-rose-400' : weekday === 6 ? 'text-sky-400' : 'text-neutral-700') + '">' + date.getDate() + '</span>';
        html += '<div class="mt-1 flex w-full flex-col gap-0.5 overflow-hidden">';
        dayEvents.slice(0, 3).forEach(function (ev) {
          html += '<div class="flex items-center gap-1 truncate text-[10px] leading-tight ' + (isToday ? 'text-white/90' : ev.completed ? 'text-neutral-400 line-through' : 'text-neutral-600') + '">';
          if (ev.is_checklist) {
            html += '<span data-toggle-id="' + ev.id + '" class="cal-toggle-check flex h-3 w-3 flex-shrink-0 items-center justify-center border ' + (ev.completed ? 'border-emerald-500 bg-emerald-500 text-white' : isToday ? 'border-white/60' : 'border-neutral-400') + '">' + (ev.completed ? '<i data-lucide="check" class="h-2 w-2"></i>' : '') + '</span>';
          } else {
            html += '<span class="mr-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 ' + (CAL_COLOR_MAP_[ev.color] || 'bg-indigo-500') + '"></span>';
          }
          html += '<span class="truncate">' + (ev.start_time ? esc(ev.start_time) + ' ' : '') + esc(ev.title) + '</span>';
          html += '</div>';
        });
        if (dayEvents.length > 3) {
          html += '<span class="text-[10px] ' + (isToday ? 'text-white/60' : 'text-neutral-400') + '">+' + (dayEvents.length - 3) + '</span>';
        }
        html += '</div></button>';
      });
      html += '</div>';

      container.innerHTML = html;
      updateClock_();
      refreshIcons();

      container.querySelectorAll('.cal-day-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { openEventDialog_(btn.getAttribute('data-date')); });
      });
      container.querySelectorAll('.cal-toggle-check').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = el.getAttribute('data-toggle-id');
          var ev = state.schedules.filter(function (s) { return s.id === id; })[0];
          if (!ev) return;
          Entities.update('Schedule', ev.id, { completed: !ev.completed }).then(loadSchedules).then(render);
        });
      });
      document.getElementById('cal-prev').addEventListener('click', function () { state.viewDate = new Date(year, month - 1, 1); render(); });
      document.getElementById('cal-next').addEventListener('click', function () { state.viewDate = new Date(year, month + 1, 1); render(); });
      document.getElementById('cal-today').addEventListener('click', function () { state.viewDate = new Date(today.getFullYear(), today.getMonth(), 1); render(); });
    }

    function openEventDialog_(dateStr) {
      var evMap = eventsByDate_();
      var events = evMap[dateStr] || [];
      renderEventDialog_(dateStr, events, {
        onSave: function (data) { return Entities.create('Schedule', data).then(loadSchedules).then(render); },
        onDelete: function (id) { return Entities.delete('Schedule', id).then(loadSchedules).then(render); },
        onToggleComplete: function (ev) { return Entities.update('Schedule', ev.id, { completed: !ev.completed }).then(loadSchedules).then(render); }
      });
    }

    var initialSchedules = preloadedSchedules
      ? preloadedSchedules.then(function (data) { state.schedules = data; })
      : loadSchedules();
    Promise.all([initialSchedules, loadSchool()]).then(render);
  }

  function renderEventDialog_(dateStr, events, handlers) {
    var dateLabel = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) : '';
    var selectedColor = 'indigo';

    var html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">' + esc(dateLabel) + '</h3>';

    if (events.length > 0) {
      html += '<div class="mb-4 space-y-2">';
      html += '<p class="text-xs font-medium uppercase tracking-wider text-neutral-400">등록된 일정</p>';
      events.forEach(function (ev) {
        var found = CAL_COLORS_.filter(function (c) { return c.key === ev.color; })[0];
        var dotClass = found ? found.dot : 'bg-indigo-500';
        html += '<div class="flex items-center justify-between rounded-none border border-neutral-200 px-3 py-2">';
        html += '<div class="flex items-center gap-2">';
        if (ev.__school) {
          html += '<span class="h-2 w-2 rounded-full bg-emerald-500"></span>';
        } else if (ev.is_checklist) {
          html += '<button data-ev-toggle="' + ev.id + '" class="flex h-4 w-4 items-center justify-center border ' + (ev.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-400') + '">' + (ev.completed ? '<i data-lucide="check" class="h-2.5 w-2.5"></i>' : '') + '</button>';
        } else {
          html += '<span class="h-2 w-2 rounded-full ' + dotClass + '"></span>';
        }
        html += '<div><p class="text-sm font-medium ' + (ev.completed ? 'text-neutral-400 line-through' : 'text-neutral-900') + '">' + esc(ev.title) + (ev.__school ? '<span class="ml-1 text-[10px] font-normal text-emerald-500">학사</span>' : '') + '</p>';
        html += '<p class="text-xs text-neutral-400">' + esc(ev.date) + (ev.end_date && ev.end_date !== ev.date ? ' ~ ' + esc(ev.end_date) : '') + (ev.start_time ? ' · ' + esc(ev.start_time) : '') + (ev.end_time ? ' - ' + esc(ev.end_time) : '') + '</p></div>';
        html += '</div>';
        if (!ev.__school) {
          html += '<button data-ev-delete="' + ev.id + '" class="text-neutral-300 transition-colors hover:text-rose-500"><i data-lucide="trash-2" class="h-4 w-4"></i></button>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    html += '<div class="space-y-3">';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">일정 제목</label>';
    html += '<input id="ev-title" class="ui-input rounded-none border-neutral-300" placeholder="예: 수학 숙제" /></div>';
    html += '<div class="grid grid-cols-2 gap-3">';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">시작 날짜</label><input type="date" value="' + esc(dateStr) + '" readonly class="ui-input rounded-none border-neutral-300 bg-neutral-50" /></div>';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">종료 날짜 (여러 날)</label><input id="ev-end-date" type="date" min="' + esc(dateStr) + '" class="ui-input rounded-none border-neutral-300" /></div>';
    html += '</div>';
    html += '<div class="grid grid-cols-2 gap-3">';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">시작 시간</label><input id="ev-start-time" type="time" class="ui-input rounded-none border-neutral-300" /></div>';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">종료 시간</label><input id="ev-end-time" type="time" class="ui-input rounded-none border-neutral-300" /></div>';
    html += '</div>';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">메모</label><input id="ev-desc" class="ui-input rounded-none border-neutral-300" placeholder="추가 설명" /></div>';
    html += '<div class="flex items-center gap-4">';
    html += '<div class="space-y-1"><label class="text-xs text-neutral-500">색상</label><div class="flex gap-2">';
    CAL_COLORS_.forEach(function (c) {
      html += '<button type="button" data-color="' + c.key + '" class="ev-color-btn h-7 w-7 rounded-none border-2 ' + (c.key === 'indigo' ? 'border-neutral-900' : 'border-transparent') + ' ' + c.dot + '"></button>';
    });
    html += '</div></div>';
    html += '<label class="mt-5 flex cursor-pointer items-center gap-2"><input id="ev-checklist" type="checkbox" class="h-4 w-4 accent-neutral-900" /><span class="text-xs text-neutral-600">체크리스트로 등록</span></label>';
    html += '</div></div>';

    html += '<div id="ev-meal-box"></div>';

    html += '<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">';
    html += '<button id="ev-meal-btn" class="ui-btn rounded-none border border-neutral-300 bg-white hover:bg-neutral-50">급식 보기</button>';
    html += '<button id="ev-save-btn" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">추가</button>';
    html += '</div>';

    var panel = openModal(html, { width: 'sm:max-w-md' });

    panel.querySelectorAll('.ev-color-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedColor = btn.getAttribute('data-color');
        panel.querySelectorAll('.ev-color-btn').forEach(function (b) {
          b.classList.toggle('border-neutral-900', b === btn);
          b.classList.toggle('border-transparent', b !== btn);
        });
      });
    });

    panel.querySelectorAll('[data-ev-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { handlers.onDelete(btn.getAttribute('data-ev-delete')); closeModal(); });
    });
    panel.querySelectorAll('[data-ev-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ev-toggle');
        var ev = events.filter(function (e) { return e.id === id; })[0];
        if (ev) { handlers.onToggleComplete(ev); closeModal(); }
      });
    });

    var mealShown = false;
    var mealBtn = panel.querySelector('#ev-meal-btn');
    mealBtn.addEventListener('click', function () {
      var box = panel.querySelector('#ev-meal-box');
      if (mealShown) { box.innerHTML = ''; mealShown = false; mealBtn.textContent = '급식 보기'; return; }
      mealBtn.textContent = '불러오는 중...';
      mealBtn.disabled = true;
      fetchMealForDate(dateStr).then(function (meal) {
        mealShown = true;
        mealBtn.disabled = false;
        mealBtn.textContent = '급식 닫기';
        box.innerHTML = mealBoxHtml_(meal);
      }).catch(function () {
        mealShown = true;
        mealBtn.disabled = false;
        mealBtn.textContent = '급식 닫기';
        box.innerHTML = mealBoxHtml_(null);
      });
    });

    function doSave() {
      var title = panel.querySelector('#ev-title').value.trim();
      if (!title) return;
      var data = {
        title: title,
        date: dateStr,
        end_date: panel.querySelector('#ev-end-date').value || '',
        start_time: panel.querySelector('#ev-start-time').value,
        end_time: panel.querySelector('#ev-end-time').value,
        description: panel.querySelector('#ev-desc').value.trim(),
        color: selectedColor,
        is_checklist: panel.querySelector('#ev-checklist').checked,
        completed: false
      };
      handlers.onSave(data);
      closeModal();
    }
    panel.querySelector('#ev-save-btn').addEventListener('click', doSave);
    panel.querySelector('#ev-title').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSave(); });
  }

  function mealBoxHtml_(meal) {
    if (!meal) {
      return '<div class="mb-2 mt-2 space-y-1 border border-neutral-200 p-3"><p class="mb-1 text-xs font-medium text-neutral-500">급식</p><p class="text-xs text-neutral-400">급식 정보가 없습니다.</p></div>';
    }
    return '<div class="mb-2 mt-2 space-y-1 border border-neutral-200 p-3">' +
      '<p class="mb-1 text-xs font-medium text-neutral-500">급식</p>' +
      '<div class="space-y-1 text-sm">' +
      '<p><span class="font-medium text-amber-600">아침 </span><span class="text-neutral-700">' + esc(meal.breakfast || '-') + '</span></p>' +
      '<p><span class="font-medium text-emerald-600">점심 </span><span class="text-neutral-700">' + esc(meal.lunch || '-') + '</span></p>' +
      '<p><span class="font-medium text-sky-600">저녁 </span><span class="text-neutral-700">' + esc(meal.dinner || '-') + '</span></p>' +
      '<p><span class="font-medium text-violet-600">간식 </span><span class="text-neutral-700">' + esc(meal.snack || '-') + '</span></p>' +
      '</div></div>';
  }

  /* ---- Bookmarks.html ---- */
function sortByOrder_(list) {
    return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function getDomain_(url) {
    try { return new URL(url).hostname; } catch (e) { return url; }
  }
  function bmIconError_(img) {
    var wrap = img.parentElement;
    wrap.innerHTML = '<i data-lucide="globe" class="h-7 w-7 text-neutral-300"></i>';
    refreshIcons();
  }

  function mountBookmarks(container) {
    var state = { bookmarks: [], folders: [], openFolders: {}, draggedId: null, dragOver: null };

    function load() {
      return Promise.all([
        Entities.list('Bookmark', '-created_date', 500),
        Entities.list('BookmarkFolder', '-created_date', 200)
      ]).then(function (r) {
        state.bookmarks = r[0];
        state.folders = r[1];
        render();
      });
    }

    function getList(listId) {
      return sortByOrder_(state.bookmarks.filter(function (b) {
        return listId === 'root' ? !b.folder_id : b.folder_id === listId;
      }));
    }

    function persistList(list, listId) {
      var folder_id = listId === 'root' ? '' : listId;
      return Entities.bulkUpdate('Bookmark', list.map(function (b, i) { return { id: b.id, order: i, folder_id: folder_id }; }));
    }

    function bookmarkCardHtml_(bm, listId, index) {
      var iconSrc = bm.icon_url ? bm.icon_url : ('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(getDomain_(bm.url)) + '&sz=128');
      var html = '<div draggable="true" data-bm-id="' + bm.id + '" data-list-id="' + listId + '" data-index="' + index + '" class="bm-card group relative flex flex-col items-center gap-2 p-1">';
      html += '<a href="' + esc(bm.url) + '" target="_blank" rel="noreferrer" draggable="false" class="flex flex-col items-center gap-2">';
      html += '<div class="flex h-14 w-14 items-center justify-center overflow-hidden">';
      html += '<img src="' + esc(iconSrc) + '" alt="" class="h-10 w-10" onerror="bmIconError_(this)" />';
      html += '</div>';
      html += '<span class="line-clamp-2 text-center text-xs font-medium text-neutral-700">' + esc(bm.title) + '</span>';
      html += '</a>';
      html += '<div class="absolute right-0 top-0 flex items-center opacity-0 group-hover:opacity-100">';
      html += '<button data-bm-edit="' + bm.id + '" class="rounded-none p-0.5 text-neutral-400 hover:text-neutral-900" title="수정"><i data-lucide="pencil" class="h-3.5 w-3.5"></i></button>';
      html += '<button data-bm-delete="' + bm.id + '" class="rounded-none p-0.5 text-neutral-300 hover:text-rose-500" title="삭제"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i></button>';
      html += '</div></div>';
      return html;
    }

    function render() {
      var html = '<div class="mb-4 flex items-center justify-between">';
      html += '<h2 class="font-display text-xl font-medium text-neutral-900">북마크</h2>';
      html += '<div class="flex gap-1">';
      html += '<button id="bm-add-folder" class="rounded-none p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" title="폴더 추가"><i data-lucide="folder" class="h-4 w-4"></i></button>';
      html += '<button id="bm-add-bookmark" class="rounded-none p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" title="북마크 추가"><i data-lucide="plus" class="h-5 w-5"></i></button>';
      html += '</div></div>';

      html += '<div class="flex-1 space-y-5 overflow-y-auto">';

      state.folders.forEach(function (folder) {
        var items = getList(folder.id);
        var isOpen = !!state.openFolders[folder.id];
        html += '<div>';
        html += '<div data-folder-header="' + folder.id + '" class="group mb-2 flex items-center justify-between rounded-none border border-transparent px-2 py-1.5 transition-colors hover:bg-neutral-50">';
        html += '<button data-folder-toggle="' + folder.id + '" class="flex flex-1 items-center gap-1.5 text-left">';
        html += '<i data-lucide="' + (isOpen ? 'folder-open' : 'folder') + '" class="h-4 w-4 text-neutral-500"></i>';
        html += '<span class="text-sm font-medium text-neutral-800">' + esc(folder.name) + '</span>';
        html += '<span class="text-xs text-neutral-400">' + items.length + '</span>';
        html += '</button>';
        html += '<div class="flex items-center opacity-0 group-hover:opacity-100">';
        html += '<button data-folder-addbm="' + folder.id + '" class="rounded-none p-0.5 text-neutral-400 hover:text-neutral-900"><i data-lucide="plus" class="h-3.5 w-3.5"></i></button>';
        html += '<button data-folder-delete="' + folder.id + '" class="rounded-none p-0.5 text-neutral-300 hover:text-rose-500"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i></button>';
        html += '</div></div>';
        if (isOpen) {
          html += '<div data-drop-list="' + folder.id + '" class="grid grid-cols-5 gap-2">';
          if (items.length === 0) html += '<p class="col-span-full py-2 text-xs text-neutral-300">북마크 없음 — 여기로 드래그하세요</p>';
          items.forEach(function (bm, i) { html += bookmarkCardHtml_(bm, folder.id, i); });
          html += '</div>';
        }
        html += '</div>';
      });

      html += '<div>';
      if (state.folders.length > 0) html += '<p class="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-neutral-400">기타</p>';
      var rootItems = getList('root');
      html += '<div data-drop-list="root" class="grid grid-cols-5 gap-2">';
      if (rootItems.length === 0 && state.folders.length === 0) {
        html += '<div class="col-span-full flex flex-col items-center justify-center py-16 text-center">';
        html += '<i data-lucide="bookmark" class="mb-3 h-10 w-10 text-neutral-200"></i>';
        html += '<p class="text-sm text-neutral-400">+ 버튼으로 자주 가는 사이트를 추가하세요</p>';
        html += '</div>';
      }
      rootItems.forEach(function (bm, i) { html += bookmarkCardHtml_(bm, 'root', i); });
      html += '</div></div>';

      html += '</div>';

      container.innerHTML = html;
      refreshIcons();
      attachHandlers_();
    }

    function clearDragHighlights_() {
      container.querySelectorAll('.bm-card').forEach(function (c) { c.classList.remove('ring-2', 'ring-neutral-900'); });
      container.querySelectorAll('[data-folder-header]').forEach(function (h) {
        h.classList.remove('border-neutral-900', 'bg-neutral-100');
        h.classList.add('border-transparent');
      });
    }

    function handleDrop_(listId) {
      clearDragHighlights_();
      if (!state.draggedId) { state.dragOver = null; return; }
      var dragged = state.bookmarks.filter(function (b) { return b.id === state.draggedId; })[0];
      if (!dragged) { state.draggedId = null; state.dragOver = null; return; }
      var srcListId = dragged.folder_id ? dragged.folder_id : 'root';
      var dstList = getList(listId).filter(function (b) { return b.id !== state.draggedId; });
      var insertIndex = (state.dragOver && state.dragOver.list === listId) ? state.dragOver.index : dstList.length;
      insertIndex = Math.max(0, Math.min(insertIndex, dstList.length));
      var draggedCopy = {}; for (var k in dragged) draggedCopy[k] = dragged[k];
      draggedCopy.folder_id = listId === 'root' ? '' : listId;
      dstList.splice(insertIndex, 0, draggedCopy);
      var p = persistList(dstList, listId);
      if (srcListId !== listId) {
        var srcList = getList(srcListId).filter(function (b) { return b.id !== state.draggedId; });
        p = p.then(function () { return persistList(srcList, srcListId); });
      }
      p.then(function () { state.draggedId = null; state.dragOver = null; return load(); });
    }

    function attachHandlers_() {
      container.querySelector('#bm-add-folder').addEventListener('click', function () { openAddDialog_('folder', null); });
      container.querySelector('#bm-add-bookmark').addEventListener('click', function () { openAddDialog_('bookmark', null); });

      container.querySelectorAll('[data-folder-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-folder-toggle');
          state.openFolders[id] = !state.openFolders[id];
          render();
        });
      });
      container.querySelectorAll('[data-folder-addbm]').forEach(function (btn) {
        btn.addEventListener('click', function () { openAddDialog_('bookmark', btn.getAttribute('data-folder-addbm')); });
      });
      container.querySelectorAll('[data-folder-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-folder-delete');
          Entities.deleteMany('Bookmark', { folder_id: id }).then(function () { return Entities.delete('BookmarkFolder', id); }).then(load);
        });
      });
      container.querySelectorAll('[data-bm-edit]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var id = btn.getAttribute('data-bm-edit');
          var bm = state.bookmarks.filter(function (b) { return b.id === id; })[0];
          if (bm) openEditDialog_(bm);
        });
      });
      container.querySelectorAll('[data-bm-delete]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          Entities.delete('Bookmark', btn.getAttribute('data-bm-delete')).then(load);
        });
      });

      container.querySelectorAll('.bm-card').forEach(function (card) {
        card.addEventListener('dragstart', function (e) {
          state.draggedId = card.getAttribute('data-bm-id');
          card.classList.add('opacity-40');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', function () {
          card.classList.remove('opacity-40');
          clearDragHighlights_();
        });
        card.addEventListener('dragover', function (e) {
          e.preventDefault();
          var listId = card.getAttribute('data-list-id');
          var index = parseInt(card.getAttribute('data-index'), 10);
          var rect = card.getBoundingClientRect();
          var after = e.clientX > rect.left + rect.width / 2;
          state.dragOver = { list: listId, index: after ? index + 1 : index };
          clearDragHighlights_();
          card.classList.add('ring-2', 'ring-neutral-900');
        });
      });
      container.querySelectorAll('[data-drop-list]').forEach(function (listEl) {
        listEl.addEventListener('dragover', function (e) {
          if (e.target !== listEl) return;
          e.preventDefault();
          var listId = listEl.getAttribute('data-drop-list');
          state.dragOver = { list: listId, index: getList(listId).length };
        });
        listEl.addEventListener('drop', function (e) {
          e.preventDefault();
          handleDrop_(listEl.getAttribute('data-drop-list'));
        });
      });
      container.querySelectorAll('[data-folder-header]').forEach(function (headerEl) {
        var id = headerEl.getAttribute('data-folder-header');
        headerEl.addEventListener('dragover', function (e) {
          if (!state.openFolders[id]) {
            e.preventDefault();
            state.dragOver = { list: id, index: getList(id).length };
            clearDragHighlights_();
            headerEl.classList.remove('border-transparent');
            headerEl.classList.add('border-neutral-900', 'bg-neutral-100');
          }
        });
        headerEl.addEventListener('drop', function (e) {
          if (!state.openFolders[id]) { e.preventDefault(); handleDrop_(id); }
        });
      });
    }

    function openAddDialog_(type, folderId) {
      var html;
      if (type === 'folder') {
        html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">폴더 추가</h3>' +
          '<div class="space-y-1"><label class="text-xs text-neutral-500">폴더 이름</label>' +
          '<input id="bmf-name" class="ui-input rounded-none border-neutral-300" placeholder="예: 학습 사이트" /></div>' +
          '<div class="mt-4 flex justify-end"><button id="bm-save-btn" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">저장</button></div>';
      } else {
        html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">북마크 추가</h3>' +
          '<div class="space-y-3">' +
          '<div class="space-y-1"><label class="text-xs text-neutral-500">이름</label><input id="bm-title" class="ui-input rounded-none border-neutral-300" placeholder="예: 구글" /></div>' +
          '<div class="space-y-1"><label class="text-xs text-neutral-500">주소</label><input id="bm-url" class="ui-input rounded-none border-neutral-300" placeholder="google.com" /></div>' +
          '</div>' +
          '<div class="mt-4 flex justify-end"><button id="bm-save-btn" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">저장</button></div>';
      }
      var panel = openModal(html, { width: 'sm:max-w-sm' });
      var firstInput = panel.querySelector('input');
      if (firstInput) firstInput.focus();

      function doSave() {
        if (type === 'folder') {
          var name = panel.querySelector('#bmf-name').value.trim();
          if (!name) return;
          Entities.create('BookmarkFolder', { name: name }).then(function () { closeModal(); return load(); });
        } else {
          var title = panel.querySelector('#bm-title').value.trim();
          var url = panel.querySelector('#bm-url').value.trim();
          if (!title || !url) return;
          if (!/^https?:\/\//.test(url)) url = 'https://' + url;
          Entities.create('Bookmark', { title: title, url: url, folder_id: folderId || '', order: Date.now() }).then(function () { closeModal(); return load(); });
        }
      }
      panel.querySelector('#bm-save-btn').addEventListener('click', doSave);
      panel.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSave(); });
      });
    }

    function openEditDialog_(bm) {
      var folderOptions = '<option value="">기타 (루트)</option>' + state.folders.map(function (f) {
        return '<option value="' + esc(f.id) + '" ' + (bm.folder_id === f.id ? 'selected' : '') + '>' + esc(f.name) + '</option>';
      }).join('');
      var html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">북마크 수정</h3>' +
        '<div class="space-y-3">' +
        '<div class="space-y-1"><label class="text-xs text-neutral-500">이름</label><input id="bme-title" class="ui-input rounded-none border-neutral-300" value="' + esc(bm.title || '') + '" /></div>' +
        '<div class="space-y-1"><label class="text-xs text-neutral-500">주소</label><input id="bme-url" class="ui-input rounded-none border-neutral-300" value="' + esc(bm.url || '') + '" /></div>' +
        '<div class="space-y-1"><label class="text-xs text-neutral-500">아이콘 이미지 주소 (선택, 비우면 자동 추출)</label><input id="bme-icon" class="ui-input rounded-none border-neutral-300" placeholder="https://..." value="' + esc(bm.icon_url || '') + '" /></div>' +
        '<div class="space-y-1"><label class="text-xs text-neutral-500">폴더</label><select id="bme-folder" class="ui-input rounded-none border-neutral-300">' + folderOptions + '</select></div>' +
        '</div>' +
        '<div class="mt-4 flex justify-between">' +
        '<button id="bme-delete-btn" class="ui-btn rounded-none border border-neutral-300 text-rose-500 hover:bg-rose-50"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i> 삭제</button>' +
        '<button id="bme-save-btn" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">저장</button>' +
        '</div>';
      var panel = openModal(html, { width: 'sm:max-w-sm' });
      refreshIcons();
      panel.querySelector('#bme-delete-btn').addEventListener('click', function () {
        Entities.delete('Bookmark', bm.id).then(function () { closeModal(); return load(); });
      });
      panel.querySelector('#bme-save-btn').addEventListener('click', function () {
        var title = panel.querySelector('#bme-title').value.trim();
        var url = panel.querySelector('#bme-url').value.trim();
        if (!title || !url) return;
        if (!/^https?:\/\//.test(url)) url = 'https://' + url;
        var icon = panel.querySelector('#bme-icon').value.trim();
        var folder = panel.querySelector('#bme-folder').value;
        Entities.update('Bookmark', bm.id, { title: title, url: url, icon_url: icon, folder_id: folder || '' }).then(function () { closeModal(); return load(); });
      });
    }

    load();
  }

  /* ---- Weather.html ---- */
var WEATHER_ICON_MAP_ = {
    sun: 'sun', 'cloud-sun': 'cloud-sun', cloud: 'cloud', 'cloud-fog': 'cloud-fog',
    'cloud-rain': 'cloud-rain', 'cloud-snow': 'cloud-snow', 'cloud-lightning': 'cloud-lightning',
    'cloud-drizzle': 'cloud-drizzle'
  };

  function mountWeather(container) {
    function render(forceRefresh) {
      container.innerHTML = '<div class="flex items-center gap-2 px-1 py-2 text-xs text-neutral-400">' +
        '<i data-lucide="refresh-cw" class="h-3 w-3 animate-spin"></i> 날씨 불러오는 중...</div>';
      refreshIcons();

      Functions.getWeather(forceRefresh).then(function (data) {
        var icon = WEATHER_ICON_MAP_[data.current.icon] || 'cloud';
        var html = '<div>';
        html += '<div class="mb-3 flex items-center justify-between">';
        html += '<div class="flex items-center gap-1.5"><i data-lucide="map-pin" class="h-3.5 w-3.5 text-neutral-400"></i>';
        html += '<h3 class="font-display text-sm font-medium text-neutral-900">' + esc(data.location) + ' 날씨</h3></div>';
        html += '<button id="weather-refresh" class="rounded-none p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" title="새로고침"><i data-lucide="refresh-cw" class="h-3.5 w-3.5"></i></button>';
        html += '</div>';

        html += '<div class="mb-3 flex items-center gap-3 rounded-none border border-neutral-200 px-3 py-2.5">';
        html += '<i data-lucide="' + icon + '" class="h-8 w-8 text-neutral-700"></i>';
        html += '<div><p class="font-display text-2xl font-light tabular-nums text-neutral-900">' + data.current.temp + '°</p>';
        html += '<p class="text-xs text-neutral-500">' + esc(data.current.label) + '</p></div>';
        html += '<div class="ml-auto flex items-center gap-1 text-xs text-neutral-400"><i data-lucide="droplets" class="h-3 w-3"></i>' + data.current.humidity + '%</div>';
        html += '</div>';

        html += '<div class="grid grid-cols-3 gap-2">';
        (data.days || []).forEach(function (d) {
          var dIcon = WEATHER_ICON_MAP_[d.icon] || 'cloud';
          var date = new Date(d.date + 'T00:00:00');
          var isToday = date.toDateString() === new Date().toDateString();
          html += '<div class="flex flex-col items-center rounded-none border border-neutral-200 px-2 py-2.5">';
          html += '<p class="text-[10px] font-medium text-neutral-500">' + (isToday ? '오늘' : esc(date.toLocaleDateString('ko-KR', { weekday: 'short' }))) + '</p>';
          html += '<p class="mb-1 text-[10px] text-neutral-400">' + esc(date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })) + '</p>';
          html += '<i data-lucide="' + dIcon + '" class="my-1 h-6 w-6 text-neutral-700"></i>';
          html += '<p class="mb-1 text-center text-[10px] leading-tight text-neutral-500">' + esc(d.label) + '</p>';
          html += '<div class="flex items-center gap-1 text-xs tabular-nums"><span class="font-medium text-neutral-900">' + d.tempMax + '°</span><span class="text-neutral-400">/ ' + d.tempMin + '°</span></div>';
          html += '<div class="mt-0.5 flex items-center gap-0.5 text-[10px] text-sky-500"><i data-lucide="droplets" class="h-2.5 w-2.5"></i>' + d.precipProb + '%</div>';
          html += '</div>';
        });
        html += '</div></div>';

        container.innerHTML = html;
        refreshIcons();
        container.querySelector('#weather-refresh').addEventListener('click', function () { render(true); });
      }).catch(function (e) {
        console.error(e);
        container.innerHTML = '<div class="flex items-center justify-between px-1 py-2">' +
          '<p class="text-xs text-neutral-400">날씨를 불러오지 못했습니다.</p>' +
          '<button id="weather-retry" class="text-neutral-400 hover:text-neutral-900"><i data-lucide="refresh-cw" class="h-3 w-3"></i></button></div>';
        refreshIcons();
        container.querySelector('#weather-retry').addEventListener('click', function () { render(true); });
      });
    }
    render();
  }

  /* ---- HomeworkDue.html ---- */
function ddayLabelShort_(dateStr) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var d = new Date(dateStr + 'T00:00:00');
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'D-day';
    if (diff > 0) return 'D-' + diff;
    return 'D+' + (-diff);
  }

  function mountHomeworkDue(container) {
    container.innerHTML = '<p class="text-xs text-neutral-400">불러오는 중...</p>';
    Entities.list('Homework', 'date', 500).then(function (data) {
      var t = todayStr();
      var items = data.filter(function (h) { return !h.completed && h.date >= t; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
        .slice(0, 5);

      var html = '<div class="mb-3 flex items-center gap-1.5"><i data-lucide="clipboard-list" class="h-3.5 w-3.5 text-neutral-400"></i>';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">다가오는 숙제</h3></div>';
      if (items.length === 0) {
        html += '<p class="text-xs text-neutral-400">다가오는 숙제가 없습니다.</p>';
      } else {
        html += '<ul class="flex flex-col gap-2">';
        items.forEach(function (h) {
          html += '<li class="flex items-center gap-2 border border-neutral-200 px-3 py-2">';
          html += '<span class="truncate text-xs font-medium text-neutral-900">' + esc(h.title) + '</span>';
          if (h.subject) html += '<span class="text-[10px] text-neutral-400">' + esc(h.subject) + '</span>';
          html += '<span class="ml-auto text-[10px] font-medium text-rose-500">' + ddayLabelShort_(h.date) + '</span>';
          html += '</li>';
        });
        html += '</ul>';
      }
      container.innerHTML = html;
      refreshIcons();
    }).catch(function (e) {
      console.error(e);
      container.innerHTML = '<p class="text-xs text-neutral-400">불러오지 못했습니다.</p>';
    });
  }

  function mountTodayMeal(container) {
    container.innerHTML = '<p class="text-xs text-neutral-400">불러오는 중...</p>';
    loadSchoolMeal().then(function (r) {
      var day = r.days.filter(function (d) { return d.date === todayStr(); })[0];
      var rows = [
        { label: '아침', value: day && day.breakfast },
        { label: '점심', value: day && day.lunch },
        { label: '저녁', value: day && day.dinner }
      ];
      var html = '<div class="mb-3 flex items-center gap-1.5"><i data-lucide="utensils" class="h-3.5 w-3.5 text-neutral-400"></i>';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">오늘 급식</h3>';
      if (r.cached) html += '<span class="ml-1 text-[9px] text-amber-500">캐시</span>';
      html += '</div>';
      if (!day) {
        html += '<p class="text-xs text-neutral-400">오늘 급식 정보가 없습니다.</p>';
      } else {
        html += '<ul class="flex flex-col gap-2">';
        rows.forEach(function (r2) {
          html += '<li class="border border-neutral-200 px-3 py-2">';
          html += '<p class="mb-0.5 text-[10px] font-medium text-emerald-600">' + esc(r2.label) + '</p>';
          html += '<p class="text-xs leading-snug text-neutral-700">' + esc(r2.value || '-') + '</p>';
          html += '</li>';
        });
        html += '</ul>';
      }
      container.innerHTML = html;
      refreshIcons();
    });
  }

  /* ---- Random.html ---- */
var RANDOM_ACCENTS_ = ['bg-indigo-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-violet-500'];

  function mountRandom(container) {
    var text = '';
    var count = 1;
    var results = [];
    var picking = false;

    function getItems() {
      return text.split(/[\n,]/).map(function (s) { return s.trim(); }).filter(function (s) { return !!s; });
    }

    function render() {
      var items = getItems();
      var html = '<div class="flex h-full flex-col">';
      html += '<div class="mb-6 flex items-center gap-2"><i data-lucide="shuffle" class="h-5 w-5 text-neutral-900"></i>';
      html += '<h2 class="font-display text-xl font-medium text-neutral-900">랜덤 뽑기</h2></div>';

      html += '<div class="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">';

      html += '<div class="flex flex-col rounded-none border border-neutral-200 p-5">';
      html += '<textarea id="rnd-text" rows="8" placeholder="사과\n바나나\n포도\n오렌지" class="flex-1 w-full resize-none rounded-none border border-neutral-200 bg-neutral-50 p-4 text-base text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:bg-white focus:outline-none">' + esc(text) + '</textarea>';
      html += '<div class="mt-4 flex items-end gap-3">';
      html += '<div class="w-24"><input id="rnd-count" type="number" min="1" value="' + count + '" class="ui-input rounded-none border-neutral-300 text-center" /></div>';
      html += '<button id="rnd-pick" ' + (picking || items.length === 0 ? 'disabled' : '') + ' class="ui-btn flex-1 rounded-none bg-neutral-900 py-3 text-base text-white hover:bg-neutral-800 disabled:opacity-40"><i data-lucide="shuffle" class="h-4 w-4"></i>' + (picking ? '뽑는 중...' : '뽑기') + '</button>';
      if (results.length > 0) {
        html += '<button id="rnd-reset" class="ui-btn rounded-none border border-neutral-300 bg-white px-4 hover:bg-neutral-50"><i data-lucide="rotate-ccw" class="h-4 w-4"></i></button>';
      }
      html += '</div></div>';

      html += '<div class="relative flex flex-col items-center justify-center overflow-hidden rounded-none border border-neutral-200 bg-neutral-50 p-5">';
      html += '<div class="pointer-events-none absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle, #000 1px, transparent 1px);background-size:16px 16px;"></div>';
      if (picking) {
        html += '<div class="flex flex-col items-center gap-3"><i data-lucide="sparkles" class="h-10 w-10 animate-pulse text-neutral-900"></i></div>';
      } else if (results.length > 0) {
        html += '<div class="relative z-10 flex w-full flex-col items-center gap-3">';
        results.forEach(function (r, i) {
          html += '<div class="flex w-full max-w-md items-center gap-4 rounded-none border border-neutral-200 bg-white px-5 py-4">';
          html += '<span class="flex h-10 w-10 flex-shrink-0 items-center justify-center font-mono text-lg font-semibold text-white ' + RANDOM_ACCENTS_[i % RANDOM_ACCENTS_.length] + '">' + (i + 1) + '</span>';
          html += '<span class="text-lg font-medium text-neutral-900">' + esc(r) + '</span></div>';
        });
        html += '</div>';
      } else {
        html += '<div class="relative z-10 flex flex-col items-center gap-2 text-neutral-300"><i data-lucide="shuffle" class="h-10 w-10"></i></div>';
      }
      html += '</div>';

      html += '</div></div>';

      container.innerHTML = html;
      refreshIcons();

      // 커서 유지를 위해 입력 중에는 전체 재렌더 없이 버튼 상태만 갱신
      var textarea = container.querySelector('#rnd-text');
      textarea.addEventListener('input', function () { text = textarea.value; syncButtons_(); });
      container.querySelector('#rnd-count').addEventListener('input', function (e) { count = Number(e.target.value) || 1; });
      var pickBtn = container.querySelector('#rnd-pick');
      if (pickBtn) pickBtn.addEventListener('click', doPick_);
      var resetBtn = container.querySelector('#rnd-reset');
      if (resetBtn) resetBtn.addEventListener('click', function () { results = []; render(); });
    }

    function syncButtons_() {
      var items = getItems();
      var pickBtn = container.querySelector('#rnd-pick');
      if (pickBtn) pickBtn.disabled = picking || items.length === 0;
    }

    function doPick_() {
      var items = getItems();
      if (items.length === 0) return;
      var n = Math.min(Math.max(1, count), items.length);
      var shuffled = items.slice();
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
      }
      picking = true;
      results = [];
      render();
      setTimeout(function () {
        results = shuffled.slice(0, n);
        picking = false;
        render();
      }, 600);
    }

    render();
  }

  /* ---- Notes.html ---- */
function mountNotes(container) {
    var state = {
      notes: [], activeId: null, title: '', content: '',
      saving: false, saved: false, renamingId: null, renameValue: '',
      saveTimer: null
    };

    function load() {
      return Entities.list('Note', '-updated_date', 200).then(function (data) {
        state.notes = data;
        if (data.length > 0 && !state.activeId) {
          state.activeId = data[0].id;
          state.title = data[0].title || '';
          state.content = data[0].content || '';
        }
        render();
      });
    }

    function scheduleSave_() {
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(doSave_, 800);
    }

    function doSave_() {
      if (!state.activeId) return;
      state.saving = true;
      updateSaveIndicator_();
      var id = state.activeId, t = state.title, c = state.content;
      Entities.update('Note', id, { title: t || '제목 없음', content: c }).then(function () {
        state.notes = state.notes.map(function (n) {
          if (n.id !== id) return n;
          var copy = {}; for (var k in n) copy[k] = n[k];
          copy.title = t || '제목 없음'; copy.content = c; copy.updated_date = new Date().toISOString();
          return copy;
        });
        state.saving = false;
        state.saved = true;
        updateSaveIndicator_();
        setTimeout(function () { state.saved = false; updateSaveIndicator_(); }, 1500);
      }).catch(function (e) { console.error(e); state.saving = false; updateSaveIndicator_(); });
    }

    function saveIndicatorHtml_() {
      if (state.saving) return '<span class="text-[10px] text-neutral-400">저장 중...</span>';
      if (state.saved) return '<span class="flex items-center gap-1 text-[10px] text-emerald-500"><i data-lucide="check" class="h-3 w-3"></i> 저장됨</span>';
      return '';
    }
    function updateSaveIndicator_() {
      var el = document.getElementById('notes-save-indicator');
      if (el) { el.innerHTML = saveIndicatorHtml_(); refreshIcons(); }
      var elModal = document.getElementById('notes-modal-save-indicator');
      if (elModal) elModal.textContent = state.saving ? '저장 중...' : state.saved ? '저장됨' : '';
    }

    function handleNew_() {
      Entities.create('Note', { title: '새 노트', content: '' }).then(function (created) {
        state.notes = [created].concat(state.notes);
        state.activeId = created.id;
        state.title = '새 노트';
        state.content = '';
        render();
      });
    }

    function handleSelect_(note) {
      if (!note) return;
      clearTimeout(state.saveTimer);
      state.activeId = note.id;
      state.title = note.title || '';
      state.content = note.content || '';
      render();
    }

    function handleDelete_(id) {
      Entities.delete('Note', id).then(function () {
        var remaining = state.notes.filter(function (n) { return n.id !== id; });
        state.notes = remaining;
        if (state.activeId === id) {
          if (remaining.length > 0) { handleSelect_(remaining[0]); }
          else { state.activeId = null; state.title = ''; state.content = ''; render(); }
        } else {
          render();
        }
      });
    }

    function startRename_(note) {
      if (!note) return;
      state.renamingId = note.id;
      state.renameValue = note.title || '';
      render();
    }

    function commitRename_() {
      if (state.renamingId && state.renameValue.trim()) {
        var id = state.renamingId, val = state.renameValue.trim();
        Entities.update('Note', id, { title: val }).then(function () {
          state.notes = state.notes.map(function (n) {
            if (n.id !== id) return n;
            var c = {}; for (var k in n) c[k] = n[k]; c.title = val; return c;
          });
          if (state.activeId === id) state.title = val;
          state.renamingId = null; state.renameValue = '';
          render();
        });
      } else {
        state.renamingId = null; state.renameValue = '';
        render();
      }
    }

    function render() {
      var html = '<div class="mb-3 flex items-center justify-between">';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">노트</h3>';
      html += '<div class="flex items-center gap-2">';
      html += '<span id="notes-save-indicator">' + saveIndicatorHtml_() + '</span>';
      html += '<button id="notes-new" class="rounded-none p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"><i data-lucide="plus" class="h-4 w-4"></i></button>';
      if (state.activeId) html += '<button id="notes-expand" class="rounded-none p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900" title="크게 보기"><i data-lucide="maximize-2" class="h-4 w-4"></i></button>';
      html += '</div></div>';

      html += '<div class="grid flex-1 grid-cols-12 gap-3 overflow-hidden">';
      html += '<div class="col-span-4 space-y-1 overflow-y-auto border-r border-neutral-100 pr-2">';
      if (state.notes.length === 0) html += '<p class="py-4 text-center text-[10px] text-neutral-300">노트가 없습니다</p>';
      state.notes.forEach(function (note) {
        if (state.renamingId === note.id) {
          html += '<div class="flex items-center gap-1 px-1 py-1">';
          html += '<input id="notes-rename-input" value="' + esc(state.renameValue) + '" class="w-full rounded-none border border-neutral-300 px-1.5 py-1 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none" />';
          html += '</div>';
        } else {
          var isActive = state.activeId === note.id;
          html += '<div class="group flex w-full items-center justify-between rounded-none px-2 py-1.5 ' + (isActive ? 'bg-neutral-900' : 'hover:bg-neutral-50') + '">';
          html += '<button data-note-select="' + note.id + '" class="flex flex-1 items-center gap-1.5 overflow-hidden text-left">';
          html += '<i data-lucide="file-text" class="h-3 w-3 flex-shrink-0 ' + (isActive ? 'text-white' : 'text-neutral-300') + '"></i>';
          html += '<span class="truncate text-xs ' + (isActive ? 'text-white' : 'text-neutral-700') + '">' + esc(note.title || '제목 없음') + '</span>';
          html += '</button>';
          html += '<div class="flex items-center opacity-0 group-hover:opacity-100">';
          html += '<span data-note-rename="' + note.id + '" class="cursor-pointer rounded-none p-0.5 ' + (isActive ? 'text-white/60 hover:text-white' : 'text-neutral-300 hover:text-neutral-900') + '"><i data-lucide="pencil" class="h-3 w-3"></i></span>';
          html += '<span data-note-delete="' + note.id + '" class="cursor-pointer rounded-none p-0.5 ' + (isActive ? 'text-white/60 hover:text-rose-300' : 'text-neutral-300 hover:text-rose-500') + '"><i data-lucide="trash-2" class="h-3 w-3"></i></span>';
          html += '</div></div>';
        }
      });
      html += '</div>';

      html += '<div class="col-span-8 flex flex-col">';
      if (state.activeId) {
        html += '<input id="notes-title" value="' + esc(state.title) + '" placeholder="제목" class="mb-2 w-full rounded-none border-b border-neutral-100 bg-transparent pb-1 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:outline-none" />';
        html += '<textarea id="notes-content" placeholder="여기에 메모를 입력하세요. 자동으로 저장됩니다." class="flex-1 resize-none rounded-none bg-transparent text-sm leading-relaxed text-neutral-700 placeholder:text-neutral-300 focus:outline-none">' + esc(state.content) + '</textarea>';
      } else {
        html += '<div class="flex flex-1 items-center justify-center text-center"><p class="text-xs text-neutral-300">+ 버튼으로 새 노트를 만드세요</p></div>';
      }
      html += '</div></div>';

      container.innerHTML = html;
      refreshIcons();
      attachHandlers_();
    }

    function attachHandlers_() {
      var newBtn = container.querySelector('#notes-new');
      if (newBtn) newBtn.addEventListener('click', handleNew_);
      var expandBtn = container.querySelector('#notes-expand');
      if (expandBtn) expandBtn.addEventListener('click', openExpandDialog_);

      container.querySelectorAll('[data-note-select]').forEach(function (btn) {
        btn.addEventListener('click', function () { handleSelect_(state.notes.filter(function (n) { return n.id === btn.getAttribute('data-note-select'); })[0]); });
      });
      container.querySelectorAll('[data-note-rename]').forEach(function (el) {
        el.addEventListener('click', function () { startRename_(state.notes.filter(function (n) { return n.id === el.getAttribute('data-note-rename'); })[0]); });
      });
      container.querySelectorAll('[data-note-delete]').forEach(function (el) {
        el.addEventListener('click', function () { handleDelete_(el.getAttribute('data-note-delete')); });
      });

      var renameInput = container.querySelector('#notes-rename-input');
      if (renameInput) {
        renameInput.focus();
        renameInput.addEventListener('input', function (e) { state.renameValue = e.target.value; });
        renameInput.addEventListener('blur', commitRename_);
        renameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') commitRename_(); });
      }

      var titleInput = container.querySelector('#notes-title');
      if (titleInput) titleInput.addEventListener('input', function (e) { state.title = e.target.value; scheduleSave_(); });
      var contentArea = container.querySelector('#notes-content');
      if (contentArea) contentArea.addEventListener('input', function (e) { state.content = e.target.value; scheduleSave_(); });
    }

    function openExpandDialog_() {
      var html = '<div class="-mx-6 -mt-6 mb-4 flex items-center justify-between border-b border-neutral-200 px-5 py-3">';
      html += '<span class="font-display text-sm text-neutral-900">노트 크게 보기</span>';
      html += '<button id="notes-modal-close" class="rounded-none p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"><i data-lucide="minimize-2" class="h-4 w-4"></i></button>';
      html += '</div>';
      html += '<div class="flex h-[70vh] flex-col">';
      html += '<input id="notes-modal-title" value="' + esc(state.title) + '" placeholder="제목" class="mb-3 w-full rounded-none border-b border-neutral-100 bg-transparent pb-2 text-lg font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:outline-none" />';
      html += '<textarea id="notes-modal-content" placeholder="여기에 메모를 입력하세요. 자동으로 저장됩니다." class="flex-1 resize-none rounded-none bg-transparent text-base leading-relaxed text-neutral-700 placeholder:text-neutral-300 focus:outline-none">' + esc(state.content) + '</textarea>';
      html += '<div class="mt-2 flex items-center justify-end text-xs text-neutral-400" id="notes-modal-save-indicator">' + (state.saving ? '저장 중...' : state.saved ? '저장됨' : '') + '</div>';
      html += '</div>';

      var panel = openModal(html, { width: 'max-w-3xl', onClose: render });
      panel.querySelector('#notes-modal-close').addEventListener('click', closeModal);
      panel.querySelector('#notes-modal-title').addEventListener('input', function (e) { state.title = e.target.value; scheduleSave_(); });
      panel.querySelector('#notes-modal-content').addEventListener('input', function (e) { state.content = e.target.value; scheduleSave_(); });
    }

    load();
  }

  /* ---- Timetable.html ---- */
var TT_DAYS_ = ['월', '화', '수', '목', '금', '토', '일'];
  var TT_ROWS_ = [
    { type: 'period', n: 1 }, { type: 'period', n: 2 }, { type: 'period', n: 3 },
    { type: 'break', label: '점심시간' },
    { type: 'period', n: 4 }, { type: 'period', n: 5 },
    { type: 'break', label: '홈룸' },
    { type: 'period', n: 6 }, { type: 'period', n: 7 }
  ];

  function mountTimetable(container) {
    var state = { entries: [] };

    function load() {
      return Entities.list('Timetable', '-created_date', 200).then(function (data) {
        state.entries = data;
        render();
      });
    }

    function mapEntries_() {
      var m = {};
      state.entries.forEach(function (e) { m[e.day + '-' + e.period] = e; });
      return m;
    }

    function render() {
      var map = mapEntries_();
      var html = '<div class="mb-4">';
      html += '<h2 class="font-display text-xl font-medium text-neutral-900">시간표</h2>';
      html += '<p class="text-xs text-neutral-400">빈 칸을 눌러 과목·시간을 입력하고, 등록된 교시를 눌러 상세 보기·수정하세요</p>';
      html += '</div>';

      html += '<div class="overflow-auto rounded-none border border-neutral-200">';
      html += '<table class="w-full border-collapse"><thead><tr>';
      html += '<th class="w-16 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-[10px] font-medium text-neutral-400">교시</th>';
      TT_DAYS_.forEach(function (d) {
        html += '<th class="border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-xs font-medium text-neutral-700">' + d + '</th>';
      });
      html += '</tr></thead><tbody>';

      TT_ROWS_.forEach(function (row, idx) {
        if (row.type === 'break') {
          html += '<tr><td class="border-b border-r border-neutral-200 bg-amber-50 px-2 py-1.5 text-center text-[10px] font-medium text-amber-600">' + row.label + '</td>';
          html += '<td colspan="7" class="border-b border-neutral-200 bg-amber-50/40"></td></tr>';
          return;
        }
        var p = row.n;
        html += '<tr><td class="border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-center text-xs font-medium text-neutral-500">' + p + '교시</td>';
        TT_DAYS_.forEach(function (d) {
          var cell = map[d + '-' + p];
          html += '<td class="border-b border-r border-neutral-200 p-0 align-top">';
          html += '<button data-tt-day="' + d + '" data-tt-period="' + p + '" class="tt-cell-btn group flex h-full min-h-[64px] w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left transition-colors hover:bg-neutral-50">';
          if (cell) {
            html += '<span class="text-xs font-medium text-neutral-900">' + esc(cell.subject || '—') + '</span>';
            if (cell.start_time || cell.end_time) {
              html += '<span class="text-[10px] text-neutral-400">' + esc(cell.start_time || '') + (cell.end_time ? '~' + esc(cell.end_time) : '') + '</span>';
            }
            html += '<span class="mt-0.5 opacity-0 group-hover:opacity-100"><i data-lucide="pencil" class="h-3 w-3 text-neutral-400"></i></span>';
          } else {
            html += '<i data-lucide="plus" class="h-3.5 w-3.5 text-neutral-300"></i>';
          }
          html += '</button></td>';
        });
        html += '</tr>';
      });

      html += '</tbody></table></div>';

      container.innerHTML = html;
      refreshIcons();

      container.querySelectorAll('.tt-cell-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var day = btn.getAttribute('data-tt-day');
          var period = parseInt(btn.getAttribute('data-tt-period'), 10);
          var cell = map[day + '-' + period];
          if (cell) openViewDialog_(day, period, cell); else openEditDialog_(day, period);
        });
      });
    }

    function openViewDialog_(day, period, cell) {
      var html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">' + esc(day) + '요일 ' + period + '교시</h3>';
      html += '<div class="space-y-3">';
      html += '<div><p class="text-[10px] uppercase tracking-wider text-neutral-400">과목</p><p class="text-sm font-medium text-neutral-900">' + esc(cell.subject || '—') + '</p></div>';
      html += '<div><p class="text-[10px] uppercase tracking-wider text-neutral-400">시간</p><p class="text-sm text-neutral-700">' + esc(cell.start_time || '') + (cell.end_time ? ' ~ ' + esc(cell.end_time) : '') + '</p></div>';
      if (cell.detail) html += '<div><p class="text-[10px] uppercase tracking-wider text-neutral-400">세부 내용</p><p class="text-sm text-neutral-700">' + esc(cell.detail) + '</p></div>';
      html += '</div>';
      html += '<div class="mt-4 flex justify-end"><button id="tt-view-edit" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">수정</button></div>';
      var panel = openModal(html, { width: 'sm:max-w-sm' });
      panel.querySelector('#tt-view-edit').addEventListener('click', function () { closeModal(); openEditDialog_(day, period); });
    }

    function openEditDialog_(day, period) {
      var map = mapEntries_();
      var existing = map[day + '-' + period];
      var html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">' + esc(day) + '요일 ' + period + '교시 수정</h3>';
      html += '<div class="space-y-3">';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">과목</label><input id="tt-subject" class="ui-input rounded-none border-neutral-300" placeholder="예: 수학" value="' + esc(existing ? existing.subject || '' : '') + '" /></div>';
      html += '<div class="grid grid-cols-2 gap-3">';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">시작</label><input id="tt-start" type="time" class="ui-input rounded-none border-neutral-300" value="' + esc(existing ? existing.start_time || '' : '') + '" /></div>';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">종료</label><input id="tt-end" type="time" class="ui-input rounded-none border-neutral-300" value="' + esc(existing ? existing.end_time || '' : '') + '" /></div>';
      html += '</div>';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">세부 내용</label><input id="tt-detail" class="ui-input rounded-none border-neutral-300" placeholder="예: 3단원 연습문제" value="' + esc(existing ? existing.detail || '' : '') + '" /></div>';
      html += '</div>';
      html += '<div class="mt-4 flex items-center justify-between">';
      if (existing) {
        html += '<button id="tt-delete" class="ui-btn rounded-none border border-neutral-300 text-rose-500 hover:bg-rose-50"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i> 삭제</button>';
      } else {
        html += '<div></div>';
      }
      html += '<button id="tt-save" class="ui-btn rounded-none bg-neutral-900 text-white hover:bg-neutral-800">저장</button>';
      html += '</div>';

      var panel = openModal(html, { width: 'sm:max-w-sm' });
      panel.querySelector('#tt-subject').focus();

      if (existing) {
        panel.querySelector('#tt-delete').addEventListener('click', function () {
          Entities.delete('Timetable', existing.id).then(function () { closeModal(); return load(); });
        });
      }
      panel.querySelector('#tt-save').addEventListener('click', function () {
        var payload = {
          day: day, period: period,
          subject: panel.querySelector('#tt-subject').value.trim(),
          start_time: panel.querySelector('#tt-start').value,
          end_time: panel.querySelector('#tt-end').value,
          detail: panel.querySelector('#tt-detail').value.trim()
        };
        var p = existing ? Entities.update('Timetable', existing.id, payload) : Entities.create('Timetable', payload);
        p.then(function () { closeModal(); return load(); });
      });
    }

    load();
  }

  /* ---- Homework.html ---- */
var HW_TYPES_ = ['숙제', '준비물', '기타'];
  var HW_TYPE_COLORS_ = { '숙제': 'bg-indigo-500', '준비물': 'bg-amber-500', '기타': 'bg-neutral-500' };

  function mountHomework(container) {
    var state = { items: [], loading: true, form: { title: '', date: todayStr(), subject: '', type: '숙제', notes: '' } };

    function load() {
      state.loading = true;
      return Entities.list('Homework', '-created_date', 500).then(function (data) {
        state.items = data;
        state.loading = false;
        render();
      }).catch(function (e) {
        console.error(e);
        state.loading = false;
        render();
      });
    }

    function visible_() {
      var t = todayStr();
      return state.items.filter(function (it) { return (it.date || '') >= t; }).sort(function (a, b) {
        if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
        if ((a.subject || '') !== (b.subject || '')) return (a.subject || '').localeCompare(b.subject || '');
        return (a.type || '').localeCompare(b.type || '');
      });
    }

    function add_() {
      if (!state.form.title.trim() || !state.form.date) return;
      Entities.create('Homework', {
        title: state.form.title.trim(), date: state.form.date, subject: state.form.subject.trim(),
        type: state.form.type, notes: state.form.notes.trim(), completed: false
      }).then(function () {
        state.form = { title: '', date: todayStr(), subject: '', type: '숙제', notes: '' };
        return load();
      });
    }

    function toggle_(it) {
      Entities.update('Homework', it.id, { completed: !it.completed }).then(load);
    }
    function remove_(it) {
      Entities.delete('Homework', it.id).then(load);
    }

    function render() {
      var visible = visible_();
      var html = '<div class="mb-4 flex items-center gap-2"><i data-lucide="check" class="h-5 w-5 text-neutral-900"></i>';
      html += '<h2 class="font-display text-xl font-medium text-neutral-900">숙제</h2></div>';

      html += '<div class="mb-5 rounded-none border border-neutral-200 p-4">';
      html += '<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">';
      html += '<div class="space-y-1 sm:col-span-2"><label class="text-xs text-neutral-500">이름</label><input id="hw-title" class="ui-input rounded-none border-neutral-300" placeholder="예: 수학 익힘책 12쪽" value="' + esc(state.form.title) + '" /></div>';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">날짜</label><input id="hw-date" type="date" class="ui-input rounded-none border-neutral-300" value="' + esc(state.form.date) + '" /></div>';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">과목</label><input id="hw-subject" class="ui-input rounded-none border-neutral-300" placeholder="예: 수학" value="' + esc(state.form.subject) + '" /></div>';
      html += '<div class="space-y-1"><label class="text-xs text-neutral-500">종류</label><select id="hw-type" class="ui-input rounded-none border-neutral-300">';
      HW_TYPES_.forEach(function (t) { html += '<option value="' + t + '" ' + (state.form.type === t ? 'selected' : '') + '>' + t + '</option>'; });
      html += '</select></div>';
      html += '<div class="space-y-1 sm:col-span-2 lg:col-span-3"><label class="text-xs text-neutral-500">부가 사항</label><input id="hw-notes" class="ui-input rounded-none border-neutral-300" placeholder="예: 풀이까지 적을 것" value="' + esc(state.form.notes) + '" /></div>';
      html += '<div class="flex items-end"><button id="hw-add" class="ui-btn w-full rounded-none bg-neutral-900 text-white hover:bg-neutral-800"><i data-lucide="plus" class="h-4 w-4"></i> 추가</button></div>';
      html += '</div></div>';

      html += '<div class="flex-1 overflow-y-auto">';
      if (state.loading) {
        html += '<div class="py-10 text-center text-sm text-neutral-400">불러오는 중...</div>';
      } else if (visible.length === 0) {
        html += '<div class="flex flex-col items-center justify-center py-16 text-center"><i data-lucide="check" class="mb-3 h-10 w-10 text-neutral-200"></i><p class="text-sm text-neutral-400">등록된 숙제가 없습니다</p></div>';
      } else {
        html += '<div class="space-y-2">';
        visible.forEach(function (it) {
          html += '<div class="group flex items-center gap-3 rounded-none border border-neutral-200 px-3 py-2.5">';
          html += '<button data-hw-toggle="' + it.id + '" class="flex h-5 w-5 flex-shrink-0 items-center justify-center border ' + (it.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-400 bg-white text-transparent hover:border-neutral-700') + '"><i data-lucide="check" class="h-3 w-3"></i></button>';
          html += '<div class="flex-1 overflow-hidden">';
          html += '<div class="flex items-center gap-2"><span class="text-sm font-medium ' + (it.completed ? 'text-neutral-400 line-through' : 'text-neutral-900') + '">' + esc(it.title) + '</span>';
          html += '<span class="h-2 w-2 flex-shrink-0 rounded-full ' + (HW_TYPE_COLORS_[it.type] || 'bg-neutral-500') + '"></span></div>';
          html += '<div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-400"><span class="font-mono">' + esc(it.date) + '</span>';
          if (it.subject) html += '<span>' + esc(it.subject) + '</span>';
          html += '<span>' + esc(it.type) + '</span>';
          if (it.notes) html += '<span class="truncate">· ' + esc(it.notes) + '</span>';
          html += '</div></div>';
          html += '<button data-hw-delete="' + it.id + '" class="rounded-none p-1 text-neutral-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i></button>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '</div>';

      container.innerHTML = html;
      refreshIcons();

      function bindField_(id, key) {
        var el = container.querySelector('#' + id);
        el.addEventListener('input', function (e) { state.form[key] = e.target.value; });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter') add_(); });
      }
      bindField_('hw-title', 'title');
      bindField_('hw-date', 'date');
      bindField_('hw-subject', 'subject');
      bindField_('hw-notes', 'notes');
      container.querySelector('#hw-type').addEventListener('change', function (e) { state.form.type = e.target.value; });
      container.querySelector('#hw-add').addEventListener('click', add_);

      container.querySelectorAll('[data-hw-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () { toggle_(state.items.filter(function (i) { return i.id === btn.getAttribute('data-hw-toggle'); })[0]); });
      });
      container.querySelectorAll('[data-hw-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () { remove_(state.items.filter(function (i) { return i.id === btn.getAttribute('data-hw-delete'); })[0]); });
      });
    }

    load();
  }

  /* ---- School.html ---- */
function mountSchoolTab(container) {
    container.innerHTML =
      '<div class="flex flex-col gap-6">' +
      '<div class="rounded-none border border-neutral-200 p-4" id="school-schedule-box"></div>' +
      '<div class="rounded-none border border-neutral-200 p-4" id="school-meal-box"></div>' +
      '<div class="rounded-none border border-neutral-200 p-4" id="school-notices-box"></div>' +
      '</div>';
    mountSchoolSchedule(document.getElementById('school-schedule-box'));
    mountSchoolMeal(document.getElementById('school-meal-box'));
    mountSchoolNotices(document.getElementById('school-notices-box'));
  }

  function mountSchoolSchedule(container) {
    var state = { items: [], year: null, loading: true, cached: false, syncing: false, msg: '' };

    function load(forceRefresh) {
      state.loading = true;
      render();
      return loadSchoolSchedule(forceRefresh).then(function (r) {
        state.items = r.items; state.year = r.year; state.loading = false; state.cached = r.cached;
        render();
      });
    }

    function sync_() {
      state.syncing = true; state.msg = ''; render();
      Entities.list('Schedule', 'date', 500).then(function (existing) {
        var ex = {};
        existing.forEach(function (e) { ex[e.title + '|' + e.date] = true; });
        var toCreate = state.items.filter(function (it) { return it.date && !ex[it.title + '|' + it.date]; })
          .map(function (it) { return { title: it.title, date: it.date, end_date: it.end_date || '', color: 'emerald' }; });
        var p = toCreate.length ? Entities.bulkCreate('Schedule', toCreate) : Promise.resolve([]);
        return p.then(function () { state.msg = toCreate.length + '건 내 달력에 추가됨'; });
      }).catch(function () { state.msg = '동기화 실패'; })
        .then(function () { state.syncing = false; render(); });
    }

    function render() {
      var today = new Date();
      var year = state.year ? parseInt(state.year, 10) : today.getFullYear();
      var month = today.getMonth();
      var ym = year + '-' + pad2_(month + 1);
      var firstDay = new Date(year, month, 1);
      var startWeekday = firstDay.getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var cells = [];
      for (var i = 0; i < startWeekday; i++) cells.push(null);
      for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

      var evByDate = {};
      (state.items || []).forEach(function (it) {
        if (!it.date) return;
        var cur = new Date(it.date + 'T00:00:00');
        var end = it.end_date ? new Date(it.end_date + 'T00:00:00') : cur;
        while (cur <= end) {
          var k = fmtDate(cur);
          if (k.indexOf(ym) === 0) { if (!evByDate[k]) evByDate[k] = []; evByDate[k].push(it); }
          var nx = new Date(cur); nx.setDate(nx.getDate() + 1); cur = nx;
        }
      });

      var todayStrV = fmtDate(today);
      var upcoming = (state.items || []).filter(function (it) { return it.date && it.date >= todayStrV; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 12);

      var html = '<div class="mb-3 flex items-center justify-between">';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">학사일정 (' + year + '년 ' + (month + 1) + '월)';
      if (state.cached) html += '<span class="ml-1 text-[9px] text-amber-500">캐시</span>';
      html += '</h3>';
      html += '<div class="flex items-center gap-1">';
      html += '<button id="sch-sc-reload" class="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100"><i data-lucide="refresh-cw" class="h-3.5 w-3.5"></i></button>';
      html += '<button id="sch-sc-sync" ' + (state.syncing || state.loading ? 'disabled' : '') + ' class="ui-btn flex items-center gap-1 rounded-none border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"><i data-lucide="calendar-plus" class="h-3.5 w-3.5"></i> ' + (state.syncing ? '동기화중' : '내 달력에 추가') + '</button>';
      html += '</div></div>';
      if (state.msg) html += '<p class="mb-2 text-[11px] text-emerald-600">' + esc(state.msg) + '</p>';

      if (state.loading) {
        html += '<p class="text-xs text-neutral-400">불러오는 중...</p>';
      } else {
        html += '<div class="grid grid-cols-7 border-b border-neutral-200">';
        CAL_WEEKDAYS_.forEach(function (w, i) {
          html += '<div class="py-2 text-center text-xs ' + (i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-neutral-400') + '">' + w + '</div>';
        });
        html += '</div><div class="grid grid-cols-7">';
        cells.forEach(function (date) {
          if (!date) { html += '<div class="min-h-[56px] border-b border-r border-neutral-100"></div>'; return; }
          var ds = fmtDate(date);
          var evs = evByDate[ds] || [];
          var isToday = ds === todayStrV;
          html += '<div class="min-h-[56px] border-b border-r border-neutral-100 p-1 ' + (isToday ? 'bg-neutral-900' : '') + '">';
          html += '<span class="text-[10px] ' + (isToday ? 'text-white' : 'text-neutral-600') + '">' + date.getDate() + '</span>';
          html += '<div class="mt-0.5 flex flex-col gap-0.5">';
          evs.slice(0, 2).forEach(function (ev) {
            html += '<span class="truncate text-[9px] leading-tight ' + (isToday ? 'text-white/90' : 'text-neutral-700') + '">·' + esc(ev.title) + '</span>';
          });
          if (evs.length > 2) html += '<span class="text-[9px] ' + (isToday ? 'text-white/60' : 'text-neutral-400') + '">+' + (evs.length - 2) + '</span>';
          html += '</div></div>';
        });
        html += '</div>';

        html += '<div class="mt-4 border-t border-neutral-200 pt-3">';
        html += '<p class="mb-2 text-[11px] font-medium text-neutral-500">다가오는 학사 일정</p>';
        if (upcoming.length === 0) {
          html += '<p class="text-xs text-neutral-400">다가오는 일정이 없습니다.</p>';
        } else {
          html += '<ul class="flex flex-col gap-1.5">';
          upcoming.forEach(function (it) {
            html += '<li class="flex items-center gap-2 text-xs"><span class="w-24 flex-shrink-0 font-mono text-neutral-500">' + esc(it.date.slice(5)) + (it.end_date && it.end_date !== it.date ? ' ~ ' + esc(it.end_date.slice(5)) : '') + '</span><span class="text-neutral-800">' + esc(it.title) + '</span></li>';
          });
          html += '</ul>';
        }
        html += '</div>';
      }

      container.innerHTML = html;
      refreshIcons();
      container.querySelector('#sch-sc-reload').addEventListener('click', function () { load(true); });
      container.querySelector('#sch-sc-sync').addEventListener('click', sync_);
    }

    load();
  }

  function mountSchoolMeal(container) {
    var state = { days: [], loading: true, cached: false, viewDate: new Date() };

    function load(forceRefresh) {
      state.loading = true;
      render();
      return loadSchoolMeal(forceRefresh).then(function (r) { state.days = r.days; state.cached = r.cached; state.loading = false; render(); });
    }

    function mealByDate_() {
      var m = {}; state.days.forEach(function (d) { m[d.date] = d; }); return m;
    }

    function render() {
      var today = new Date();
      var year = state.viewDate.getFullYear();
      var month = state.viewDate.getMonth();
      var firstDay = new Date(year, month, 1);
      var startWeekday = firstDay.getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var cells = [];
      for (var i = 0; i < startWeekday; i++) cells.push(null);
      for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
      var mealMap = mealByDate_();
      var todayStrV = fmtDate(today);

      var html = '<div class="mb-3 flex items-center justify-between">';
      html += '<div class="flex items-center gap-2">';
      html += '<button id="sch-meal-prev" class="rounded-none p-1 text-neutral-500 hover:bg-neutral-100">‹</button>';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">급식 달력 (' + year + '년 ' + (month + 1) + '월)';
      if (state.cached) html += '<span class="ml-1 text-[9px] text-amber-500">캐시</span>';
      html += '</h3>';
      html += '<button id="sch-meal-next" class="rounded-none p-1 text-neutral-500 hover:bg-neutral-100">›</button>';
      html += '</div>';
      html += '<button id="sch-meal-reload" class="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100"><i data-lucide="refresh-cw" class="h-3.5 w-3.5"></i></button>';
      html += '</div>';

      if (state.loading) {
        html += '<p class="text-xs text-neutral-400">불러오는 중...</p>';
      } else {
        html += '<div class="grid grid-cols-7 border-b border-neutral-200">';
        CAL_WEEKDAYS_.forEach(function (w, i) {
          html += '<div class="py-2 text-center text-xs ' + (i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-neutral-400') + '">' + w + '</div>';
        });
        html += '</div><div class="grid grid-cols-7">';
        cells.forEach(function (date) {
          if (!date) { html += '<div class="min-h-[68px] border-b border-r border-neutral-100"></div>'; return; }
          var ds = fmtDate(date);
          var meal = mealMap[ds];
          var isToday = ds === todayStrV;
          var lunchItems = meal && meal.lunch ? meal.lunch.split(',').slice(0, 2).map(function (s) { return s.trim(); }) : [];
          html += '<button data-meal-date="' + (meal ? ds : '') + '" class="min-h-[68px] border-b border-r border-neutral-100 p-1 text-left ' + (isToday ? 'bg-neutral-900' : '') + ' ' + (meal ? 'cursor-pointer hover:bg-neutral-50' : 'cursor-default') + '">';
          html += '<span class="text-[10px] ' + (isToday ? 'text-white' : 'text-neutral-600') + '">' + date.getDate() + '</span>';
          if (lunchItems.length > 0) html += '<p class="mt-0.5 truncate text-[9px] leading-tight ' + (isToday ? 'text-white/80' : 'text-neutral-500') + '">' + esc(lunchItems.join(', ')) + '</p>';
          html += '</button>';
        });
        html += '</div>';
      }

      container.innerHTML = html;
      refreshIcons();
      container.querySelector('#sch-meal-prev').addEventListener('click', function () { state.viewDate = new Date(year, month - 1, 1); render(); });
      container.querySelector('#sch-meal-next').addEventListener('click', function () { state.viewDate = new Date(year, month + 1, 1); render(); });
      container.querySelector('#sch-meal-reload').addEventListener('click', function () { load(true); });
      container.querySelectorAll('[data-meal-date]').forEach(function (btn) {
        var ds = btn.getAttribute('data-meal-date');
        if (!ds) return;
        btn.addEventListener('click', function () { var meal = mealMap[ds]; if (meal) openMealDialog_(meal); });
      });
    }

    function openMealDialog_(meal) {
      var rows = [
        { label: '아침', value: meal.breakfast, color: 'text-amber-600' },
        { label: '점심', value: meal.lunch, color: 'text-emerald-600' },
        { label: '저녁', value: meal.dinner, color: 'text-sky-600' },
        { label: '간식', value: meal.snack, color: 'text-violet-600' }
      ];
      var html = '<h3 class="mb-4 font-display text-lg font-semibold text-neutral-900">' + esc(meal.date) + ' 급식</h3><div class="space-y-3">';
      rows.forEach(function (r) {
        html += '<div class="border border-neutral-200 p-3"><p class="mb-1 text-xs font-medium ' + r.color + '">' + r.label + '</p><p class="text-sm leading-relaxed text-neutral-800">' + esc(r.value || '-') + '</p></div>';
      });
      html += '</div>';
      openModal(html, { width: 'sm:max-w-lg' });
    }

    load();
  }

  function mountSchoolNotices(container) {
    var state = { items: [], loading: true, cached: false };

    function load(forceRefresh) {
      state.loading = true;
      render();
      return loadSchoolNotices(forceRefresh).then(function (r) { state.items = r.items; state.cached = r.cached; state.loading = false; render(); });
    }

    function render() {
      var html = '<div class="mb-3 flex items-center justify-between">';
      html += '<h3 class="font-display text-sm font-medium text-neutral-900">최근 한 달 공지';
      if (state.cached) html += '<span class="ml-1 text-[9px] text-amber-500">캐시</span>';
      html += '</h3>';
      html += '<button id="sch-notice-reload" class="rounded-none p-1.5 text-neutral-500 hover:bg-neutral-100"><i data-lucide="refresh-cw" class="h-3.5 w-3.5"></i></button>';
      html += '</div>';
      if (state.loading) {
        html += '<p class="text-xs text-neutral-400">불러오는 중...</p>';
      } else if (state.items.length === 0) {
        html += '<p class="text-xs text-neutral-400">최근 한 달 공지가 없습니다.</p>';
      } else {
        html += '<ul class="flex flex-col gap-2">';
        state.items.forEach(function (n) {
          html += '<li class="border border-neutral-200 p-2">';
          html += '<a href="' + esc(n.link) + '" target="_blank" rel="noreferrer" class="group flex items-start gap-1.5">';
          html += '<span class="text-[11px] font-medium text-neutral-900 group-hover:underline">' + esc(n.title) + '</span>';
          html += '<i data-lucide="external-link" class="mt-0.5 h-3 w-3 flex-shrink-0 text-neutral-400"></i></a>';
          html += '<p class="mt-0.5 text-[10px] text-neutral-400">' + esc(n.date) + '</p></li>';
        });
        html += '</ul>';
      }
      container.innerHTML = html;
      refreshIcons();
      container.querySelector('#sch-notice-reload').addEventListener('click', function () { load(true); });
    }

    load();
  }

  /* ---- App.html ---- */
var TABS_ = [
    { key: 'home', label: '홈', icon: 'home' },
    { key: 'random', label: '랜덤 뽑기', icon: 'shuffle' },
    { key: 'notes', label: '노트', icon: 'sticky-note' },
    { key: 'homework', label: '숙제', icon: 'clipboard-list' },
    { key: 'scheduler', label: '스케줄러', icon: 'calendar-days' },
    { key: 'school', label: '학교', icon: 'school' },
  ];

  var currentTab_ = 'home';
  var currentUserEmail_ = '';

  function renderSidebar_() {
    var el = document.getElementById('sidebar-container');
    var html = '<aside class="flex h-screen w-16 flex-col border-r border-neutral-200 bg-white lg:w-56">';
    html += '<div class="flex h-14 items-center justify-center border-b border-neutral-200 lg:justify-start lg:px-4">';
    html += '<span class="font-display text-lg font-bold text-neutral-900">M</span></div>';
    html += '<nav class="flex flex-1 flex-col gap-1 p-2 lg:p-3">';
    TABS_.forEach(function (t) {
      var isActive = currentTab_ === t.key;
      html += '<button data-tab="' + t.key + '" class="flex items-center justify-center gap-2 rounded-none px-3 py-2.5 text-xs font-medium transition-colors lg:justify-start ' +
        (isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900') + '">';
      html += '<i data-lucide="' + t.icon + '" class="h-4 w-4 flex-shrink-0"></i>';
      html += '<span class="hidden lg:block">' + t.label + '</span></button>';
    });
    html += '</nav>';
    html += '<div class="border-t border-neutral-200 p-2 lg:p-3">';
    html += '<div class="hidden truncate px-2 py-1 text-[10px] text-neutral-400 lg:block" title="' + esc(currentUserEmail_) + '">' + esc(currentUserEmail_) + '</div>';
    html += '<button id="sidebar-logout" class="flex w-full items-center justify-center gap-2 rounded-none px-3 py-2.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 lg:justify-start">';
    html += '<i data-lucide="log-out" class="h-4 w-4"></i><span class="hidden lg:block">로그아웃</span></button>';
    html += '</div></aside>';
    el.innerHTML = html;
    refreshIcons();
    el.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab_(btn.getAttribute('data-tab')); });
    });
    el.querySelector('#sidebar-logout').addEventListener('click', function () {
      // Apps Script 웹앱은 base44 로그인 대신 Google 계정 로그인을 그대로 사용하므로,
      // 앱 내부에서 로그아웃할 수는 없고 구글 계정 전환/로그아웃 페이지를 열어줍니다.
      window.open('https://accounts.google.com/Logout', '_blank');
    });
  }

  function switchTab_(key) {
    if (window.__cleanupCurrentTab) {
      try { window.__cleanupCurrentTab(); } catch (e) {}
      window.__cleanupCurrentTab = null;
    }
    currentTab_ = key;
    renderSidebar_();
    mountTab_(key);
  }

  function mountTab_(key) {
    var main = document.getElementById('main-content');
    if (key === 'home') {
      main.innerHTML =
        '<div class="mx-auto max-w-[1150px] px-6 py-6">' +
        '<div id="home-dday"></div>' +
        '<div class="grid grid-cols-1 gap-6 lg:grid-cols-12">' +
        '<div class="rounded-none border border-neutral-200 p-5 lg:col-span-8" id="home-calendar"></div>' +
        '<div class="h-[500px] overflow-hidden rounded-none border border-neutral-200 p-4 lg:col-span-4 lg:h-[580px]" id="home-bookmarks"></div>' +
        '</div>' +
        '<div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">' +
        '<div class="rounded-none border border-neutral-200 p-4" id="home-weather"></div>' +
        '<div class="rounded-none border border-neutral-200 p-4" id="home-hwdue"></div>' +
        '<div class="rounded-none border border-neutral-200 p-4" id="home-meal"></div>' +
        '</div></div>';
      var homeSchedulesPromise = Entities.list('Schedule', '-date', 500);
      mountDDayBar(document.getElementById('home-dday'), homeSchedulesPromise);
      mountCalendar(document.getElementById('home-calendar'), homeSchedulesPromise);
      mountBookmarks(document.getElementById('home-bookmarks'));
      mountWeather(document.getElementById('home-weather'));
      mountHomeworkDue(document.getElementById('home-hwdue'));
      mountTodayMeal(document.getElementById('home-meal'));
      return;
    }

    main.innerHTML = '<div class="mx-auto h-full max-w-[1100px] px-6 py-6" id="tab-body"></div>';
    var body = document.getElementById('tab-body');
    if (key === 'bookmarks') mountBookmarks(body);
    else if (key === 'random') mountRandom(body);
    else if (key === 'notes') mountNotes(body);
    else if (key === 'homework') mountHomework(body);
    else if (key === 'scheduler') mountTimetable(body);
    else if (key === 'school') mountSchoolTab(body);
  }

  export function initDashboard() {
    if (typeof window === 'undefined' || window.__myDashboardInitialized) return;
    window.__myDashboardInitialized = true;
    currentUserEmail_ = '';
    renderSidebar_();
    mountTab_('home');
  }
