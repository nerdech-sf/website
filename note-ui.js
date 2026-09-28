/* nerdech — note-ui.js
   事業ページの小さな操作。
   - [data-tabs]: タブの切り替え(矢印キー対応)
   - .qa: 質問を押すと、画面イメージ上の AI の答え(サンプル)を表示する */
(function () {
    'use strict';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    [].slice.call(document.querySelectorAll('[data-tabs]')).forEach(function (box) {
        var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
        var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
        function select(i, focus) {
            tabs.forEach(function (t, j) {
                var on = j === i;
                t.setAttribute('aria-selected', on ? 'true' : 'false');
                t.tabIndex = on ? 0 : -1;
                if (panels[j]) panels[j].hidden = !on;
            });
            if (focus) tabs[i].focus();
        }
        tabs.forEach(function (t, i) {
            t.addEventListener('click', function () { select(i); });
            t.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % tabs.length, true); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
            });
        });
        select(0);
    });

    [].slice.call(document.querySelectorAll('.qa')).forEach(function (qa) {
        var out = qa.querySelector('.qa__a');
        var btns = [].slice.call(qa.querySelectorAll('.qa__q button'));
        var timer = 0;
        btns.forEach(function (b) {
            b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', function () {
                btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
                var tpl = qa.querySelector('template[data-for="' + b.getAttribute('data-q') + '"]');
                if (!tpl) return;
                clearInterval(timer);
                out.removeAttribute('data-empty');
                out.innerHTML = '';
                var node = tpl.content.cloneNode(true);
                out.appendChild(node);
                if (reduce) return;
                // 本文だけ少しずつ出す
                var body = out.querySelector('.ans');
                if (!body) return;
                var full = body.textContent, n = 0;
                body.textContent = '';
                timer = setInterval(function () {
                    n += 2;
                    body.textContent = full.slice(0, n);
                    if (n >= full.length) clearInterval(timer);
                }, 18);
            });
        });
    });
})();

/* ステップ表示: 図と説明を、ひとまとまりで一度に切り替える(スクロールでは進まない) */
(function () {
    'use strict';
    [].slice.call(document.querySelectorAll('[data-stepper]')).forEach(function (box) {
        var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
        var panels = [].slice.call(box.querySelectorAll('.stepper__panel'));
        var visual = box.querySelector('[data-glove], [data-cg]');
        var cur = 0;
        function select(i, focus) {
            cur = (i + tabs.length) % tabs.length;
            tabs.forEach(function (t, j) {
                var on = j === cur;
                t.setAttribute('aria-selected', on ? 'true' : 'false');
                t.tabIndex = on ? 0 : -1;
                panels[j].classList.toggle('is-active', on);
                panels[j].setAttribute('aria-hidden', on ? 'false' : 'true');
            });
            if (focus) tabs[cur].focus();
            var api = visual && (visual.glove || visual.cg);
            if (api) api.setStage(cur);
            // 選んだタブが見えるように(スマホで横にはみ出すとき)
            var tl = tabs[cur].parentNode;
            if (tl.scrollWidth > tl.clientWidth) tl.scrollTo({ left: tabs[cur].offsetLeft - tl.clientWidth / 2 + tabs[cur].offsetWidth / 2, behavior: 'smooth' });
        }
        tabs.forEach(function (t, i) {
            t.addEventListener('click', function () { select(i); });
            t.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight') { e.preventDefault(); select(cur + 1, true); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); select(cur - 1, true); }
            });
        });
        [].slice.call(box.querySelectorAll('.stepper__arrow')).forEach(function (b) {
            b.addEventListener('click', function () { select(cur + Number(b.getAttribute('data-dir'))); });
        });
        // 図を横にスワイプしても切り替わる
        var vis = box.querySelector('.stepper__visual'), sx = null, sy = null;
        if (vis) {
            vis.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
            vis.addEventListener('pointerup', function (e) {
                if (sx === null) return;
                var dx = e.clientX - sx, dy = e.clientY - sy;
                if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) select(cur + (dx < 0 ? 1 : -1));
                sx = null;
            });
        }
        // 図のスクリプトが後から読み込まれるので、準備ができたら段階を合わせる
        window.addEventListener('load', function () { select(cur); });
        select(0);
    });
})();

/* 下へ読み進めると、本文のブロックが順に現れる */
(function () {
    'use strict';
    if (!window.IntersectionObserver || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var blocks = [].slice.call(document.querySelectorAll('.note__main > *'));
    if (!blocks.length) return;
    document.documentElement.classList.add('reveal-on');
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    blocks.forEach(function (b) { io.observe(b); });
    // アンカーで飛んだときなどに、見えているのに隠れたままにならないように
    window.addEventListener('hashchange', function () { blocks.forEach(function (b) { b.classList.add('is-in'); }); });
})();
