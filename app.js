/* Health Dashboard — client-side screen navigation (no backend).
   Groups the report's existing sections into tab-screens at runtime, using the
   HTML marker comments as stable boundaries (they survive report regeneration).
   Keeps the PWA offline: pure DOM, no data fetching. */
(function () {
  "use strict";

  var SCREENS = [
    { id: "obzor",    icon: "M3 10.5 12 3l9 7.5 M5 9v11h5v-6h4v6h5V9", label: "Обзор" },
    { id: "pitanie",  icon: "M5 3v6a3 3 0 0 0 6 0V3 M8 3v18 M18 3c-3 3-4 7-4 10h4 M18 3v18", label: "Питание" },
    // «Восстановление» named one fifth of what is here (sleep) and was already truncated to
    // «Восст.» in the bar. The tab is weight-to-goal, sleep, training and their weekly and
    // monthly series — all of it change over time. The id stays `vosst` on purpose: it is
    // internal (screen-vosst) and renaming it buys nothing but churn.
    { id: "vosst",    icon: "M3 4v16h18 M6 15l4-5 4 2 6-7", label: "Динамика" },
    { id: "analizy",  icon: "m10 4 2-2 5 5-2 2z M12 7l-4 5 3 2 4-5 M9 15l-3-2 M16 11a5 5 0 0 1-3 9 M5 21h14", label: "Анализы" },
    { id: "protokol", icon: "M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0z M9 8l7 7", label: "Протокол" },
    { id: "medcard", icon: "M3 7V5a1 1 0 0 1 1-1h5l2 3h8a2 2 0 0 1 2 2v10H3z M9 13h6 M12 10v6", label: "Медкарта" }
  ];

  // Older reports group sections by their boundary comments. New sections name their screen.
  function screenFor(c) {
    if (c.trim() === "WEEKLY PROGRESS") return "vosst";
    if (c.trim() === "NUTRITION") return "pitanie";
    if (c.indexOf("CHARTS_HEALTH:START") >= 0)    return "vosst";      // full charts live on detail tabs;
    if (c.indexOf("CHARTS_NUTRITION:START") >= 0)  return "pitanie";   // Overview shows bento tiles built from them
    if (c.indexOf("CHARTS_LABS:START") >= 0)       return "analizy";
    if (c.indexOf("КЛЮЧЕВЫЕ НАХОДКИ") >= 0)   return "obzor";
    if (c.indexOf("АНАЛИЗ ПО МЕСЯЦАМ") >= 0)   return "vosst";
    if (c.indexOf("ЕЖЕНЕДЕЛЬНЫЙ") >= 0)        return "vosst";
    if (c.indexOf("2c. ПИТАНИЕ") >= 0)         return "pitanie";
    if (c.indexOf("3. СОН") >= 0)              return "vosst";
    if (c.indexOf("ТРЕНИРОВОЧНЫЙ") >= 0)       return "vosst";
    if (c.indexOf("5. ПИТАНИЕ") >= 0)          return "pitanie";
    if (c.indexOf("ФАРМПРОТОКОЛ") >= 0)        return "protokol";
    if (c.indexOf("НООТРОПЫ") >= 0)            return "protokol";
    if (c.indexOf("LABS:START") >= 0)          return "analizy";   // CHARTS_LABS already handled above
    if (c.indexOf("ДОБАВКИ") >= 0)             return "protokol";
    if (c.indexOf("ПРИОРИТЕТНЫЙ") >= 0)        return "protokol";
    return null;
  }

  // Открытие конкретной вкладки по адресу (#pitanie, #analizy …) — ради ярлыков манифеста
  // (shortcuts) и чтобы вкладку можно было сохранить/поделиться. Возвращает id только если
  // это реальный экран, иначе null (мусор в хэше молча игнорируется).
  function fromHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (/^pitanie\/[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(h)) return "pitanie";
    return SCREENS.some(function (s) { return s.id === h; }) ? h : null;
  }

  /* ---- Честность данных ---------------------------------------------------
     Приложение по своей природе показывает прошлое: в офлайне service worker отдаёт кэш, а
     онлайн страница ровно так же свежа, как последний прогон генератора. 21–22.07 ежечасная
     джоба Mac лежала сутки, и приложение всё это время уверенно показывало вчерашние числа —
     ни одного признака, что это вчерашние. Полоса закрывает оба случая одним правилом: важен
     ВОЗРАСТ данных, а не причина.

     Порог 12 часов, а не час: ночью Mac спит и утренний прогон в 08:44 — это законные ~9 часов
     без обновления. Сторож снапшота на сервере держит суточный порог по той же причине. */
  var STALE_H = 12;

  function generatedAt() {
    var m = document.querySelector('meta[name="generated"]');
    if (!m) return null;
    var d = new Date(m.getAttribute("content"));
    return isNaN(d.getTime()) ? null : d;
  }

  function freshnessBar() {
    var when = generatedAt();
    var bar = document.getElementById("freshness");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "freshness";
      bar.className = "freshness";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    var offline = navigator.onLine === false;
    var ageH = when ? (Date.now() - when.getTime()) / 3600000 : null;
    var stale = ageH !== null && ageH > STALE_H;
    if (!offline && !stale) { bar.style.display = "none"; return; }

    var stamp = when
      ? when.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit",
                                       hour: "2-digit", minute: "2-digit" })
      : "неизвестно когда";
    bar.className = "freshness" + (offline ? " off" : " stale");
    bar.innerHTML = (offline ? "📴 Офлайн · данные на " : "⏳ Данные не обновлялись · собраны ")
      + stamp + (ageH !== null ? " (" + Math.round(ageH) + " ч назад)" : "")
      + '<button class="freshness-btn" type="button">Обновить</button>';
    bar.style.display = "";
    bar.querySelector(".freshness-btn").addEventListener("click", function () {
      location.reload();
    });
  }

  // Only wide timeline SVGs need scrolling. Laboratory gauges and calorie rings stay fitted.
  // Dates describe the displayed value, never the publication timestamp.
  function freshnessInfo(stamp, now) {
    stamp = stamp || {};
    now = now || new Date();
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(stamp.date || "");
    var offline = navigator.onLine === false;
    if (!match) return { text: "Дата данных не указана" + (offline ? " · офлайн" : ""), state: "unknown" };
    var y = +match[1], m = +match[2], d = +match[3];
    var day = new Date(Date.UTC(y, m - 1, d));
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
      return { text: "Дата данных не указана", state: "unknown" };
    }
    var age = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - day.getTime()) / 86400000);
    var date = match[3] + "." + match[2] + "." + match[1];
    var labels = { measurement: "Замер", night: "Ночь", workout: "Последняя тренировка", blood_draw: "Забор", diary: "Дневник", revision: "Редакция", window: "Данные по", calculation: "Расчёт" };
    labels.review = 'Разбор';
    var text = (labels[stamp.kind] || "Данные") + " " + date;
    var state = "dated";
    if (age < 0) { text += " · дата в будущем"; state = "unknown"; }
    else if (stamp.kind === "diary" && stamp.has_data === false) { text += " · записей нет"; state = "missing"; }
    else if (typeof stamp.max_age_days === "number" && age > stamp.max_age_days) {
      text += " · " + age + " дн. назад";
      state = "stale";
    }
    if (offline) text += " · офлайн";
    return { text: text, state: state };
  }

  function attachFreshness(parent, stamp) {
    var line = document.createElement("div");
    line.className = "data-freshness";
    line.dataset.stamp = JSON.stringify(stamp || {});
    parent.appendChild(line);
    return line;
  }

  function updateCardFreshness() {
    document.querySelectorAll(".data-freshness[data-stamp]").forEach(function (line) {
      var stamp;
      try { stamp = JSON.parse(line.dataset.stamp); } catch (e) { stamp = {}; }
      var info = freshnessInfo(stamp);
      line.textContent = info.text;
      line.dataset.state = info.state;
    });
  }
  window.HealthFreshness = { describe: freshnessInfo, update: updateCardFreshness };

  function element(tag, cls, label) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function overviewDay(nutrition, openNutrition) {
    var days = Array.from(nutrition.querySelectorAll('.energy-days input[data-day]'));
    if (!days.length) return null;
    var section = element('section', 'overview-day');
    var title = element('h2', '', 'Калории за день');
    var controls = element('div', 'overview-date');
    var previous = element('button', '', '‹'), next = element('button', '', '›');
    previous.type = next.type = 'button';
    previous.setAttribute('aria-label', 'Предыдущий день дневника');
    next.setAttribute('aria-label', 'Следующий день дневника');
    var date = element('time'), value = element('strong', 'overview-value');
    var comparison = element('p'), state = element('p', 'overview-state');
    var range = nutrition.querySelector('.energy-band-key');
    var result = element('div', 'overview-result');
    result.setAttribute('aria-live', 'polite');
    var link = element('button', 'overview-open', 'Открыть питание');
    link.type = 'button';
    link.addEventListener('click', openNutrition);
    controls.append(previous, date, next);
    result.append(value, comparison);
    if (range) result.appendChild(element('p', 'overview-state', range.textContent));
    result.appendChild(state);
    section.append(title, controls, result, link);
    function active() { return days.findIndex(function (day) { return day.checked; }); }
    function refresh() {
      var index = active();
      if (index < 0) return;
      var data = days[index].dataset;
      date.dateTime = data.day;
      date.textContent = new Date(data.day + 'T12:00:00').toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
      value.textContent = data.amount;
      comparison.textContent = data.comparison;
      state.textContent = data.completeness;
      state.hidden = !data.completeness;
      previous.disabled = index === 0;
      next.disabled = index === days.length - 1;
    }
    function move(offset) {
      var target = days[active() + offset];
      if (target) { target.checked = true; target.dispatchEvent(new Event('change', {bubbles:true})); }
    }
    previous.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    days.forEach(function (day) { day.addEventListener('change', refresh); });
    refresh();
    return section;
  }

  function prepareWeightChart(screen) {
    var svg = screen.querySelector('.table-wrap > svg[aria-label^="График веса"]');
    if (!svg || svg.closest('.weight-detail') || !svg.querySelector('polyline')) return;
    var wrap = svg.parentNode, bounds = svg.viewBox.baseVal;
    if (!bounds.width || !bounds.height) return;
    var compact = svg.cloneNode(true), width = 320, scale = width / bounds.width;
    compact.setAttribute('viewBox', '0 0 ' + width + ' ' + bounds.height);
    compact.setAttribute('width', '100%');
    compact.classList.add('weight-overview');
    compact.querySelectorAll('[x],[x1],[cx]').forEach(function (node) {
      ['x','x1','x2','cx','width'].forEach(function (key) {
        if (node.hasAttribute(key)) node.setAttribute(key, Number(node.getAttribute(key)) * scale);
      });
    });
    compact.querySelectorAll('polyline').forEach(function (line) {
      Array.from(line.points).forEach(function (point) { point.x *= scale; });
    });
    var last = -Infinity;
    compact.querySelectorAll('text[text-anchor="middle"]').forEach(function (label) {
      var x = Number(label.getAttribute('x'));
      if (x - last < 40) label.remove();
      else { last = x; label.setAttribute('x', Math.max(14, Math.min(width - 14, x))); }
    });
    var full = element('details', 'weight-detail collapse');
    full.appendChild(element('summary', '', 'Подробный график веса'));
    wrap.before(compact, full);
    full.appendChild(wrap);
    var wide = window.matchMedia('(min-width:761px)');
    function adjust() { full.open = wide.matches; }
    adjust();
    wide.addEventListener('change', adjust);
    full.addEventListener('toggle', function () { if (full.open) prepareCharts(screen); });
  }

  function compactTables(labs, protocol) {
    [labs, protocol].forEach(function (screen) {
      screen.querySelectorAll('table.data-table').forEach(function (table) {
        var header = table.tHead && table.tHead.rows[0];
        if (!header || !table.tBodies[0]) return;
        var columns = Array.from(header.cells);
        var isLab = screen === labs && columns[0].textContent.includes('Показатель / единица');
        if (!isLab && (screen !== protocol || columns[0].textContent.trim() !== 'Позиция')) return;
        var list = element('div', 'compact-records');
        Array.from(table.tBodies[0].rows).forEach(function (row) {
          var cells = Array.from(row.cells);
          if (cells.length !== columns.length) return;
          var index = isLab ? cells.length - 1 : 1;
          while (isLab && index > 0 && cells[index].textContent.trim() === '—') index--;
          if (!index) return;
          var item = element('details', 'compact-record'), summary = element('summary');
          var marker = cells[0].querySelector('strong') || cells[0];
          summary.appendChild(element('strong', '', marker.textContent.trim()));
          var reading = isLab ? (cells[index].firstChild.textContent || '').trim() : cells[index].textContent.trim();
          var unit = isLab && cells[0].querySelector('.small');
          var stamp = isLab ? columns[index].firstChild.textContent.trim() : '';
          summary.appendChild(element('span', '', [reading, unit && unit.textContent, stamp].filter(Boolean).join(' · ')));
          item.appendChild(summary);
          cells.slice(1).forEach(function (cell, i) {
            if (cell.textContent.trim() === '—') return;
            var line = element('div', 'compact-field');
            line.appendChild(element('b', '', columns[i+1].innerText || columns[i+1].textContent));
            var content = element('div');
            Array.from(cell.childNodes).forEach(function (node) { content.appendChild(node.cloneNode(true)); });
            line.appendChild(content);
            item.appendChild(line);
          });
          list.appendChild(item);
        });
        if (list.childElementCount) {
          table.parentNode.classList.add('has-compact-records');
          table.parentNode.before(list);
        }
      });
    });
  }

  function prepareCharts(screen) {
    prepareWeightChart(screen);
    screen.querySelectorAll('.table-wrap').forEach(function (wrap) {
      if (!wrap.clientWidth) return;
      var svg = wrap.querySelector(':scope > svg');
      if (!svg || !svg.viewBox || svg.viewBox.baseVal.width < 600) return;
      wrap.classList.add('chart-scroll');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'График: прокручивайте для просмотра всего периода');
      wrap.tabIndex = 0;
      var hint = wrap.nextElementSibling;
      if (!hint || !hint.classList.contains('chart-hint')) {
        hint = document.createElement('p');
        hint.className = 'chart-hint';
        hint.textContent = '↔ Проведите по графику, чтобы посмотреть весь период';
        wrap.parentNode.insertBefore(hint, wrap.nextSibling);
      }
      var overflow = wrap.scrollWidth > wrap.clientWidth + 1;
      hint.hidden = !overflow;
      if (overflow && !wrap.dataset.chartPositioned) {
        wrap.scrollLeft = wrap.scrollWidth - wrap.clientWidth;
        wrap.dataset.chartPositioned = '1';
      }
    });
  }

  function setupVisit(section) {
    if (!section || section.dataset.visitReady) return;
    var panel = section.querySelector('.visit-prep');
    if (!panel) return;
    section.dataset.visitReady = '1';
    var cards = Array.from(section.querySelectorAll('.med-review-card'));
    var preview = panel.querySelector('.visit-preview');
    var area = preview.querySelector('textarea');
    var status = panel.querySelector('.visit-status');
    var prepare = panel.querySelector('[data-visit-prepare]');
    function selected() { return cards.filter(function (c) { var box = c.querySelector('[data-visit-select]'); return box && box.checked; }); }
    function changed() {
      var count = selected().length;
      preview.hidden = true; area.value = '';
      prepare.disabled = count === 0;
      status.textContent = 'Выбрано позиций: ' + count + '. Фильтр не меняет выбор.';
    }
    cards.forEach(function (card) {
      var box = card.querySelector('[data-visit-select]');
      if (box) box.addEventListener('change', changed);
    });
    panel.querySelectorAll('[data-review-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        var first = button.dataset.reviewFilter === 'first';
        cards.forEach(function (card) { card.hidden = first && card.dataset.reviewPriority !== '1'; });
        panel.querySelectorAll('[data-review-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      });
    });
    prepare.addEventListener('click', function () {
      var rows = selected();
      if (!rows.length) return;
      area.value = panel.querySelector('.visit-summary-header').content.textContent + '\n\n' + rows.map(function (card, i) {
        return (i + 1) + '. ' + card.querySelector('.visit-summary-part').content.textContent;
      }).join('\n\n');
      preview.hidden = false;
      status.textContent = 'Сводка подготовлена по данным приложения на ' + panel.dataset.visitDate + '. Выбрано позиций: ' + rows.length + '.';
      area.focus({preventScroll: true});
      area.setSelectionRange(0, 0); area.scrollTop = 0;
    });
    panel.querySelector('[data-visit-copy]').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(area.value);
        status.textContent = 'Сводка скопирована в буфер обмена.';
      } catch (e) {
        area.focus(); area.select();
        status.textContent = 'Текст выделен. Скопируйте его вручную.';
      }
    });
    panel.querySelector('[data-visit-download]').addEventListener('click', function () {
      var url = URL.createObjectURL(new Blob([area.value], {type: 'text/plain;charset=utf-8'}));
      var link = document.createElement('a');
      link.href = url; link.download = 'visit-summary-' + panel.dataset.visitDate + '.txt';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      status.textContent = 'Файл подготовлен для сохранения на устройстве.';
    });
    changed();
  }

  async function originalBytes(record, id) {
    var node = record.querySelector('[id="medical-file-' + id + '"]');
    if (!node || !/^[a-f0-9]{20}$/.test(id)) throw new Error('missing-original');
    var file = JSON.parse(node.textContent);
    if (typeof file.data !== 'string' || file.data.length > 8 * 1024 * 1024 * 4 / 3 + 8 ||
        typeof file.sha !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha) || file.sha.slice(0, 20) !== id ||
        typeof file.name !== 'string' || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mime)) throw new Error('invalid-original');
    var bytes = Uint8Array.from(atob(file.data), function (c) { return c.charCodeAt(0); });
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('original-size');
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    var sha = Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    if (sha !== file.sha) throw new Error('original-integrity');
    return {name: file.name, mime: file.mime, bytes: bytes};
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a'); link.href = url; link.download = name;
    try { document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); }
  }

  // ZIP method 0 preserves original PDF/image bytes. No library, network or compression worker.
  function zipOriginals(files) {
    if (!files.length || files.length > 65535) throw new Error('archive-count');
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var value = n;
      for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
      table[n] = value >>> 0;
    }
    var now = new Date();
    var date = ((Math.max(1980, Math.min(2107, now.getFullYear())) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    var parts = [], directory = [], offset = 0, total = 0, directorySize = 0;
    files.forEach(function (file, index) {
      total += file.bytes.length;
      if (total > 32 * 1024 * 1024) throw new Error('archive-size');
      // Numbered flat paths avoid collisions, traversal, device names and case-folding issues.
      var clean = file.name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '') || 'document';
      var suffix = /\.(pdf|png|jpe?g)$/i.exec(clean);
      var extension = suffix ? suffix[0] : {'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg'}[file.mime];
      clean = (suffix ? clean.slice(0, -extension.length) : clean).slice(0, 140) + extension;
      var name = new TextEncoder().encode(String(index + 1).padStart(2, '0') + '-' + clean);
      var crc = 0xffffffff;
      for (var i = 0; i < file.bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ file.bytes[i]) & 255];
      crc = (crc ^ 0xffffffff) >>> 0;
      var local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
      l.setUint16(10, time, true); l.setUint16(12, date, true); l.setUint32(14, crc, true);
      l.setUint32(18, file.bytes.length, true); l.setUint32(22, file.bytes.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
      var central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, file.bytes.length, true); c.setUint32(24, file.bytes.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true); central.set(name, 46);
      parts.push(local, file.bytes); directory.push(central);
      offset += local.length + file.bytes.length; directorySize += central.length;
    });
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(directory, [end]), {type: 'application/zip'});
  }

  function setupMedicalPackage(record) {
    var panel = record.querySelector('[data-medical-package]');
    if (!panel) return;
    var boxes = Array.from(record.querySelectorAll('[data-medical-package-select]'));
    var download = panel.querySelector('[data-medical-package-download]');
    var list = panel.querySelector('[data-medical-package-list]');
    var count = panel.querySelector('[data-medical-package-count]');
    var status = panel.querySelector('[data-medical-package-status]');
    var all = panel.querySelector('[data-medical-package-all]'), clear = panel.querySelector('[data-medical-package-clear]');
    var busy = false;
    function selected() { return boxes.filter(function (box) { return box.checked; }); }
    function update() {
      var chosen = selected(), size = chosen.reduce(function (sum, box) { return sum + Number(box.dataset.documentSize); }, 0);
      count.textContent = 'Выбрано документов: ' + chosen.length + (chosen.length ? ' · ' + (size / 1024 / 1024).toFixed(2) + ' МБ' : '') + '.';
      list.replaceChildren(); list.hidden = !chosen.length;
      chosen.forEach(function (box) { var item = document.createElement('li'); item.textContent = box.dataset.documentName; list.appendChild(item); });
      download.disabled = busy || !chosen.length; all.disabled = busy || chosen.length === boxes.length; clear.disabled = busy || !chosen.length;
      boxes.forEach(function (box) { box.disabled = busy; });
    }
    boxes.forEach(function (box) {
      box.checked = false; // No implicit carry-over or automatic inclusion after reopening.
      box.addEventListener('change', function () { status.textContent = ''; update(); });
    });
    all.addEventListener('click', function () { boxes.forEach(function (box) { box.checked = true; }); status.textContent = ''; update(); });
    clear.addEventListener('click', function () { boxes.forEach(function (box) { box.checked = false; }); status.textContent = ''; update(); });
    download.addEventListener('click', async function () {
      if (busy) return;
      var chosen = selected(); if (!chosen.length) return;
      busy = true; update(); status.textContent = 'Проверяю выбранные оригиналы и собираю пакет…';
      try {
        var files = [], ids = new Set(), total = 0;
        for (var box of chosen) {
          var id = box.dataset.medicalPackageSelect;
          if (ids.has(id)) throw new Error('duplicate-original');
          ids.add(id);
          var file = await originalBytes(record, id);
          if (file.name !== box.dataset.documentName || file.bytes.length !== Number(box.dataset.documentSize)) throw new Error('selection-changed');
          total += file.bytes.length; if (total > 32 * 1024 * 1024) throw new Error('archive-size');
          files.push(file);
        }
        saveBlob(zipOriginals(files), 'health-documents-' + new Date().toISOString().slice(0, 10) + '.zip');
        status.textContent = 'Пакет из ' + files.length + ' документов передан браузеру для сохранения. Оригиналы проверены; файлы не защищены паролем.';
      } catch (error) {
        status.textContent = 'Пакет не скачан: не удалось проверить один из выбранных оригиналов или подготовить архив. Обновите приложение и повторите; при необходимости снимите выбор с недоступного файла.';
      } finally { busy = false; update(); }
    });
    update();
  }

  function setupMedicalTimeline(record) {
    var panel = record.querySelector('.medical-timeline');
    if (!panel) return;
    var kind = 'all', expanded = false;
    var items = Array.from(panel.querySelectorAll('.medical-timeline-item'));
    var search = record.querySelector('[data-record-home]') ? null : record.querySelector('[data-medical-search]');
    var uncertain = panel.querySelector('[data-timeline-only-uncertain]');
    var more = panel.querySelector('[data-timeline-more]');
    var status = panel.querySelector('[data-timeline-count]');
    function update() {
      var query = search ? search.value.trim().toLocaleLowerCase() : '';
      var found = 0, visible = 0;
      panel.querySelectorAll('[data-timeline-group]').forEach(function (group) {
        var inGroup = 0;
        items.filter(function (item) { return group.contains(item); }).forEach(function (item) {
          var matches = (kind === 'all' || item.dataset.timelineKind === kind) &&
            (!uncertain.checked || item.dataset.timelineUncertain === 'true') &&
            (!query || item.textContent.toLocaleLowerCase().includes(query));
          if (matches) { found++; inGroup++; }
          item.parentElement.hidden = !matches || (!expanded && inGroup > 12);
          if (!item.parentElement.hidden) visible++;
        });
        group.hidden = !inGroup;
      });
      more.hidden = found <= visible;
      status.textContent = found ? 'Показано записей: ' + visible + ' из ' + found + '. Сначала новые; даты без уточнения — отдельно.' :
        (uncertain.checked ? 'Нет записей с вопросами к вам для выбранного раздела и поиска.' : 'Нет записей для выбранного фильтра и поиска.');
    }
    panel.querySelectorAll('[data-timeline-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        kind = button.dataset.timelineFilter; expanded = false;
        panel.querySelectorAll('[data-timeline-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        update();
      });
    });
    uncertain.checked = false;
    uncertain.addEventListener('change', function () { expanded = false; update(); });
    if (search) search.addEventListener('input', function () { expanded = false; update(); });
    more.addEventListener('click', function () { expanded = true; update(); });
    update();
  }

  function setupRecordOverview(record) {
    var home = record.querySelector('[data-record-home]');
    if (!home) return false; // Existing reports retain their original text filter.
    var index = JSON.parse(record.querySelector('[data-record-index]').textContent);
    var search = home.querySelector('[data-medical-search]');
    var overview = home.querySelector('[data-record-overview]');
    var results = home.querySelector('[data-record-results]');
    var list = results.querySelector('[data-record-list]');
    var status = record.querySelector('[data-medical-found]');
    var back = record.querySelector('[data-record-back]');
    var about = record.querySelector('[data-record-about]');
    var panels = Array.from(record.querySelectorAll('[data-record-panel]'));
    var pages = [{target: null}], depth = 0;
    var dates = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
    function displayDate(value) {
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dates.format(new Date(value+'T00:00:00Z')).replace(/ г\.$/, '') : value;
    }
    overview.querySelectorAll('time').forEach(function (time) { time.textContent = displayDate(time.dateTime); });
    // Refreshing the document creates new DOM targets. Only restore entries from this instance.
    var instance = String(Date.now()) + '-' + Math.random();
    function normalize(text) { return text.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim(); }
    function renderList(container, entries) {
      container.replaceChildren();
      var unknown = false;
      entries.forEach(function (entry) {
        if (!entry.date && !unknown) {
          var heading = document.createElement('h4');
          heading.textContent = 'Без календарной даты'; container.appendChild(heading); unknown = true;
        }
        var link = document.createElement('a'), date = document.createElement('span');
        var group = document.createElement('span'), title = document.createElement('strong');
        var source = document.createElement('small');
        link.className = 'record-row'; link.href = '#' + entry.target; link.dataset.medicalSource = '';
        date.className = 'record-date'; date.textContent = displayDate(entry.date) || 'Без даты';
        title.textContent = entry.title; source.textContent = entry.source + ' · ' + entry.meaning;
        group.append(title, source); link.append(date, group); container.appendChild(link);
      });
    }
    function updateSearch() {
      var query = normalize(search.value);
      results.hidden = !query; overview.hidden = !!query;
      if (!query) { list.replaceChildren(); status.textContent = ''; return; }
      prepareIndex();
      var words = query.split(/\s+/);
      var matches = index.filter(function (entry) {
        return words.every(function (word) { return entry.searchable.includes(word); });
      });
      renderList(list, matches);
      var count = matches.length;
      status.textContent = count ? 'Найдено записей: ' + count : 'Совпадений нет. Попробуйте другое слово.';
    }
    var indexReady = false;
    function prepareIndex() {
      if (indexReady) return;
      var sources = new Map();
      index.forEach(function (entry) {
        var node = entry.textTarget && document.getElementById(entry.textTarget);
        if (node && record.contains(node) && !sources.has(node.id)) {
          // Read nested versions and visit notes without traversing the embedded PDF payloads.
          var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: function (part) {
              if (part.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
              return part.matches('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
            }
          });
          var words = [], part;
          while ((part = walker.nextNode())) words.push(part.textContent);
          sources.set(node.id, words.join(' '));
        }
        entry.searchable = normalize([entry.title, entry.date, entry.source, entry.meaning, entry.terms,
                                      sources.get(entry.textTarget)].join(' '));
      });
      indexReady = true;
    }
    function focusNode(node) {
      if (!node) return;
      if (!node.matches('a[href],button,input,summary,[tabindex]')) node.tabIndex = -1;
      node.focus({preventScroll: true});
    }
    function renderPage(restore) {
      var page = pages[depth], target = page.target, panel = target && target.closest('[data-record-panel]');
      home.hidden = !!target; about.hidden = !!target; back.hidden = !target;
      panels.forEach(function (item) { item.hidden = item !== panel; });
      status.textContent = !target && search.value.trim() ? (list.querySelector('a') ?
        'Найдено записей: ' + list.querySelectorAll('a').length : 'Совпадений нет. Попробуйте другое слово.') : '';
      if (target) {
        if (target.id === 'record-section-all') {
          var allList = target.querySelector('[data-record-all-list]');
          if (!allList.hasChildNodes()) {
            renderList(allList, index.filter(function (item) { return !item.target.startsWith('medical-lab-'); }));
            if (!allList.hasChildNodes()) allList.textContent = 'Доступных записей пока нет.';
          }
        }
        for (var parent = target; parent && parent !== record; parent = parent.parentElement) {
          parent.hidden = false;
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        if (target.id === 'record-section-history') {
          var timeline = target.querySelector('.medical-timeline-panel');
          if (timeline) timeline.open = true;
        }
      }
      if (restore && page.focus && page.focus.isConnected) {
        focusNode(page.focus); window.scrollTo(0, page.scroll);
      } else if (target) {
        var focus = target.tagName === 'DETAILS' ? target.querySelector('summary') : target;
        focusNode(focus); focus.scrollIntoView({block: 'start'});
      }
    }
    function remember() {
      pages[depth].scroll = window.scrollY; pages[depth].focus = document.activeElement;
    }
    record.addEventListener('click', function (event) {
      var link = event.target.closest('[data-medical-source]');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      var target = document.getElementById(link.hash.slice(1));
      event.preventDefault();
      if (!target || !record.contains(target)) {
        status.textContent = 'Источник недоступен в этой версии карты.'; return;
      }
      remember(); pages[depth].focus = link;
      pages.push({target: target, parent: depth});
      depth = pages.length - 1;
      try { history.pushState({recordView: instance, depth: depth}, '', '#medcard'); } catch (error) {}
      var previous = document.querySelector('.report-back');
      if (previous) previous.hidden = true;
      renderPage(false);
    });
    back.addEventListener('click', function () {
      if (!depth) return;
      if (history.state && history.state.recordView === instance) { history.back(); return; }
      remember(); depth = pages[depth].parent; renderPage(true);
    });
    search.addEventListener('input', updateSearch);
    results.querySelector('[data-record-clear]').addEventListener('click', function () {
      search.value = ''; updateSearch(); search.focus();
    });
    updateSearch(); renderPage(false);
    return function restoreRecord(state, entered) {
      var next = state && state.recordView === instance && pages[state.depth] ? state.depth : 0;
      if (next !== depth) {
        if (!entered) remember();
        depth = next;
        renderPage(!entered);
      } else if (entered && depth) {
        renderPage(false);
      }
    };
  }

  function build() {
    var container = document.querySelector(".container");
    if (!container || container.dataset.screensReady) return;
    container.dataset.screensReady = "1";

    if (container.tagName !== "MAIN") container.setAttribute("role", "main");
    container.tabIndex = -1;
    var screens = {};
    SCREENS.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "screen";
      d.id = "screen-" + s.id;
      screens[s.id] = d;
    });

    var current = "obzor";
    var nodes = Array.prototype.slice.call(container.childNodes);
    nodes.forEach(function (n) {
      if (n.nodeType === 8) {                       // comment → maybe switch screen
        var sc = screenFor(n.nodeValue);
        if (sc) current = sc;
        screens[current].appendChild(n);            // keep markers in the DOM
      } else if (n.nodeType === 1) {
        var owner = n.getAttribute("data-report-screen");
        var target = Object.prototype.hasOwnProperty.call(screens, owner) ? owner : current;
        screens[target].appendChild(n);
      }
    });
    SCREENS.forEach(function (s) { container.appendChild(screens[s.id]); });
    var medicalRecord = container.querySelector('.medical-record');
    if (medicalRecord) screens.medcard.appendChild(medicalRecord);
    else screens.medcard.textContent = 'Медицинская карта ещё не поступила в эту версию отчёта. Обновите приложение.';
    var restoreRecord;
    if (medicalRecord) {
      setupMedicalPackage(medicalRecord);
      setupMedicalTimeline(medicalRecord);
      restoreRecord = setupRecordOverview(medicalRecord);
      var search = medicalRecord.querySelector('[data-medical-search]');
      if (!restoreRecord && search) search.addEventListener('input', function () {
        var query = search.value.trim().toLocaleLowerCase();
        var visible = 0;
        medicalRecord.querySelectorAll('.medical-topic,.medical-document,.medical-draw,.medical-note,.medical-visit,.medical-current,.medical-treatment').forEach(function (block) {
          var searchable = block.cloneNode(true);
          searchable.querySelectorAll('script').forEach(function (node) { node.remove(); });
          block.hidden = !!query && !searchable.textContent.toLocaleLowerCase().includes(query);
          if (!block.hidden) visible++;
        });
        medicalRecord.querySelector('[data-medical-found]').textContent = query ? 'Найдено блоков истории: ' + visible : '';
      });
      if (!restoreRecord) medicalRecord.addEventListener('click', function (event) {
        var link = event.target.closest('[data-medical-source]');
        if (!link) return;
        event.preventDefault();
        var target = document.getElementById(link.getAttribute('href').slice(1));
        if (!target || !medicalRecord.contains(target)) {
          medicalRecord.querySelector('[data-medical-found]').textContent = 'Исходная запись сейчас недоступна. Сохранённый источник есть в истории карточки.';
          return;
        }
        if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
        for (var parent = target; parent && parent !== medicalRecord; parent = parent.parentElement) {
          parent.hidden = false;
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      medicalRecord.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-medical-download]');
        if (!button || button.disabled) return;
        var status = button.parentElement.querySelector('[data-document-status]');
        button.disabled = true;
        try {
          var file = await originalBytes(medicalRecord, button.dataset.medicalDownload);
          saveBlob(new Blob([file.bytes], { type: file.mime }), file.name);
          status.textContent = ' Целостность проверена; оригинал передан браузеру для сохранения.';
        } catch (error) {
          status.textContent = ' Оригинал не удалось проверить или скачать. Повторите после обновления приложения.';
        } finally { button.disabled = false; }
      });
    }

    // A saved review supersedes the old static advice. Keep the original material
    // available as history rather than displaying contradictory instructions together.
    var savedReview = screens.protokol.querySelector('.med-review');
    setupVisit(savedReview);
    if (savedReview) {
      var activeSection = savedReview.closest('.section');
      if (activeSection) {
        var heading = activeSection.querySelector('.sec-title');
        if (heading) heading.textContent = 'Препараты и добавки: разбор для врача';
        var subtitle = activeSection.querySelector('.sec-sub');
        if (subtitle) subtitle.textContent = 'Приоритеты пересмотра, вопросы о перерывах и уточнения';
        var archive = document.createElement('details');
        archive.className = 'collapse protocol-history';
        var archiveTitle = document.createElement('summary');
        archiveTitle.textContent = 'Архив прежних рекомендаций — требует повторной проверки';
        archive.appendChild(archiveTitle);
        screens.protokol.querySelectorAll(':scope > .section').forEach(function (section) {
          if (section !== activeSection) archive.appendChild(section);
        });
        screens.protokol.insertBefore(activeSection, screens.protokol.firstChild);
        if (archive.children.length > 1) screens.protokol.appendChild(archive);
      }
    }

    // The app bar already names the section. Keep matching section headings for assistive navigation.
    SCREENS.forEach(function (screen) {
      var title = screens[screen.id].querySelector(".sec-title");
      if (title && title.textContent.trim() === screen.label) title.classList.add("sr-only");
    });

    // Overview bento: KPI tiles built from the .ovkpi blobs emitted by the chart generators
    var blobs = Array.prototype.slice.call(document.querySelectorAll(".ovkpi"));
    if (blobs.length) {
      var tiles = blobs.map(function (b) { try { return JSON.parse(b.textContent); } catch (e) { return null; } })
                       .filter(Boolean).sort(function (a, b) { return (a.order || 9) - (b.order || 9); });
      var grid = document.createElement("div");
      grid.className = "bento";
      var daily = overviewDay(screens.pitanie, function () { show('pitanie'); });
      if (daily) grid.classList.add('overview-rows');
      tiles.forEach(function (t) {
        if (daily && t.tab === 'pitanie' && t.label === 'Калории') return;
        // Relative labels baked into HTML go stale in offline copies; the dated line is dynamic.
        var sub = t.sub || "";
        if (t.freshness && t.freshness.kind === "measurement") sub = sub.replace(/^замер (?:сегодня|вчера|\d+ дн\. назад)(?: · )?/, "");
        if (t.freshness && t.freshness.kind === "night") sub = sub.replace(/^прошлая ночь · /, "");
        if (t.freshness && t.freshness.kind === "workout") sub = sub.replace(/^последняя \d{2}\.\d{2}$/, "");
        if (t.freshness && t.freshness.kind === "blood_draw") sub = sub.replace(/ · \d{2}\.\d{2}\.\d{4}$/, "");
        var tile = document.createElement("button");
        tile.className = "tile" + (t.span === 2 ? " wide" : "") + (t.color ? " c-" + t.color : "");
        tile.type = "button";
        tile.appendChild(element("div", "eyebrow", t.label));
        var number = element("div", "kpi", t.value);
        if (t.unit) number.appendChild(element("small", "", t.unit));
        tile.appendChild(number);
        if (sub) tile.appendChild(element("div", "sub", sub));
        var chevron = element("span", "chev", "›");
        chevron.setAttribute("aria-hidden", "true");
        tile.appendChild(chevron);
        attachFreshness(tile, t.freshness);
        // Old reports without metadata remain visibly unknown until their generator runs.
        tile.addEventListener("click", function () { show(t.tab); });
        grid.appendChild(tile);
      });
      screens.obzor.insertBefore(grid, screens.obzor.firstChild);

      if (daily) grid.before(daily, element('h2', 'overview-list-title', 'Последние показатели'));
      screens.obzor.querySelectorAll('.section > .small:only-child').forEach(function (note) {
        if (note.textContent.trim() === 'Данных пока нет.') note.textContent = 'Для сводки наблюдений пока недостаточно данных.';
      });

      // Ряд оценок физически лежит в .hero, то есть НАД плитками и вне вкладок. На телефоне это
      // давало 627px шапки при 757px экрана: операционные плитки — то, ради чего открывают утром —
      // начинались на 664px, за сгибом. Переносим ряд под плитки и внутрь «Обзора»: сначала
      // «что сейчас», потом «как в целом». Маркеры региона остаются в файле на прежнем месте,
      // генератор пишет туда же — переезжает только отрисованный узел.
      var grades = document.querySelector(".hero .score-grid");
      if (grades) { grid.parentNode.insertBefore(grades, grid.nextSibling); }
    }

    var sectionStamps = {};
    blobs.forEach(function (blob) {
      try {
        var data = JSON.parse(blob.textContent);
        if (data.tab && data.freshness) (sectionStamps[data.tab] || (sectionStamps[data.tab] = [])).push(data.freshness);
      } catch (e) {}
    });
    document.querySelectorAll(".source-stamp[data-screen]").forEach(function (blob) {
      try { (sectionStamps[blob.dataset.screen] || (sectionStamps[blob.dataset.screen] = [])).push(JSON.parse(blob.textContent)); } catch (e) {}
    });
    if (savedReview && savedReview.dataset.reviewedOn) {
      sectionStamps.protokol = [{kind: 'review', date: savedReview.dataset.reviewedOn}];
    }
    ["pitanie", "vosst", "analizy", "protokol"].forEach(function (id) {
      var panel = document.createElement("div");
      panel.className = "source-dates";
      panel.setAttribute("aria-label", "Даты данных раздела");
      (sectionStamps[id] || [{}]).forEach(function (stamp) { attachFreshness(panel, stamp); });
      screens[id].insertBefore(panel, screens[id].firstChild);
    });
    document.querySelectorAll(".score-card").forEach(function (card) {
      var line = document.createElement("div");
      line.className = "score-date";
      var generated = generatedAt();
      line.textContent = generated ? "Отчёт от " + generated.toLocaleDateString("ru-RU") : "Дата отчёта не указана";
      card.appendChild(line);
    });
    document.querySelectorAll(".cards .card").forEach(function (card) {
      var group = card.closest(".cards");
      var stamp = { kind: group.dataset.recordKind, date: group.dataset.recordDate };
      if (group.dataset.maxAge) stamp.max_age_days = +group.dataset.maxAge;
      attachFreshness(card, stamp);
    });
    updateCardFreshness();

    compactTables(screens.analizy, screens.protokol);

    // progressive disclosure: collapse heavy tables inside detail screens
    ["pitanie", "vosst", "analizy", "protokol"].forEach(function (sid) {
      screens[sid].querySelectorAll(".table-wrap").forEach(function (tw) {
        var rows = tw.querySelectorAll("tr").length;
        if (rows < 5 || tw.closest("details") || tw.classList.contains("has-compact-records")) return;
        var det = document.createElement("details");
        det.className = "collapse";
        // Первая таблица экрана — текущий период, ради неё вкладку и открывают: прятать её за
        // лишний тап значит прятать содержимое вкладки. История остаётся свёрнутой.
        if (!screens[sid].querySelector("details.collapse")) det.open = true;
        var sum = document.createElement("summary");
        sum.textContent = "📋 Таблица · " + (rows - 1) + " строк";
        tw.parentNode.insertBefore(det, tw);
        det.appendChild(sum);
        det.appendChild(tw);
      });
    });

    var hero = document.querySelector(".hero");
    if (!hero) {
      hero = document.createElement("header");
      hero.className = "hero";
      container.before(hero);
    }
    hero.setAttribute("role", "banner");
    var overviewHeader = document.createElement("div");
    overviewHeader.className = "overview-header";
    Array.from(hero.children).forEach(function (node) {
      if (!node.matches("#dash-lock,.theme-toggle")) overviewHeader.appendChild(node);
    });
    var overviewTitle = overviewHeader.querySelector('h1.sr-only');
    if (overviewTitle) {
      overviewTitle.textContent = 'Обзор';
      overviewTitle.classList.remove('sr-only');
    }
    var when = overviewHeader.querySelector('.appbar-when');
    if (when && when.textContent.trim() === 'данные не загружены') when.textContent = 'Время обновления неизвестно';
    hero.prepend(overviewHeader);
    var heading = document.createElement("h1");
    heading.className = "report-heading";
    overviewHeader.after(heading);

    var previous = document.createElement("button");
    previous.type = "button";
    previous.className = "report-back";
    previous.textContent = "‹";
    previous.setAttribute("aria-label", "Назад");
    previous.addEventListener("click", function () { history.back(); });
    hero.prepend(previous);

    var nav = document.createElement("nav");
    nav.className = "tabbar";
    nav.setAttribute("aria-label", "Разделы отчёта");
    SCREENS.forEach(function (s) {
      var link = document.createElement("a");
      link.className = "tab";
      link.href = "#" + s.id;
      link.dataset.screen = s.id;
      link.innerHTML = '<svg class="tab-i" aria-hidden="true" viewBox="0 0 24 24"><path d="' + s.icon +
        '"/></svg><span class="tab-l">' + s.label + "</span>";
      link.addEventListener("click", function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        show(s.id);
      });
      nav.appendChild(link);
    });
    document.body.appendChild(nav);
    var skip = document.createElement("a");
    skip.className = "report-skip";
    skip.href = "#report-navigation";
    nav.id = "report-navigation";
    skip.textContent = "К разделам отчёта";
    skip.addEventListener("click", function (event) {
      event.preventDefault();
      nav.querySelector("[aria-current]").focus();
    });
    hero.prepend(skip);

    var active;
    function display(id, focus) {
      var changed = id !== active;
      if (changed) {
        SCREENS.forEach(function (s) {
          var selected = s.id === id, link = nav.querySelector('[data-screen="' + s.id + '"]');
          screens[s.id].hidden = !selected;
          link.classList.toggle("active", selected);
          if (selected) {
            link.setAttribute("aria-current", "page");
            heading.textContent = s.label;
            container.setAttribute("aria-label", s.label);
          } else link.removeAttribute("aria-current");
        });
        active = id;
        overviewHeader.hidden = id !== "obzor";
        heading.hidden = id === "obzor" && !!overviewHeader.children.length;
        if (focus) container.focus({preventScroll: true});
        window.scrollTo(0, 0);
        prepareCharts(screens[id]);
      }
      previous.hidden = !(history.state && history.state.reportTab);
      if (id === "medcard" && restoreRecord) restoreRecord(history.state, changed);
    }
    function show(id) {
      if (!Object.prototype.hasOwnProperty.call(screens, id) || active === id) return;
      try { history.pushState({reportTab: true}, "", "#" + id); }
      catch (error) { location.hash = id; }
      display(id, true);
    }
    function restoreRoute() {
      var id = fromHash();
      if (id || !location.hash) { display(id || "obzor", true); selectLinkedDay(); }
    }
    var week = screens.pitanie.querySelector('.energy-week');
    var dateNotice = element('p', 'energy-note');
    dateNotice.hidden = true;
    dateNotice.setAttribute('role', 'status');
    if (week) {
      week.before(dateNotice);
      week.addEventListener('change', function (event) {
        if (!event.target.matches('input[data-day]')) return;
        dateNotice.hidden = true;
        var address = '#pitanie/' + event.target.dataset.day;
        if (location.hash.startsWith('#pitanie/') && location.hash !== address) {
          history.replaceState(history.state, '', address);
        }
      });
    }
    function selectLinkedDay() {
      dateNotice.hidden = true;
      if (!week || fromHash() !== 'pitanie' || !location.hash.startsWith('#pitanie/')) return;
      var day = location.hash.slice('#pitanie/'.length);
      var radio = Array.from(week.querySelectorAll('input[data-day]')).find(function (item) {
        return item.dataset.day === day;
      });
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', {bubbles:true}));
      } else {
        dateNotice.textContent = 'Даты ' + day.split('-').reverse().join('.') +
          ' нет в показанной неделе. Выберите доступный день на графике.';
        dateNotice.hidden = false;
      }
    }
    window.__showScreen = show;
    window.addEventListener("popstate", restoreRoute);
    window.addEventListener("hashchange", restoreRoute);
    window.addEventListener("resize", function () { prepareCharts(screens[active]); });
    if (window.ResizeObserver) new ResizeObserver(function () {
      document.documentElement.style.setProperty("--nav-height", nav.offsetHeight + "px");
    }).observe(nav);
    if (!location.hash) {
      try { history.replaceState(history.state, "", "#obzor"); } catch (error) {}
    }
    display(fromHash() || "obzor", false);
    selectLinkedDay();
  }

  /* Новая версия в standalone приходит молча: service worker делает skipWaiting и подменяет
     страницу при следующем открытии. Адресной строки нет, «потянуть для обновления» тоже, —
     значит о смене версии надо сказать словами и дать кнопку. */
  if ("serviceWorker" in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }
      var bar = document.getElementById("freshness") || document.createElement("div");
      bar.id = "freshness";
      bar.className = "freshness stale";
      bar.innerHTML = "🆕 Загружена новая версия приложения"
        + '<button class="freshness-btn" type="button">Перезагрузить</button>';
      if (!bar.parentNode) document.body.insertBefore(bar, document.body.firstChild);
      bar.style.display = "";
      bar.querySelector(".freshness-btn").addEventListener("click", function () {
        location.reload();
      });
    });
  }

  window.addEventListener("online", function () { freshnessBar(); updateCardFreshness(); });
  window.addEventListener("offline", function () { freshnessBar(); updateCardFreshness(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) updateCardFreshness(); });
  // Re-evaluate cached cards across midnight without changing their measurement dates.
  window.setInterval(updateCardFreshness, 60000);

  function start() { build(); freshnessBar(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ---- Theme toggle ---------------------------------------------------------
   The pre-paint <script> in the HTML has already stamped html[data-theme].
   Here we mount the floating button, persist the manual choice, keep the
   browser chrome (theme-color) in sync, and follow OS changes until the user
   picks a side explicitly. Button lives on <body>, outside .container, so the
   screen-builder never sweeps it into a tab. */
(function () {
  "use strict";
  var root = document.documentElement;
  function current() { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; }

  function stored() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
  function paintMeta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", getComputedStyle(root).getPropertyValue("--surface").trim());
  }
  var btn = null;
  function apply(t) {
    root.setAttribute("data-theme", t);
    paintMeta();
    if (btn) {
      btn.textContent = t === "light" ? "☾" : "☀";
      btn.setAttribute("aria-pressed", String(t === "dark"));
    }
  }
  function mount() {
    var preference = stored();
    if (preference !== "light" && preference !== "dark") {
      preference = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    apply(preference);
    if (document.querySelector(".theme-toggle")) return;
    btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Тёмная тема");
    btn.title = "Тёмная тема";
    apply(preference);
    btn.addEventListener("click", function () {
      var t = current() === "light" ? "dark" : "light";
      try { localStorage.setItem("theme", t); } catch (e) {}
      apply(t);
    });
    (document.querySelector(".hero") || document.body).appendChild(btn);   // кнопка живёт в полосе приложения, а не поверх контента
    paintMeta();
  }
  try {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onSys = function (e) {
      var s = stored();
      if (s !== "light" && s !== "dark") apply(e.matches ? "light" : "dark");
    };
    mq.addEventListener ? mq.addEventListener("change", onSys) : mq.addListener(onSys);
  } catch (e) {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
