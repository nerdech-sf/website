/* nerdech — note-graph.js
   事業ページのローカルグラフとアウトライン。Obsidian のサイドバーと同じ考え方。
   - 中心: このページ / 子: 本文の [data-node] 要素(data-parent で親を指定) / 外: バックリンク
   - ノードはばねでつながり、ドラッグで動かせる。クリックで該当箇所へ移動(外のノードはページ移動)
   - 読んでいる箇所のノードが紫に光る
   - Canvas 2D のみ。prefers-reduced-motion では揺れを止め、静止した配置で表示 */
(function () {
    'use strict';

    var host = document.querySelector('.local-graph');
    var note = document.querySelector('.note');
    if (!host || !note) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ACCENT = (getComputedStyle(note).getPropertyValue('--accent-rgb') || '168,130,255').replace(/\s/g, '') || '168,130,255';
    var NODE = '190,190,196';

    /* ---------- ノードを集める ---------- */
    var nodes = [], edges = [];
    var center = { label: host.getAttribute('data-center') || document.title, r: 7, kind: 'center' };
    nodes.push(center);

    var byId = {};
    [].slice.call(note.querySelectorAll('[data-node]')).forEach(function (el) {
        if (el.closest('.backlinks')) return;
        var n = { label: el.getAttribute('data-node'), el: el, r: 4.5, kind: 'child', parentId: el.getAttribute('data-parent') };
        if (el.id) byId[el.id] = n;
        nodes.push(n);
    });
    nodes.forEach(function (n) {
        if (n.kind !== 'child') return;
        var p = n.parentId && byId[n.parentId];
        if (p) { n.r = 3.6; n.depth = 2; n.parent = p; edges.push([p, n, 'in']); }
        else { n.depth = 1; edges.push([center, n, 'in']); }
    });
    [].slice.call(note.querySelectorAll('.backlinks a[data-node]')).forEach(function (a) {
        var n = { label: a.getAttribute('data-node'), href: a.getAttribute('href'), r: 4, kind: 'ext' };
        nodes.push(n);
        edges.push([center, n, 'ext']);
    });

    /* ---------- アウトライン ---------- */
    var outline = document.querySelector('.outline');
    var outlineLinks = [];
    if (outline) {
        nodes.forEach(function (n) {
            if (n.kind !== 'child' || !n.el.id) return;
            var a = document.createElement('a');
            a.href = '#' + n.el.id;
            a.textContent = n.label;
            if (n.depth === 2) a.className = 'is-sub';
            outline.appendChild(a);
            n.link = a;
            outlineLinks.push(a);
        });
    }

    /* ---------- 初期配置 ---------- */
    var kids = nodes.filter(function (n) { return n.kind === 'child' && n.depth === 1; });
    var exts = nodes.filter(function (n) { return n.kind === 'ext'; });
    center.x = 0; center.y = 0;
    kids.forEach(function (n, i) {
        var a = (i / Math.max(kids.length, 1)) * Math.PI * 2 - Math.PI / 2;
        n.x = Math.cos(a) * 70; n.y = Math.sin(a) * 70;
    });
    nodes.forEach(function (n, i) {
        if (n.kind === 'child' && n.depth === 2) {
            var p = byId[n.parentId];
            var a = Math.atan2(p.y, p.x) + (i % 5 - 2) * 0.45;
            n.x = p.x + Math.cos(a) * 45; n.y = p.y + Math.sin(a) * 45;
        }
    });
    exts.forEach(function (n, i) {
        var a = (i / Math.max(exts.length, 1)) * Math.PI * 2 + Math.PI / 5;
        n.x = Math.cos(a) * 125; n.y = Math.sin(a) * 125;
    });
    nodes.forEach(function (n) { n.vx = 0; n.vy = 0; });

    /* ---------- 物理(ばね + 反発) ---------- */
    function step() {
        var i, j, a, b, dx, dy, d2, d, f;
        for (i = 0; i < nodes.length; i++) {
            for (j = i + 1; j < nodes.length; j++) {
                a = nodes[i]; b = nodes[j];
                dx = b.x - a.x; dy = b.y - a.y;
                d2 = dx * dx + dy * dy + 0.01;
                f = 1100 / d2;
                d = Math.sqrt(d2);
                a.vx -= dx / d * f; a.vy -= dy / d * f;
                b.vx += dx / d * f; b.vy += dy / d * f;
            }
        }
        edges.forEach(function (e) {
            a = e[0]; b = e[1];
            var rest = e[2] === 'ext' ? 130 : (b.depth === 2 ? 52 : 80);
            dx = b.x - a.x; dy = b.y - a.y;
            d = Math.sqrt(dx * dx + dy * dy) || 1;
            f = (d - rest) * 0.03;
            a.vx += dx / d * f; a.vy += dy / d * f;
            b.vx -= dx / d * f; b.vy -= dy / d * f;
        });
        var energy = 0;
        nodes.forEach(function (n) {
            n.vx -= n.x * 0.004; n.vy -= n.y * 0.004; // 中央へ
            if (n === drag) { n.vx = n.vy = 0; return; }
            n.vx *= 0.82; n.vy *= 0.82;
            n.x += n.vx; n.y += n.vy;
            energy += n.vx * n.vx + n.vy * n.vy;
        });
        return energy;
    }
    for (var s = 0; s < 240; s++) step(); // 最初から落ち着いた形で出す

    /* ---------- 描画 ---------- */
    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var W = 1, H = 1, dpr = 1, scale = 1;

    function layout() {
        W = host.clientWidth; H = host.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        // 全ノードが収まる倍率
        var mx = 1, my = 1;
        nodes.forEach(function (n) { mx = Math.max(mx, Math.abs(n.x)); my = Math.max(my, Math.abs(n.y)); });
        scale = Math.min((W / 2 - 46) / mx, (H / 2 - 30) / my, 1.25);
        wake();
    }
    function sx(n) { return W / 2 + n.x * scale; }
    function sy(n) { return H / 2 + n.y * scale; }

    var hover = null, drag = null, active = null;

    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var focus = hover || active;

        edges.forEach(function (e) {
            var on = focus && (e[0] === focus || e[1] === focus);
            ctx.strokeStyle = on ? 'rgba(' + ACCENT + ',0.8)' : 'rgba(' + NODE + ',' + (e[2] === 'ext' ? 0.14 : 0.26) + ')';
            ctx.lineWidth = on ? 1.2 : 1;
            ctx.setLineDash(e[2] === 'ext' ? [3, 4] : []);
            ctx.beginPath();
            ctx.moveTo(sx(e[0]), sy(e[0]));
            ctx.lineTo(sx(e[1]), sy(e[1]));
            ctx.stroke();
        });
        ctx.setLineDash([]);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        nodes.forEach(function (n) {
            var isOn = n === focus || n === active;
            var x = sx(n), y = sy(n);
            if (isOn) {
                ctx.fillStyle = 'rgba(' + ACCENT + ',0.18)';
                ctx.beginPath(); ctx.arc(x, y, n.r + 6, 0, 6.2832); ctx.fill();
            }
            ctx.fillStyle = isOn ? 'rgb(' + ACCENT + ')' : (n.kind === 'ext' ? 'rgba(' + NODE + ',0.55)' : 'rgb(' + NODE + ')');
            ctx.beginPath(); ctx.arc(x, y, n.r, 0, 6.2832); ctx.fill();

            // 2 段目のラベルは、自分か親が選ばれているときだけ出す(重なり防止)
            if (n.depth === 2 && !isOn && !(focus && (focus === n.parent || (focus.parent && focus.parent === n.parent)))) return;
            ctx.font = (n.kind === 'center' ? '500 12px ' : '11px ') + '"Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif';
            ctx.fillStyle = isOn ? 'rgba(236,236,240,0.98)'
                : n.kind === 'center' ? 'rgba(236,236,240,0.92)'
                : n.kind === 'ext' ? 'rgba(236,236,240,0.4)' : 'rgba(236,236,240,0.62)';
            ctx.fillText(n.label, x, y + n.r + 5);
        });
    }

    var raf = 0, idle = 0;
    function tick() {
        raf = 0;
        var e = reduce && !drag ? 0 : step();
        draw();
        idle = e < 0.02 && !drag ? idle + 1 : 0;
        if (idle < 30) raf = requestAnimationFrame(tick); // 落ち着いたら止める
    }
    function wake() { idle = 0; if (!raf) raf = requestAnimationFrame(tick); }

    /* ---------- 操作 ---------- */
    function pick(e) {
        var r = canvas.getBoundingClientRect();
        var px = e.clientX - r.left, py = e.clientY - r.top, best = null, bd = 18 * 18;
        nodes.forEach(function (n) {
            var dx = sx(n) - px, dy = sy(n) - py, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = n; }
        });
        return { node: best, x: px, y: py };
    }
    var downAt = null;
    canvas.addEventListener('pointerdown', function (e) {
        var p = pick(e);
        if (!p.node) return;
        downAt = { x: p.x, y: p.y, moved: false, node: p.node };
        // タッチではドラッグさせない(グラフの上でもページをスクロールできるように)。タップだけ受ける
        if (e.pointerType === 'touch') return;
        drag = p.node;
        canvas.setPointerCapture(e.pointerId);
        wake();
    });
    canvas.addEventListener('pointermove', function (e) {
        var p = pick(e);
        if (drag) {
            if (Math.abs(p.x - downAt.x) + Math.abs(p.y - downAt.y) > 4) downAt.moved = true;
            drag.x = (p.x - W / 2) / scale; drag.y = (p.y - H / 2) / scale;
            wake();
            return;
        }
        if (p.node !== hover) { hover = p.node; canvas.style.cursor = hover ? 'pointer' : ''; wake(); }
    });
    canvas.addEventListener('pointerup', function (e) {
        var n = drag; drag = null;
        if (e.pointerType === 'touch' && downAt) {
            var p = pick(e);
            if (p.node === downAt.node && Math.abs(p.x - downAt.x) + Math.abs(p.y - downAt.y) < 10) go(p.node);
            downAt = null;
            return;
        }
        if (n && downAt && !downAt.moved) go(n);
        wake();
    });
    canvas.addEventListener('pointerleave', function () { if (!drag && hover) { hover = null; wake(); } });

    function go(n) {
        if (n.kind === 'ext') { window.location.href = n.href; return; }
        if (n.kind === 'center') { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); return; }
        n.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    /* ---------- 読んでいる箇所 ---------- */
    var children = nodes.filter(function (n) { return n.kind === 'child'; });
    function updateActive() {
        var line = window.innerHeight * 0.35, cur = null;
        children.forEach(function (n) {
            if (n.el.getBoundingClientRect().top <= line) cur = n;
        });
        if (cur !== active) {
            if (active) { active.el.classList.remove('is-active'); if (active.link) active.link.classList.remove('is-active'); }
            active = cur;
            if (active) { active.el.classList.add('is-active'); if (active.link) active.link.classList.add('is-active'); }
            wake();
        }
    }
    window.addEventListener('scroll', updateActive, { passive: true });

    if (window.ResizeObserver) new ResizeObserver(layout).observe(host);
    else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(wake);
    layout();
    updateActive();
})();
