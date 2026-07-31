/* Health Dashboard — client-side screen navigation (no backend).
   Groups the report's existing sections into 5 tab-screens at runtime, using the
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
    { id: "protokol", icon: "💊", label: "Протокол" }
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

    // Overview bento: KPI tiles built from the .ovkpi blobs emitted by the chart generators
    var blobs = Array.prototype.slice.call(document.querySelectorAll(".ovkpi"));
    if (blobs.length) {
      var tiles = blobs.map(function (b) { try { return JSON.parse(b.textContent); } catch (e) { return null; } })
                       .filter(Boolean).sort(function (a, b) { return (a.order || 9) - (b.order || 9); });
      var grid = document.createElement("div");
      grid.className = "bento";
      tiles.forEach(function (t) {
        var tile = document.createElement("button");
        tile.className = "tile" + (t.span === 2 ? " wide" : "") + (t.color ? " c-" + t.color : "");
        tile.innerHTML =
          '<div class="eyebrow">' + (t.icon || "") + " " + t.label + "</div>" +
          '<div class="kpi">' + t.value + (t.unit ? '<small>' + t.unit + "</small>" : "") + "</div>" +
          (t.sub ? '<div class="sub">' + t.sub + "</div>" : "") +
          '<span class="chev">›</span>';
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
    }
    window.__showScreen = show;
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

  window.addEventListener("online", freshnessBar);
  window.addEventListener("offline", freshnessBar);

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
