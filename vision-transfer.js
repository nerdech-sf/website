/* nerdech — vision-transfer.js
   VISION の CG。いまの情報伝達のボトルネックと、その切り替え。
   [data-cg="transfer"] ごとに描く。data-mode="scrolly" は外から段階を変え、"hero" は自動で繰り返す。
     0 HUMAN A → LANGUAGE → DOCUMENT → LEARNING → HUMAN B(いまの伝え方)
     1 知識が増えるほど、学ぶ時間(TIME)が伸びていく
     2 経験を言語に圧縮するとき、多くが失われる
     3 EXPERIENCE → MACHINE STATE → AI / HUMAN / ROBOT(長期的に目指す姿)
   - prefers-reduced-motion: 各段階の静止画 / 画面外・タブ非表示で停止 */
(function () {
    'use strict';

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var GREY = '160,160,168', WHITE = '236,236,242', WARM = '255,190,160', BRAIN = '168,130,255';

    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function Transfer(host) {
        var mode = host.getAttribute('data-mode') || 'scrolly';
        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;

        var W = 1, H = 1, dpr = 1, narrow = false;
        var stage = mode === 'hero' ? 1 : 0, stageT = stage;
        var parts = [], lost = [], grow = 0;
        var seed = 5;
        function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

        function layout() {
            W = host.clientWidth; H = host.clientHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            narrow = W < 520;
            if (reduce) frame(performance.now(), true);
        }

        // 段階ごとの点の位置
        function pipeNodes() {
            var y = H * 0.42;
            return [
                { k: 'HUMAN A', x: W * 0.1, y: y },
                { k: 'LANGUAGE', x: W * 0.32, y: y },
                { k: 'DOCUMENT', x: W * 0.5, y: y },
                { k: 'LEARNING', x: W * 0.68, y: y },
                { k: 'HUMAN B', x: W * 0.9, y: y }
            ];
        }
        function stateNodes() {
            return {
                src: { k: 'EXPERIENCE', x: W * 0.12, y: H * 0.42 },
                mid: { k: 'MACHINE STATE', x: W * 0.48, y: H * 0.42 },
                out: [
                    { k: 'AI', x: W * 0.86, y: H * 0.2 },
                    { k: 'HUMAN', x: W * 0.86, y: H * 0.42 },
                    { k: 'ROBOT', x: W * 0.86, y: H * 0.64 }
                ]
            };
        }

        var t0 = null, last = 0, raf = 0, visible = true, acc = 0, heroClock = 0;

        function frame(ms, once) {
            raf = 0;
            if (!once && (!visible || document.hidden)) return;
            if (t0 === null) t0 = ms;
            var t = (ms - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
            if (reduce) dt = 0;

            if (mode === 'hero' && !reduce) {
                heroClock += dt;
                var cyc = heroClock % 14;
                stage = cyc < 8 ? 1 : 3;
            }
            stageT += (stage - stageT) * (reduce ? 1 : Math.min(1, dt * 2.6));
            var s = stageT;
            var growOn = smooth(s - 0.2) * (1 - smooth(s - 2.3));   // 1 で伸びる
            var lossOn = smooth(s - 1.3) * (1 - smooth(s - 2.5));   // 2 で失われる
            var mach = smooth(s - 2.2);                               // 3 で切り替わる

            // 時間の伸び(段階 1 のあいだ伸び続け、繰り返す)
            if (growOn > 0.5 && !reduce) grow = Math.min(1, grow + dt * 0.2);
            else if (growOn < 0.2) grow = Math.max(0, grow - dt * 0.5);
            if (reduce) grow = stage >= 1 && stage < 3 ? 0.85 : 0;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);

            var P = pipeNodes(), S = stateNodes();
            var font = (narrow ? '10px ' : '12px ') + '"DM Mono", ui-monospace, monospace';

            // --- 左: 知識・経験のかたまり(増えるほど大きい)
            var cloudR = lerp(20, narrow ? 44 : 70, Math.max(grow, lossOn * 0.9, mach * 0.9));
            var cx = lerp(P[0].x, S.src.x, mach), cy = P[0].y;
            for (var i = 0; i < 70; i++) {
                var a = i * 2.39996, r = Math.sqrt((i + 0.5) / 70) * cloudR;
                var ox = Math.cos(a + t * 0.05) * r, oy = Math.sin(a + t * 0.05) * r * 0.8;
                var kind = i % 5;
                var col = lossOn > 0.3 && kind > 1 ? WARM : GREY;
                ctx.fillStyle = 'rgba(' + (mach > 0.5 ? BRAIN : col) + ',' + (0.35 + (i % 3) * 0.15).toFixed(2) + ')';
                ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 2.1, 0, 6.2832); ctx.fill();
            }

            // --- 中: いまの伝え方(段階 0〜2)
            var pa = 1 - mach;
            if (pa > 0.01) {
                // LEARNING の区間が、知識が増えるほど太く・長く見えるように
                ctx.lineWidth = 1;
                for (var k = 0; k < P.length - 1; k++) {
                    var isLearn = k === 3;
                    ctx.strokeStyle = 'rgba(' + GREY + ',' + (0.55 * pa).toFixed(3) + ')';
                    if (isLearn) { ctx.lineWidth = 1 + grow * 6; ctx.strokeStyle = 'rgba(' + GREY + ',' + ((0.25 + grow * 0.2) * pa).toFixed(3) + ')'; }
                    ctx.beginPath(); ctx.moveTo(P[k].x + (k === 0 ? cloudR : 8), P[k].y); ctx.lineTo(P[k + 1].x - 8, P[k + 1].y); ctx.stroke();
                    ctx.lineWidth = 1;
                }
                // LANGUAGE は細い口(圧縮)
                var neck = lerp(9, 4, lossOn);
                ctx.strokeStyle = 'rgba(' + (lossOn > 0.3 ? WARM : GREY) + ',' + (0.7 * pa).toFixed(3) + ')';
                ctx.beginPath();
                ctx.moveTo(P[1].x - 22, P[1].y - 20); ctx.lineTo(P[1].x - 2, P[1].y - neck); ctx.lineTo(P[1].x + 8, P[1].y - neck);
                ctx.moveTo(P[1].x - 22, P[1].y + 20); ctx.lineTo(P[1].x - 2, P[1].y + neck); ctx.lineTo(P[1].x + 8, P[1].y + neck);
                ctx.stroke();

                ctx.font = font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                P.forEach(function (n, j) {
                    if (j > 1) {
                        ctx.strokeStyle = 'rgba(' + WHITE + ',' + (0.55 * pa).toFixed(3) + ')';
                        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(n.x, n.y, j === 4 ? 9 : 6, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
                    }
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.7 * pa).toFixed(3) + ')';
                    var lab = n.k;
                    if (narrow && lab === 'LANGUAGE') lab = 'LANG.';
                    if (narrow && lab === 'DOCUMENT') lab = 'DOC.';
                    ctx.fillText(lab, n.x, n.y + (j === 0 ? cloudR + 8 : 26));
                });

                // TIME の帯(教育の段階が積み重なる)
                var bars = narrow ? ['小', '中', '高', '大', '院', '研究'] : ['小学校', '中学校', '高校', '大学', '大学院', '研究'];
                var weights = [6, 3, 3, 4, 5, 6];
                var tx0 = W * 0.06, tw = W * 0.88 * Math.max(0.12, grow), ty = H * 0.74;
                var total = weights.reduce(function (a2, b2) { return a2 + b2; }, 0), accx = tx0;
                ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
                ctx.fillStyle = 'rgba(' + GREY + ',' + (0.6 * pa).toFixed(3) + ')';
                ctx.fillText('TIME TO REACH THE FRONTIER', tx0, ty - 18);
                bars.forEach(function (b, j) {
                    var w = tw * weights[j] / total;
                    var shown = grow > (j / bars.length) * 0.9 || grow > 0.95;
                    if (!shown && grow > 0.05) return;
                    ctx.fillStyle = 'rgba(' + GREY + ',' + ((0.16 + j * 0.04) * pa).toFixed(3) + ')';
                    ctx.fillRect(accx, ty - 11, Math.max(1, w - 2), 22);
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.6 * pa).toFixed(3) + ')';
                    if (w > (narrow ? 14 : 34) && grow > 0.05) ctx.fillText(b, accx + 4, ty);
                    accx += w;
                });
                var years = Math.round(lerp(0, 24, grow));
                ctx.textAlign = 'right';
                ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.8 * pa).toFixed(3) + ')';
                ctx.fillText(grow > 0.05 ? '≈ ' + years + ' years' : '', W * 0.94, ty - 18);
            }

            // --- 切り替え後: EXPERIENCE → MACHINE STATE → AI / HUMAN / ROBOT(段階 3)
            if (mach > 0.01) {
                var m = S.mid, gw = narrow ? 64 : 92, gh = narrow ? 52 : 72;
                ctx.strokeStyle = 'rgba(' + BRAIN + ',' + (0.35 * mach).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(cx + cloudR, cy); ctx.lineTo(m.x - gw / 2, m.y); ctx.stroke();
                S.out.forEach(function (o) {
                    ctx.beginPath(); ctx.moveTo(m.x + gw / 2, m.y);
                    ctx.bezierCurveTo((m.x + o.x) / 2, m.y, (m.x + o.x) / 2, o.y, o.x - 10, o.y); ctx.stroke();
                });
                // 機械が読める状態(格子)
                var gl = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, gw);
                gl.addColorStop(0, 'rgba(' + BRAIN + ',' + (0.22 * mach).toFixed(3) + ')');
                gl.addColorStop(1, 'rgba(' + BRAIN + ',0)');
                ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(m.x, m.y, gw, 0, 6.2832); ctx.fill();
                ctx.strokeStyle = 'rgba(' + BRAIN + ',' + (0.75 * mach).toFixed(3) + ')';
                ctx.strokeRect(m.x - gw / 2, m.y - gh / 2, gw, gh);
                var cols = 8, rows = 6;
                for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
                    var v = 0.2 + 0.8 * Math.abs(Math.sin(r2 * 1.7 + c2 * 0.9 + t * 1.3 * (reduce ? 0 : 1)));
                    ctx.fillStyle = 'rgba(' + BRAIN + ',' + (v * 0.8 * mach).toFixed(3) + ')';
                    ctx.fillRect(m.x - gw / 2 + 6 + c2 * (gw - 12) / cols, m.y - gh / 2 + 6 + r2 * (gh - 12) / rows, (gw - 12) / cols - 2, (gh - 12) / rows - 2);
                }
                ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.75 * mach).toFixed(3) + ')';
                ctx.fillText('EXPERIENCE', cx, cy + cloudR + 8);
                ctx.fillStyle = 'rgba(' + BRAIN + ',' + (0.95 * mach).toFixed(3) + ')';
                ctx.fillText('MACHINE STATE', m.x, m.y + gh / 2 + 8);
                S.out.forEach(function (o) {
                    ctx.strokeStyle = 'rgba(' + WHITE + ',' + (0.7 * mach).toFixed(3) + ')';
                    ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, 6.2832); ctx.stroke();
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.8 * mach).toFixed(3) + ')';
                    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(o.k, o.x + 12, o.y);
                });
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(' + BRAIN + ',' + (0.7 * mach).toFixed(3) + ')';
                ctx.fillText('LONG-TERM VISION', 6, 6);
            }

            // --- 流れる粒
            if (!reduce) {
                acc += dt;
                var rate = mach > 0.5 ? 0.06 : lerp(0.18, 0.08, Math.max(grow, lossOn));
                while (acc > rate) {
                    acc -= rate;
                    if (parts.length < 90) parts.push({ u: 0, lane: rand(), out: Math.floor(rand() * 3), kind: Math.floor(rand() * 5) });
                }
            }
            parts = parts.filter(function (p) {
                var x, y, speed;
                if (mach > 0.5) {
                    speed = 0.9;
                    p.u += dt * speed;
                    if (p.u >= 1) return false;
                    var m2 = S.mid, o2 = S.out[p.out];
                    if (p.u < 0.45) { var q = p.u / 0.45; x = lerp(cx + cloudR, m2.x, q); y = lerp(cy, m2.y, q) + (p.lane - 0.5) * 10 * (1 - q); }
                    else { var q2 = (p.u - 0.45) / 0.55; x = lerp(m2.x, o2.x, q2); y = lerp(m2.y, o2.y, smooth(q2)); }
                    ctx.fillStyle = 'rgba(' + BRAIN + ',0.9)';
                } else {
                    // 区間ごとの速さ。LEARNING は知識が増えるほど遅い
                    var seg = Math.min(3, Math.floor(p.u * 4));
                    speed = seg === 3 ? lerp(0.35, 0.05, grow) : 0.45;
                    // 言語に圧縮するとき、多くが失われる
                    if (seg >= 1 && !p.checked) {
                        p.checked = true;
                        if (lossOn > 0.3 && p.kind > 1) { lost.push({ x: P[1].x, y: P[1].y, vy: -10 - rand() * 20, vx: (rand() - 0.5) * 30, a: 0.8 }); return false; }
                    }
                    p.u += dt * speed / 4 * 4 * 0.25;
                    if (p.u >= 1) return false;
                    var k2 = Math.min(3, Math.floor(p.u * 4)), f = p.u * 4 - k2;
                    var A = P[k2], B = P[k2 + 1];
                    x = lerp(k2 === 0 ? cx + cloudR : A.x, B.x, f); y = lerp(A.y, B.y, f) + (p.lane - 0.5) * (k2 === 3 ? 2 + grow * 5 : 3);
                    ctx.fillStyle = 'rgba(' + (lossOn > 0.3 && p.kind > 1 ? WARM : WHITE) + ',0.85)';
                }
                ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.2832); ctx.fill();
                return true;
            });
            lost = lost.filter(function (l) {
                l.x += l.vx * dt; l.y += l.vy * dt; l.vy += 40 * dt; l.a -= dt * 0.6;
                if (l.a <= 0) return false;
                ctx.fillStyle = 'rgba(' + WARM + ',' + l.a.toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(l.x, l.y, 1.5, 0, 6.2832); ctx.fill();
                return true;
            });
            if (lossOn > 0.5) {
                ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillStyle = 'rgba(' + WARM + ',' + (0.8 * lossOn * (1 - mach)).toFixed(3) + ')';
                ctx.fillText(narrow ? 'LOST' : 'LOST IN TRANSLATION', P[1].x, P[1].y - 26);
            }

            if (!once && !reduce) raf = requestAnimationFrame(frame);
        }

        function play() { if (!reduce && !raf) raf = requestAnimationFrame(frame); }
        if (window.ResizeObserver) new ResizeObserver(layout).observe(host);
        else window.addEventListener('resize', layout);
        layout();
        if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) play(); }).observe(host);
        document.addEventListener('visibilitychange', play);
        play();
        return { setStage: function (n) { stage = n; if (reduce) frame(performance.now(), true); } };
    }

    [].slice.call(document.querySelectorAll('[data-cg="transfer"]')).forEach(function (el) { el.cg = Transfer(el); });

    // スクロールで段階を進める(.scrolly の中の [data-cg="transfer"])
    [].slice.call(document.querySelectorAll('.scrolly')).forEach(function (sec) {
        var vis = sec.querySelector('[data-cg="transfer"]');
        if (!vis || !vis.cg) return;
        var steps = [].slice.call(sec.querySelectorAll('.scrolly__step'));
        var dots = [].slice.call(sec.querySelectorAll('.scrolly__dots li'));
        function check() {
            var line = window.innerHeight * (window.innerWidth < 900 ? 0.72 : 0.55), cur = 0;
            steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < line) cur = i; });
            steps.forEach(function (s, j) { s.classList.toggle('is-active', j === cur); });
            dots.forEach(function (d, j) { d.classList.toggle('is-active', j === cur); });
            vis.cg.setStage(cur);
        }
        window.addEventListener('scroll', check, { passive: true });
        window.addEventListener('resize', check);
        check();
    });
})();
