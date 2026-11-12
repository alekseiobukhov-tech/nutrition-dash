/* Health Dashboard — client-side screen navigation (no backend).
   Groups the report's existing sections into tab-screens at runtime, using the
   HTML marker comments as stable boundaries (they survive report regeneration).
   Keeps the PWA offline: pure DOM, no data fetching. */
(function () {
  "use strict";

  var SCREENS = [
    { id: "obzor",    icon: "🏠", label: "Обзор" },
    { id: "pitanie",  icon: "🍽", label: "Питание" },
    // «Восстановление» named one fifth of what is here (sleep) and was already truncated to
    // «Восст.» in the bar. The tab is weight-to-goal, sleep, training and their weekly and
    // monthly series — all of it change over time. The id stays `vosst` on purpose: it is
    // internal (screen-vosst) and renaming it buys nothing but churn.
    { id: "vosst",    icon: "📈", label: "Динамика" },
    { id: "analizy",  icon: "🔬", label: "Анализы" },
    { id: "protokol", icon: "💊", label: "Протокол" },
    { id: "medcard", icon: "🗂", label: "Медкарта" }
  ];

  // A boundary comment → the screen everything after it belongs to (until the next boundary).
  function screenFor(c) {
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

  function prepareCharts(screen) {
    screen.querySelectorAll('.table-wrap').forEach(function (wrap) {
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

  function build() {
    var container = document.querySelector(".container");
    if (!container || container.dataset.screensReady) return;
    container.dataset.screensReady = "1";

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
      } else if (n.nodeType === 1) {                // element → current screen
        screens[current].appendChild(n);
      }
    });
    SCREENS.forEach(function (s) { container.appendChild(screens[s.id]); });
    var medicalRecord = container.querySelector('.medical-record');
    if (medicalRecord) screens.medcard.appendChild(medicalRecord);
    else screens.medcard.textContent = 'Медицинская карта ещё не поступила в эту версию отчёта. Обновите приложение.';
    if (medicalRecord) {
      setupMedicalPackage(medicalRecord);
      var search = medicalRecord.querySelector('[data-medical-search]');
      if (search) search.addEventListener('input', function () {
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
      medicalRecord.addEventListener('click', function (event) {
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

    // Overview bento: KPI tiles built from the .ovkpi blobs emitted by the chart generators
    var blobs = Array.prototype.slice.call(document.querySelectorAll(".ovkpi"));
    if (blobs.length) {
      var tiles = blobs.map(function (b) { try { return JSON.parse(b.textContent); } catch (e) { return null; } })
                       .filter(Boolean).sort(function (a, b) { return (a.order || 9) - (b.order || 9); });
      var grid = document.createElement("div");
      grid.className = "bento";
      tiles.forEach(function (t) {
        // Relative labels baked into HTML go stale in offline copies; the dated line is dynamic.
        var sub = t.sub || "";
        if (t.freshness && t.freshness.kind === "measurement") sub = sub.replace(/^замер (?:сегодня|вчера|\d+ дн\. назад)(?: · )?/, "");
        if (t.freshness && t.freshness.kind === "night") sub = sub.replace(/^прошлая ночь · /, "");
        if (t.freshness && t.freshness.kind === "workout") sub = sub.replace(/^последняя \d{2}\.\d{2}$/, "");
        if (t.freshness && t.freshness.kind === "blood_draw") sub = sub.replace(/ · \d{2}\.\d{2}\.\d{4}$/, "");
        var tile = document.createElement("button");
        tile.className = "tile" + (t.span === 2 ? " wide" : "") + (t.color ? " c-" + t.color : "");
        tile.innerHTML =
          '<div class="eyebrow">' + (t.icon || "") + " " + t.label + "</div>" +
          '<div class="kpi">' + t.value + (t.unit ? '<small>' + t.unit + "</small>" : "") + "</div>" +
          (sub ? '<div class="sub">' + sub + "</div>" : "") +
          '<span class="chev">›</span>';
        attachFreshness(tile, t.freshness);
        // Old reports without metadata remain visibly unknown until their generator runs.
        tile.addEventListener("click", function () { show(t.tab); });
        grid.appendChild(tile);
      });
      screens.obzor.insertBefore(grid, screens.obzor.firstChild);

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

    // progressive disclosure: collapse heavy tables inside detail screens
    ["pitanie", "vosst", "analizy", "protokol"].forEach(function (sid) {
      screens[sid].querySelectorAll(".table-wrap").forEach(function (tw) {
        var rows = tw.querySelectorAll("tr").length;
        if (rows < 5 || tw.closest("details")) return;
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

    // bottom tab bar
    var nav = document.createElement("nav");
    nav.className = "tabbar";
    // Вкладки — это навигация по одному документу, поэтому aria-current="page", а не роль tab:
    // роль tablist обязывает к клавиатурной модели со стрелками, которой здесь нет.
    nav.setAttribute("aria-label", "Разделы отчёта");
    SCREENS.forEach(function (s) {
      var b = document.createElement("button");
      b.className = "tab";
      b.setAttribute("data-screen", s.id);
      b.innerHTML = '<span class="tab-i">' + s.icon + '</span><span class="tab-l">' + s.label + "</span>";
      b.addEventListener("click", function () { show(s.id); });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);

    function show(id) {
      SCREENS.forEach(function (s) {
        screens[s.id].style.display = s.id === id ? "block" : "none";
        var tab = nav.querySelector('[data-screen="' + s.id + '"]');
        if (tab) {
          tab.classList.toggle("active", s.id === id);
          // состояние «где я» не должно жить только в цвете: без этого скринридер
          // не отличает активную вкладку от остальных (WCAG 4.1.2)
          if (s.id === id) { tab.setAttribute("aria-current", "page"); }
          else { tab.removeAttribute("aria-current"); }
        }
      });
      var hero = document.querySelector(".hero");
      if (hero) hero.style.display = id === "obzor" ? "" : "none";
      // адрес держим в синхроне без засорения истории — чтобы ярлык подсвечивал свою вкладку
      try { if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id); } catch (e) {}
      window.scrollTo(0, 0);
      prepareCharts(screens[id]);
    }
    window.__showScreen = show;
    window.addEventListener("resize", function () {
      prepareCharts(screens[fromHash() || "obzor"]);
    });
    // хэш при запуске (ярлык/закладка) → эта вкладка, иначе «Обзор»; смена хэша на лету тоже ведёт
    window.addEventListener("hashchange", function () { var h = fromHash(); if (h) show(h); });
    show(fromHash() || "obzor");
  }

  /* Новая версия в standalone приходит молча: service worker делает skipWaiting и подменяет
     страницу при следующем открытии. Адресной строки нет, «потянуть для обновления» тоже, —
     значит о смене версии надо сказать словами и дать кнопку. */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
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
  var META = { dark: "#0891b2", light: "#e9eef7" };
  function current() { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; }

  function stored() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
  function paintMeta(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "light" ? META.light : META.dark);
  }
  var btn = null;
  function apply(t) {
    root.setAttribute("data-theme", t);
    paintMeta(t);
    if (btn) btn.textContent = t === "light" ? "☀️" : "🌙";
  }
  function mount() {
    if (document.querySelector(".theme-toggle")) return;
    btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Переключить тему");
    btn.textContent = current() === "light" ? "☀️" : "🌙";
    btn.addEventListener("click", function () {
      var t = current() === "light" ? "dark" : "light";
      try { localStorage.setItem("theme", t); } catch (e) {}
      apply(t);
    });
    (document.querySelector(".hero") || document.body).appendChild(btn);   // кнопка живёт в полосе приложения, а не поверх контента
    paintMeta(current());
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
