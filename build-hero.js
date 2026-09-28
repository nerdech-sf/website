/* nerdech — build-hero.js
   BUILD のファーストビュー。CG と管理画面の中間。
   左: 業務情報の出どころ(Slack・電話・メール…)/ 中央: ひとつの STATE / 右: 構造化された状態(SALES・PROJECT…)
   出どころからデータが STATE へ流れ込み、STATE が右のカードを更新する。
   - スマホ(幅が狭いとき)は 上: 出どころ → 中: STATE → 下: カード の縦並び
   - prefers-reduced-motion: 静止画 / 画面外・タブ非表示で停止 */
(function () {
    'use strict';

    var host = document.querySelector('.note-hero__visual[data-visual="build"]');
    if (!host) return;
    var note = document.querySelector('.note');
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var BLUE = (getComputedStyle(note).getPropertyValue('--accent-rgb') || '150,176,255').replace(/\s/g, '');
    var GREY = '160,160,168', WHITE = '232,236,244';

    var SOURCES = ['Slack', '電話', 'メール', '議事録', 'CRM', 'タスク', '開発情報'];
    var VIEWS = [
        { key: 'SALES', rows: ['商談', '見込み', '次の行動'] },
        { key: 'PROJECT', rows: ['フェーズ', '期限', 'ブロッカー'] },
        { key: 'CLIENT', rows: ['要望', '最終連絡', '担当'] },
        { key: 'TASK', rows: ['未完了', '今週', '担当'] },
        { key: 'COMMUNICATION', rows: ['決定事項', '未決事項', '最近の会話'] }
    ];

    var W = 1, H = 1, dpr = 1, narrow = false;
    var src = [], views = [], state = {};
    var seed = 3;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

    function layout() {
        W = host.clientWidth; H = host.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        narrow = W < 440;
        if (narrow) {
            src = SOURCES.map(function (s, i) {
                var row = i < 4 ? 0 : 1, n = row ? 3 : 4, k = row ? i - 4 : i;
                return { label: s, x: W * ((k + 0.5) / n), y: H * (0.08 + row * 0.11), flash: 0, ph: i };
            });
            state = { x: W / 2, y: H * 0.45, w: Math.min(W * 0.62, 240), h: H * 0.17 };
            var cw = (W - 12) / 2;
            views = VIEWS.map(function (v, i) {
                var col = i % 2, row = Math.floor(i / 2);
                var x = i === 4 ? (W - cw) / 2 : 4 + col * (cw + 4);
                return { key: v.key, rows: v.rows, x: x, y: H * 0.66 + row * H * 0.115, w: cw, h: H * 0.095, flash: 0, bars: v.rows.map(function () { return 0.3 + rand() * 0.6; }) };
            });
        } else {
            src = SOURCES.map(function (s, i) { return { label: s, x: W * 0.04, y: H * (0.1 + i * 0.13), flash: 0, ph: i }; });
            state = { x: W * 0.44, y: H * 0.5, w: Math.max(W * 0.25, 150), h: H * 0.32 };
            var vw = W * 0.3;
            views = VIEWS.map(function (v, i) {
                return { key: v.key, rows: v.rows, x: W - vw - 2, y: H * 0.03 + i * H * 0.195, w: vw, h: H * 0.17, flash: 0, bars: v.rows.map(function () { return 0.3 + rand() * 0.6; }) };
            });
        }
        if (reduce) draw(3);
    }

    function srcOut(s) { return narrow ? { x: s.x, y: s.y + 6 } : { x: s.x + 58, y: s.y }; }
    function viewIn(v) { return narrow ? { x: v.x + v.w / 2, y: v.y } : { x: v.x, y: v.y + v.h / 2 }; }
    function stateIn() { return narrow ? { x: state.x, y: state.y - state.h / 2 } : { x: state.x - state.w / 2, y: state.y }; }
    function stateOut() { return narrow ? { x: state.x, y: state.y + state.h / 2 } : { x: state.x + state.w / 2, y: state.y }; }

    function ctrl(a, b) {
        if (narrow) { var my = (a.y + b.y) / 2; return [{ x: a.x, y: my }, { x: b.x, y: my }]; }
        var mx = (a.x + b.x) / 2; return [{ x: mx, y: a.y }, { x: mx, y: b.y }];
    }
    function bez(a, b, u) {
        var c = ctrl(a, b), it = 1 - u;
        return { x: it * it * it * a.x + 3 * it * it * u * c[0].x + 3 * it * u * u * c[1].x + u * u * u * b.x,
                 y: it * it * it * a.y + 3 * it * it * u * c[0].y + 3 * it * u * u * c[1].y + u * u * u * b.y };
    }
    function curve(a, b, style) {
        var c = ctrl(a, b);
        ctx.strokeStyle = style;
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(c[0].x, c[0].y, c[1].x, c[1].y, b.x, b.y);
        ctx.stroke();
    }
    function rrect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    }

    var pulses = [], stateFlash = 0, updates = 0, since = 0;

    function draw(t) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 0.8;

        src.forEach(function (s) { curve(srcOut(s), stateIn(), 'rgba(' + GREY + ',0.18)'); });
        views.forEach(function (v) { curve(stateOut(), viewIn(v), 'rgba(' + BLUE + ',0.26)'); });

        // 出どころ
        ctx.font = (narrow ? '10px ' : '11px ') + '"Noto Sans JP", sans-serif';
        ctx.textBaseline = 'middle';
        src.forEach(function (s) {
            var a = 0.55 + s.flash * 0.45;
            ctx.fillStyle = 'rgba(' + (s.flash > 0.3 ? BLUE : GREY) + ',' + a.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(s.x, s.y, 3 + s.flash * 1.5, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.5 + s.flash * 0.4).toFixed(2) + ')';
            if (narrow) { ctx.textAlign = 'center'; ctx.fillText(s.label, s.x, s.y - 12); }
            else { ctx.textAlign = 'left'; ctx.fillText(s.label, s.x + 10, s.y); }
        });

        // STATE
        var sx = state.x - state.w / 2, sy = state.y - state.h / 2;
        var glow = ctx.createRadialGradient(state.x, state.y, 0, state.x, state.y, state.w);
        glow.addColorStop(0, 'rgba(' + BLUE + ',' + (0.14 + stateFlash * 0.12).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(' + BLUE + ',0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(state.x, state.y, state.w, 0, 6.2832); ctx.fill();
        rrect(sx, sy, state.w, state.h, 8);
        ctx.fillStyle = 'rgba(17,17,19,0.92)'; ctx.fill();
        ctx.strokeStyle = 'rgba(' + BLUE + ',' + (0.55 + stateFlash * 0.4).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = '10px "DM Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(' + BLUE + ',0.95)';
        ctx.fillText('STATE', sx + 10, sy + 13);
        ctx.fillStyle = 'rgba(' + WHITE + ',0.45)';
        ctx.textAlign = 'right';
        ctx.fillText(reduce ? 'live' : Math.floor(since) + 's ago', sx + state.w - 8, sy + 13);
        var lines = narrow ? 3 : 5, lh = (state.h - 30) / lines;
        for (var i = 0; i < lines; i++) {
            var ly = sy + 26 + i * lh + lh / 2;
            var on = (updates % lines) === i ? stateFlash : 0;
            ctx.fillStyle = 'rgba(' + GREY + ',0.3)';
            ctx.fillRect(sx + 10, ly - 1.5, state.w * 0.22, 3);
            ctx.fillStyle = 'rgba(' + BLUE + ',' + (0.35 + on * 0.6).toFixed(2) + ')';
            ctx.fillRect(sx + 10 + state.w * 0.27, ly - 1.5, (state.w - 20 - state.w * 0.27) * (0.4 + ((i * 37) % 50) / 100), 3);
        }

        // 構造化された状態
        views.forEach(function (v) {
            rrect(v.x, v.y, v.w, v.h, 6);
            ctx.fillStyle = 'rgba(21,21,24,0.95)'; ctx.fill();
            ctx.strokeStyle = 'rgba(' + BLUE + ',' + (0.22 + v.flash * 0.6).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.stroke();
            ctx.font = '10px "DM Mono", ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(' + BLUE + ',0.95)';
            ctx.fillText(narrow && v.key === 'COMMUNICATION' ? 'COMM.' : v.key, v.x + 8, v.y + 11);
            if (v.flash > 0.05) {
                ctx.textAlign = 'right';
                ctx.fillStyle = 'rgba(' + BLUE + ',' + v.flash.toFixed(2) + ')';
                ctx.fillText(narrow ? '●' : '● updated', v.x + v.w - 8, v.y + 11);
            }
            if (!narrow) {
                ctx.font = '10px "Noto Sans JP", sans-serif';
                var rh = (v.h - 22) / v.rows.length;
                v.rows.forEach(function (r, k) {
                    var ry = v.y + 22 + k * rh + rh / 2;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = 'rgba(' + WHITE + ',0.55)';
                    ctx.fillText(r, v.x + 8, ry);
                    var bx = v.x + v.w * 0.44, bw = v.w * 0.48;
                    ctx.fillStyle = 'rgba(' + GREY + ',0.18)';
                    ctx.fillRect(bx, ry - 1.5, bw, 3);
                    ctx.fillStyle = 'rgba(' + BLUE + ',0.7)';
                    ctx.fillRect(bx, ry - 1.5, bw * v.bars[k], 3);
                });
            } else {
                ctx.fillStyle = 'rgba(' + BLUE + ',0.6)';
                v.bars.forEach(function (b, k) { if (v.y + 22 + k * 6 < v.y + v.h - 3) ctx.fillRect(v.x + 8, v.y + 22 + k * 6, (v.w - 16) * b, 2); });
            }
        });

        pulses.forEach(function (p) {
            var q = bez(p.a, p.b, p.u);
            ctx.fillStyle = 'rgba(' + (p.out ? BLUE : GREY) + ',0.25)';
            ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(240,244,255,0.95)';
            ctx.beginPath(); ctx.arc(q.x, q.y, 1.4, 0, 6.2832); ctx.fill();
        });
    }

    var t0 = null, last = 0, raf = 0, visible = true, acc = 0;
    function frame(ms) {
        raf = 0;
        if (!visible || document.hidden) return;
        if (t0 === null) t0 = ms;
        var t = (ms - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
        since += dt;
        acc += dt;
        if (acc > 0.32 && pulses.length < 14) {
            acc = 0;
            var s = src[Math.floor(rand() * src.length)];
            s.flash = 1;
            pulses.push({ a: srcOut(s), b: stateIn(), u: 0, out: false, speed: 0.7 + rand() * 0.4 });
        }
        var born = [];
        pulses = pulses.filter(function (p) {
            p.u += dt * p.speed;
            if (p.u < 1) return true;
            if (!p.out) {
                stateFlash = 1; updates++; since = 0;
                var v = views[Math.floor(rand() * views.length)];
                born.push({ a: stateOut(), b: viewIn(v), v: v, u: 0, out: true, speed: 0.9 + rand() * 0.4 });
            } else {
                p.v.flash = 1;
                var k = Math.floor(rand() * p.v.bars.length);
                p.v.bars[k] = Math.min(1, Math.max(0.15, p.v.bars[k] + (rand() - 0.4) * 0.3));
            }
            return false;
        }).concat(born);
        src.forEach(function (s) { s.flash = Math.max(0, s.flash - dt * 1.5); });
        views.forEach(function (v) { v.flash = Math.max(0, v.flash - dt * 0.9); });
        stateFlash = Math.max(0, stateFlash - dt * 1.2);
        draw(t);
        raf = requestAnimationFrame(frame);
    }
    function play() { if (!reduce && !raf) raf = requestAnimationFrame(frame); }

    if (window.ResizeObserver) new ResizeObserver(layout).observe(host);
    else window.addEventListener('resize', layout);
    layout();
    if (window.IntersectionObserver) {
        new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) play(); }).observe(host);
    }
    document.addEventListener('visibilitychange', play);
    play();
})();
