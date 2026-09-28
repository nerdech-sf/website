/* nerdech — front-graph.js
   トップの脳。Obsidian のグラフビューのように、ノードと線で脳を描き、3D でゆっくり回す。
   - 形: 大脳(左右)・側頭葉・小脳・脳幹を楕円体の和で作り、その表面にノードを置く
   - 大脳の表面は「しわ」の線の上にノードを寄せ、近いもの同士をつなぐので、線が脳回に見える
   - 事業ノード(.gnode)は脳の部位とつながる: THINK=上(脳の上に立つ司令塔) / BUILD=左(デジタル) / PERCEIVE=右(フィジカル)
   - 脳にカーソルを乗せると、近いノードとその隣が光る(Obsidian のホバーと同じ)
   - Canvas 2D のみ。依存なし・ビルド不要
   - prefers-reduced-motion: 回転と集まる演出なし。ホバーの強調だけ行う */
(function () {
    'use strict';

    var stage = document.querySelector('.front');
    if (!stage) return;
    var hub = stage.querySelector('.hub');
    var gnodes = [].slice.call(stage.querySelectorAll('.gnode'));

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var compact = window.matchMedia('(max-aspect-ratio: 1/1), (hover: none)').matches;

    var canvas = document.createElement('canvas');
    canvas.className = 'front__graph';
    canvas.setAttribute('aria-hidden', 'true');
    var ctx = canvas.getContext('2d');
    if (!ctx) { stage.classList.add('is-ready'); return; }
    stage.insertBefore(canvas, stage.firstChild);

    var ACCENT = [168, 130, 255];
    var NODE = [190, 190, 196];

    /* ---------- 形 ---------- */
    // [cx, cy, cz, rx, ry, rz, 重み, 表面の模様]
    var PARTS = [
        [0.00, 0.19, -0.35, 1.00, 0.70, 0.40, 0.29, 'gyri'],   // 大脳 左
        [0.00, 0.19,  0.35, 1.00, 0.70, 0.40, 0.29, 'gyri'],   // 大脳 右
        [0.14, -0.25, -0.44, 0.60, 0.29, 0.25, 0.08, 'gyri'],  // 側頭葉 左
        [0.14, -0.25,  0.44, 0.60, 0.29, 0.25, 0.08, 'gyri'],  // 側頭葉 右
        [-0.66, -0.40, 0.00, 0.36, 0.23, 0.52, 0.19, 'folia'], // 小脳
        [-0.27, -0.66, 0.00, 0.14, 0.30, 0.14, 0.07, 'plain']  // 脳幹
    ];

    var seedN = 20260927;
    function rand() { seedN = (seedN * 1664525 + 1013904223) >>> 0; return seedN / 4294967296; }
    function gauss() { return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(6.2831853 * rand()); }

    function insideOther(x, y, z, skip) {
        for (var k = 0; k < PARTS.length; k++) {
            if (k === skip) continue;
            var q = PARTS[k];
            var dx = (x - q[0]) / q[3], dy = (y - q[1]) / q[4], dz = (z - q[2]) / q[5];
            if (dx * dx + dy * dy + dz * dz < 0.96) return true;
        }
        return false;
    }

    var N = compact ? 900 : 1500;
    var P = new Float32Array(N * 3);     // 脳の上の位置
    var S = new Float32Array(N * 3);     // 集まる前の位置
    var SEED = new Float32Array(N);
    var n = 0, guard = 0;
    while (n < N && guard++ < N * 400) {
        // 部位を重みで選ぶ
        var r0 = rand(), acc = 0, pi = 0;
        for (; pi < PARTS.length; pi++) { acc += PARTS[pi][6]; if (r0 < acc) break; }
        if (pi >= PARTS.length) pi = 0;
        var q = PARTS[pi];

        var ux = gauss(), uy = gauss(), uz = gauss();
        var len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        ux /= len; uy /= len; uz /= len;

        if (q[7] === 'gyri') {
            var g = Math.sin(uy * 5.5 + Math.sin(ux * 4.0 + q[2] * 3.0) * 1.7) * Math.sin(ux * 6.5 + uz * 2.5)
                  + 0.35 * Math.sin(uz * 6.0 + ux * 2.0);
            if (rand() > Math.pow(1 - Math.min(Math.abs(g), 1), 5) && rand() > 0.12) continue;
        } else if (q[7] === 'folia') {
            if (rand() > Math.pow(Math.abs(Math.cos(uy * 11.0)), 8) && rand() > 0.1) continue;
        }

        var x = q[0] + ux * q[3], y = q[1] + uy * q[4], z = q[2] + uz * q[5];
        if (q[7] === 'gyri' && pi < 2) {
            if (y < 0.0) y = y * 0.8;              // 大脳の下面を少し平らに
            if (x > 0.55) y -= (x - 0.55) * 0.18;  // 前頭の下がり
        }
        if (insideOther(x, y, z, pi)) continue;

        P[n * 3] = x; P[n * 3 + 1] = y + 0.1; P[n * 3 + 2] = z;
        S[n * 3] = (rand() * 2 - 1) * 3.2;
        S[n * 3 + 1] = (rand() * 2 - 1) * 2.2;
        S[n * 3 + 2] = (rand() * 2 - 1) * 1.6;
        SEED[n] = rand();
        n++;
    }
    N = n;

    // 近いノード同士をつなぐ(各ノード 3 本まで)
    var edges = [];
    var nbr = [];
    (function () {
        var MAXD = compact ? 0.19 : 0.15;
        var seen = {};
        for (var i = 0; i < N; i++) nbr.push([]);
        for (var i = 0; i < N; i++) {
            var best = [];
            for (var j = 0; j < N; j++) {
                if (j === i) continue;
                var dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
                var d = dx * dx + dy * dy + dz * dz;
                if (d > MAXD * MAXD) continue;
                best.push([d, j]);
            }
            best.sort(function (a, b) { return a[0] - b[0]; });
            for (var k = 0; k < Math.min(3, best.length); k++) {
                var j2 = best[k][1];
                var key = i < j2 ? i + '_' + j2 : j2 + '_' + i;
                if (seen[key]) continue;
                seen[key] = 1;
                edges.push(i, j2);
                nbr[i].push(j2); nbr[j2].push(i);
            }
        }
    })();
    var E = edges.length / 2;

    // 事業ノード → 脳の部位
    var links = gnodes.map(function (el) {
        var a = (el.getAttribute('data-anchor') || '0,0,0').split(',').map(Number);
        var best = 0, bd = 1e9;
        for (var i = 0; i < N; i++) {
            var dx = P[i * 3] - a[0], dy = P[i * 3 + 1] - a[1], dz = P[i * 3 + 2] - a[2];
            var d = dx * dx + dy * dy + dz * dz;
            if (d < bd) { bd = d; best = i; }
        }
        // 部位として光らせる範囲
        var region = [];
        for (var i = 0; i < N; i++) {
            var dx = P[i * 3] - P[best * 3], dy = P[i * 3 + 1] - P[best * 3 + 1], dz = P[i * 3 + 2] - P[best * 3 + 2];
            var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 0.42) region.push([i, 1 - d / 0.42]);
        }
        return { el: el, dot: el.querySelector('.gnode__dot'), anchor: best, region: region, x: 0, y: 0, on: 0, onT: 0 };
    });

    /* ---------- 投影 ---------- */
    var W = 1, H = 1, dpr = 1, cx = 0, cy = 0, ppu = 1;
    var X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), F = new Float32Array(N);
    var HL = new Float32Array(N), HLT = new Float32Array(N); // 強調(現在値 / 目標)

    function layout() {
        var sr = stage.getBoundingClientRect();
        var br = hub.getBoundingClientRect();
        W = sr.width; H = sr.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        cx = br.left + br.width / 2 - sr.left;
        cy = br.top + br.height / 2 - sr.top;
        ppu = br.width / (2.2 * 0.72);
        links.forEach(function (l) {
            var d = l.dot.getBoundingClientRect();
            l.x = d.left + d.width / 2 - sr.left;
            l.y = d.top + d.height / 2 - sr.top;
        });
        dirty = true;
    }

    function project(rotY, rotX, prog) {
        var cyr = Math.cos(rotY), syr = Math.sin(rotY), cxr = Math.cos(rotX), sxr = Math.sin(rotX);
        for (var i = 0; i < N; i++) {
            var t = Math.min(Math.max(prog * 1.6 - SEED[i] * 0.6, 0), 1);
            var e = 1 - Math.pow(1 - t, 3);
            var x = S[i * 3] + (P[i * 3] - S[i * 3]) * e;
            var y = S[i * 3 + 1] + (P[i * 3 + 1] - S[i * 3 + 1]) * e;
            var z = S[i * 3 + 2] + (P[i * 3 + 2] - S[i * 3 + 2]) * e;
            var x1 = cyr * x + syr * z, z1 = -syr * x + cyr * z;
            var y2 = cxr * y - sxr * z1, z2 = sxr * y + cxr * z1;
            var f = 3.2 / (4.6 - z2);
            X[i] = cx + x1 * f * ppu;
            Y[i] = cy - y2 * f * ppu;
            Z[i] = z2;
            F[i] = e;
        }
    }

    /* ---------- 入力 ---------- */
    var pointer = null;       // 脳の上のポインタ(ステージ座標)
    var focus = 0, focusT = 0; // 全体を暗くする量
    var tilt = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 };
    var dirty = true;

    hub.addEventListener('pointermove', function (e) {
        var sr = stage.getBoundingClientRect();
        pointer = { x: e.clientX - sr.left, y: e.clientY - sr.top };
    });
    hub.addEventListener('pointerleave', function () { pointer = null; });

    links.forEach(function (l) {
        function on() { l.onT = 1; }
        function off() { l.onT = 0; }
        l.el.addEventListener('pointerenter', on);
        l.el.addEventListener('pointerleave', off);
        l.el.addEventListener('focus', on);
        l.el.addEventListener('blur', off);
    });

    if (!compact && !reduce) {
        window.addEventListener('pointermove', function (e) {
            tiltT.x = (e.clientX / window.innerWidth - 0.5) * 0.35;
            tiltT.y = (e.clientY / window.innerHeight - 0.5) * 0.16;
        }, { passive: true });
    }

    function updateHighlight() {
        for (var i = 0; i < N; i++) HLT[i] = 0;
        focusT = 0;
        if (pointer) {
            // Obsidian と同じく、いちばん近いノードとその隣を光らせる
            var best = -1, bd = 26 * 26;
            for (var i = 0; i < N; i++) {
                if (Z[i] < -0.15) continue;
                var dx = X[i] - pointer.x, dy = Y[i] - pointer.y, d = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0) {
                HLT[best] = 1;
                nbr[best].forEach(function (j) {
                    HLT[j] = Math.max(HLT[j], 0.8);
                    nbr[j].forEach(function (k) { HLT[k] = Math.max(HLT[k], 0.4); });
                });
                focusT = 1;
            }
        }
        links.forEach(function (l) {
            l.on += (l.onT - l.on) * 0.12;
            if (l.onT > 0) {
                focusT = 1;
                l.region.forEach(function (r) { HLT[r[0]] = Math.max(HLT[r[0]], r[1]); });
            }
        });
        var moving = false;
        for (var i = 0; i < N; i++) {
            var d = HLT[i] - HL[i];
            if (Math.abs(d) > 0.002) { HL[i] += d * 0.14; moving = true; }
        }
        var df = focusT - focus;
        if (Math.abs(df) > 0.002) { focus += df * 0.12; moving = true; }
        return moving;
    }

    /* ---------- 描画 ---------- */
    var LEVELS = 6;
    var lvE = new Uint8Array(E), lvN = new Uint8Array(N);

    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }

    function draw(time) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var dim = 1 - focus * 0.6;

        // 事業ノード → 脳の線(奥に描く)
        links.forEach(function (l, idx) {
            var a = l.anchor;
            var ax = X[a], ay = Y[a];
            var ready = F[a];
            if (ready < 0.05) return;
            var base = 0.16 * ready * (1 - focus * 0.4) + l.on * 0.6;
            ctx.lineWidth = 1 + l.on * 0.4;
            ctx.strokeStyle = l.on > 0.05
                ? 'rgba(' + Math.round(190 + (ACCENT[0] - 190) * l.on) + ',' + Math.round(190 + (ACCENT[1] - 190) * l.on) + ',' + Math.round(196 + (ACCENT[2] - 196) * l.on) + ',' + base.toFixed(3) + ')'
                : rgba(NODE, base);
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            // 線を流れる小さな信号
            if (!reduce) {
                var u = ((time * 0.22 + idx / 3) % 1);
                ctx.fillStyle = rgba(l.on > 0.3 ? ACCENT : NODE, (0.5 + l.on * 0.5) * ready * Math.sin(u * Math.PI));
                ctx.beginPath();
                ctx.arc(l.x + (ax - l.x) * u, l.y + (ay - l.y) * u, 1.6, 0, 6.2832);
                ctx.fill();
            }
        });

        // 線(深さと強調で段階分け)
        for (var k = 0; k < E; k++) {
            var i = edges[k * 2], j = edges[k * 2 + 1];
            var depth = Math.min(Math.max(((Z[i] + Z[j]) * 0.5 + 1.1) / 2.2, 0), 1);
            lvE[k] = Math.min(LEVELS - 1, Math.floor(depth * LEVELS));
        }
        ctx.lineWidth = 0.7;
        for (var L = 0; L < LEVELS; L++) {
            var alpha = (0.04 + 0.2 * (L / (LEVELS - 1))) * dim;
            ctx.strokeStyle = rgba(NODE, alpha);
            ctx.beginPath();
            for (var k = 0; k < E; k++) {
                if (lvE[k] !== L) continue;
                var i = edges[k * 2], j = edges[k * 2 + 1];
                var f = Math.min(F[i], F[j]);
                if (f < 0.98) continue;
                ctx.moveTo(X[i], Y[i]);
                ctx.lineTo(X[j], Y[j]);
            }
            ctx.stroke();
        }
        // 集まる途中の線は薄く
        ctx.strokeStyle = rgba(NODE, 0.06);
        ctx.beginPath();
        for (var k = 0; k < E; k++) {
            var i = edges[k * 2], j = edges[k * 2 + 1];
            var f = Math.min(F[i], F[j]);
            if (f >= 0.98 || f < 0.5) continue;
            ctx.moveTo(X[i], Y[i]);
            ctx.lineTo(X[j], Y[j]);
        }
        ctx.stroke();

        // 強調された線
        if (focus > 0.01) {
            ctx.lineWidth = 1;
            for (var k = 0; k < E; k++) {
                var i = edges[k * 2], j = edges[k * 2 + 1];
                var h = Math.min(HL[i], HL[j]);
                if (h < 0.05) continue;
                ctx.strokeStyle = rgba(ACCENT, h * 0.75);
                ctx.beginPath();
                ctx.moveTo(X[i], Y[i]);
                ctx.lineTo(X[j], Y[j]);
                ctx.stroke();
            }
        }

        // ノード
        for (var i = 0; i < N; i++) {
            var depth = Math.min(Math.max((Z[i] + 1.1) / 2.2, 0), 1);
            lvN[i] = Math.min(LEVELS - 1, Math.floor(depth * LEVELS));
        }
        for (var L = 0; L < LEVELS; L++) {
            var t = L / (LEVELS - 1);
            var r = 0.5 + t * 0.9;
            ctx.fillStyle = rgba(NODE, (0.25 + 0.6 * t) * dim);
            ctx.beginPath();
            for (var i = 0; i < N; i++) {
                if (lvN[i] !== L || HL[i] > 0.3) continue;
                ctx.moveTo(X[i] + r, Y[i]);
                ctx.arc(X[i], Y[i], r * (0.6 + 0.4 * F[i]), 0, 6.2832);
            }
            ctx.fill();
        }
        for (var i = 0; i < N; i++) {
            if (HL[i] <= 0.3) continue;
            ctx.fillStyle = rgba(ACCENT, Math.min(1, HL[i] + 0.2));
            ctx.beginPath();
            ctx.arc(X[i], Y[i], 1.6 + HL[i] * 1.4, 0, 6.2832);
            ctx.fill();
        }
    }

    /* ---------- ループ ---------- */
    var DURATION = 2.4;
    var t0 = null, raf = 0;

    function frame(ms) {
        raf = 0;
        if (document.hidden) return;
        if (t0 === null) t0 = ms;
        var sec = (ms - t0) / 1000;
        var prog = reduce ? 1 : Math.min(sec / DURATION, 1);
        if (prog > 0.55) stage.classList.add('is-ready');

        tilt.x += (tiltT.x - tilt.x) * 0.05;
        tilt.y += (tiltT.y - tilt.y) * 0.05;
        var rotY = reduce ? 0.35 : 0.35 + Math.sin(sec * 0.18) * 0.42 + tilt.x;
        var rotX = reduce ? 0.12 : 0.12 + tilt.y;

        project(rotY, rotX, prog);
        var moving = updateHighlight();
        if (!reduce || moving || dirty) draw(sec);
        dirty = false;
        raf = requestAnimationFrame(frame);
    }

    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
    else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    layout();

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !raf) raf = requestAnimationFrame(frame);
    });
    raf = requestAnimationFrame(frame);
})();
