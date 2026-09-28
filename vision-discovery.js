/* nerdech — vision-discovery.js
   Discovery Agent の CG(構想)。
   暗い会社のネットワークの中を、小さな光(エージェント)が自分で移動し、
   Files・Slack・Email・CRM・ERP・Database などを見つけていく。
   見つかった関係が中央に集まり、少しずつ Company Brain が形になる。全部見つかると最初から繰り返す。
   - prefers-reduced-motion: ほぼ見つかった状態の静止画 / 画面外・タブ非表示で停止 */
(function () {
    'use strict';

    var host = document.querySelector('[data-cg="discovery"]');
    if (!host) return;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var BRAIN = '168,130,255', GREY = '120,120,128', WHITE = '236,236,242', AGENT = '220,210,255';
    var SOURCES = ['Files', 'Slack', 'Email', 'CRM', 'ERP', 'Database', 'Project Tools', 'Chat'];

    var W = 1, H = 1, dpr = 1, narrow = false;
    var nodes = [], edges = [], adj = [], agents = [], center = {}, found = 0, relations = 0, holdT = 0;
    var seed = 17;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

    function build() {
        seed = 17;
        narrow = W < 520;
        center = { x: W / 2, y: H * 0.48, r: 0 };
        nodes = []; edges = []; adj = [];
        var N = narrow ? 46 : 70, tries = 0;
        while (nodes.length < N && tries++ < 4000) {
            var x = W * (0.04 + rand() * 0.92), y = H * (0.06 + rand() * 0.84);
            var dx = (x - center.x) / W, dy = (y - center.y) / H;
            if (dx * dx + dy * dy < 0.035) continue; // 中央は空けておく
            var ok = nodes.every(function (n) { return (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) > (narrow ? 700 : 1300); });
            if (!ok) continue;
            nodes.push({ x: x, y: y, seen: 0, src: null, lit: 0 });
        }
        // 何個かを「データの出どころ」にする
        var idx = nodes.map(function (_, i) { return i; }).sort(function () { return rand() - 0.5; });
        SOURCES.forEach(function (s, i) { if (idx[i] !== undefined) nodes[idx[i]].src = s; });
        nodes.forEach(function () { adj.push([]); });
        nodes.forEach(function (a, i) {
            var near = nodes.map(function (b, j) { return [((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)), j]; })
                .filter(function (p) { return p[1] !== i; }).sort(function (p, q) { return p[0] - q[0]; }).slice(0, 3);
            near.forEach(function (p) {
                var j = p[1];
                if (adj[i].indexOf(j) >= 0) return;
                edges.push({ a: i, b: j, lit: 0 });
                adj[i].push(j); adj[j].push(i);
            });
        });
        agents = [];
        for (var k = 0; k < (narrow ? 3 : 4); k++) {
            var start = Math.floor(rand() * nodes.length);
            agents.push({ from: start, to: start, u: 1, trail: [] });
            nodes[start].seen = 1;
        }
        found = 0; relations = 0; holdT = 0;
        if (reduce) {
            nodes.forEach(function (n, i) { if (i % 5 !== 0) { n.seen = 1; n.lit = 1; } });
            edges.forEach(function (e) { if (nodes[e.a].seen && nodes[e.b].seen) e.lit = 1; });
            found = nodes.filter(function (n) { return n.src && n.seen; }).length;
            relations = edges.filter(function (e) { return e.lit; }).length;
        }
    }

    function layout() {
        W = host.clientWidth; H = host.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        build();
        if (reduce) draw(0);
    }

    function edgeBetween(i, j) {
        for (var k = 0; k < edges.length; k++) {
            var e = edges[k];
            if ((e.a === i && e.b === j) || (e.a === j && e.b === i)) return e;
        }
        return null;
    }

    function step(dt) {
        agents.forEach(function (ag) {
            ag.u += dt * 1.6;
            if (ag.u < 1) return;
            var n = nodes[ag.to];
            if (!n.seen) { n.seen = 1; if (n.src) found++; }
            var e = edgeBetween(ag.from, ag.to);
            if (e && !e.lit) { e.lit = 0.01; relations++; }
            // まだ見ていない隣を優先して進む
            var nb = adj[ag.to];
            var fresh = nb.filter(function (j) { return !nodes[j].seen; });
            var pick = fresh.length ? fresh[Math.floor(rand() * fresh.length)] : nb[Math.floor(rand() * nb.length)];
            ag.from = ag.to; ag.to = pick; ag.u = 0;
        });
        nodes.forEach(function (n) { if (n.seen) n.lit = Math.min(1, n.lit + dt * 2); });
        edges.forEach(function (e) { if (e.lit > 0) e.lit = Math.min(1, e.lit + dt * 1.5); });
        var total = nodes.filter(function (n) { return n.src; }).length;
        if (found >= total) {
            holdT += dt;
            if (holdT > 3.5) build(); // もう一度最初から
        }
    }

    function draw(t) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var total = nodes.filter(function (n) { return n.src; }).length || 1;
        var prog = found / total;

        // ネットワーク
        edges.forEach(function (e) {
            var a = nodes[e.a], b = nodes[e.b];
            ctx.strokeStyle = e.lit > 0 ? 'rgba(' + BRAIN + ',' + (0.12 + e.lit * 0.25).toFixed(3) + ')' : 'rgba(' + GREY + ',0.1)';
            ctx.lineWidth = e.lit > 0 ? 1 : 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        });

        // 見つかった出どころ → 中央(関係の対応付け)
        nodes.forEach(function (n) {
            if (!n.src || n.lit < 0.05) return;
            ctx.strokeStyle = 'rgba(' + BRAIN + ',' + (0.35 * n.lit).toFixed(3) + ')';
            ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(center.x, center.y); ctx.stroke();
            ctx.setLineDash([]);
        });

        ctx.font = (narrow ? '9px ' : '10px ') + '"DM Mono", ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        nodes.forEach(function (n) {
            if (n.src) {
                var a = 0.25 + n.lit * 0.75;
                ctx.strokeStyle = 'rgba(' + (n.lit > 0.1 ? BRAIN : GREY) + ',' + a.toFixed(2) + ')';
                ctx.lineWidth = 1;
                ctx.strokeRect(n.x - 5, n.y - 5, 10, 10);
                if (n.lit > 0.1) {
                    ctx.fillStyle = 'rgba(' + BRAIN + ',' + (0.3 * n.lit).toFixed(2) + ')';
                    ctx.fillRect(n.x - 5, n.y - 5, 10, 10);
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.85 * n.lit).toFixed(2) + ')';
                    ctx.textAlign = n.x > W * 0.8 ? 'right' : 'left';
                    ctx.fillText(n.src, n.x + (n.x > W * 0.8 ? -10 : 10), n.y);
                }
            } else {
                ctx.fillStyle = n.lit > 0.1 ? 'rgba(' + WHITE + ',' + (0.2 + n.lit * 0.35).toFixed(2) + ')' : 'rgba(' + GREY + ',0.3)';
                ctx.beginPath(); ctx.arc(n.x, n.y, 1.8, 0, 6.2832); ctx.fill();
            }
        });

        // エージェント(小さな光)
        agents.forEach(function (ag) {
            var a = nodes[ag.from], b = nodes[ag.to], u = Math.min(1, ag.u);
            var x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
            var g = ctx.createRadialGradient(x, y, 0, x, y, 12);
            g.addColorStop(0, 'rgba(' + AGENT + ',0.6)');
            g.addColorStop(1, 'rgba(' + AGENT + ',0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(250,248,255,1)';
            ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.2832); ctx.fill();
        });

        // 中央: 形になっていく Company Brain
        var R = lerp(4, narrow ? 26 : 36, prog);
        var gl = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, R * 2.6);
        gl.addColorStop(0, 'rgba(' + BRAIN + ',' + (0.1 + prog * 0.35).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(' + BRAIN + ',0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(center.x, center.y, R * 2.6, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(' + BRAIN + ',' + (0.3 + prog * 0.6).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(center.x, center.y, R, 0, 6.2832 * Math.max(prog, 0.02)); ctx.stroke();
        ctx.fillStyle = 'rgba(' + BRAIN + ',' + (0.4 + prog * 0.6).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(center.x, center.y, 3 + prog * 3, 0, 6.2832); ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(' + BRAIN + ',' + (0.35 + prog * 0.6).toFixed(2) + ')';
        ctx.fillText('COMPANY BRAIN', center.x, center.y + R + 14);

        // 状況
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(' + AGENT + ',0.85)';
        ctx.fillText('DISCOVERY AGENT · CONCEPT', 6, 6);
        ctx.fillStyle = 'rgba(' + WHITE + ',0.55)';
        ctx.fillText('sources ' + found + ' / ' + total + '   relations ' + relations, 6, 22);
    }
    function lerp(a, b, t) { return a + (b - a) * t; }

    var t0 = null, last = 0, raf = 0, visible = true;
    function frame(ms) {
        raf = 0;
        if (!visible || document.hidden) return;
        if (t0 === null) t0 = ms;
        var t = (ms - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
        step(dt);
        draw(t);
        raf = requestAnimationFrame(frame);
    }
    function play() { if (!reduce && !raf) raf = requestAnimationFrame(frame); }

    if (window.ResizeObserver) new ResizeObserver(layout).observe(host);
    else window.addEventListener('resize', layout);
    layout();
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) play(); }).observe(host);
    document.addEventListener('visibilitychange', play);
    play();
})();
