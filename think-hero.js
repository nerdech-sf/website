/* nerdech — think-hero.js
   THINK(Company Brain)のファーストビュー。
   上: Company Brain / 左下: DIGITAL WORLD(Software Agent が操作するメール・Slack・CRM…)
   右下: PHYSICAL WORLD(Physical AI が動かすロボット・センサー・デバイス)
   下から状態が上がり(灰)、Company Brain から指示が下りる(紫)。指示を受けたものが動く。
   - prefers-reduced-motion: 静止画 / 画面外・タブ非表示で停止 */
(function () {
    'use strict';

    var host = document.querySelector('[data-visual="think"]');
    if (!host) return;
    var note = document.querySelector('.note');
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cs = getComputedStyle(note);
    var BRAIN = (cs.getPropertyValue('--brain-rgb') || '168,130,255').replace(/\s/g, '');
    var BLUE = '150,176,255', MINT = '143,230,216', GREY = '160,160,168', WHITE = '232,236,244';

    var DIGITAL = ['メール', 'Slack', 'ブラウザ', 'CRM', 'ERP', '業務システム', 'ドキュメント'];
    var PHYSICAL = [['ロボット', 'arm'], ['センサー', 'sensor'], ['デバイス', 'device'], ['Physical AI', 'arm']];

    var W = 1, H = 1, dpr = 1, narrow = false, brain = {}, dig = [], phy = [];
    var seed = 11;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

    function layout() {
        W = host.clientWidth; H = host.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        narrow = W < 560;
        brain = { x: W / 2, y: H * 0.2, r: narrow ? 22 : 30 };
        // 左下: 2 列 × 4 行
        dig = DIGITAL.map(function (label, i) {
            if (narrow) return { label: label, x: W * 0.05, y: H * (0.52 + i * 0.066), flash: 0 };
            var col = i % 2, row = Math.floor(i / 2);
            return { label: label, x: W * (0.06 + col * 0.2), y: H * (0.52 + row * 0.11), flash: 0 };
        });
        phy = PHYSICAL.map(function (p, i) {
            var col = i % 2, row = Math.floor(i / 2);
            return { label: p[0], kind: p[1], x: W * (0.64 + col * 0.2), y: H * (0.55 + row * 0.18), flash: 0, ph: i };
        });
        if (reduce) draw(2);
    }

    function link(a, b, style) {
        ctx.strokeStyle = style;
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        var my = (a.y + b.y) / 2;
        ctx.bezierCurveTo(a.x, my, b.x, my, b.x, b.y);
        ctx.stroke();
    }
    function bez(a, b, u) {
        var my = (a.y + b.y) / 2, it = 1 - u;
        return { x: it * it * it * a.x + 3 * it * it * u * a.x + 3 * it * u * u * b.x + u * u * u * b.x,
                 y: it * it * it * a.y + 3 * it * it * u * my + 3 * it * u * u * my + u * u * u * b.y };
    }
    function bIn() { return { x: brain.x, y: brain.y + brain.r }; }
    function top(n) { return { x: n.x + (n.kind ? 0 : 11), y: n.y - (n.kind ? 16 : 9) }; }

    var pulses = [];

    function draw(t) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // 2 つの世界の枠
        ctx.font = '10px "DM Mono", ui-monospace, monospace';
        ctx.textBaseline = 'alphabetic';
        [[0.02, 0.44, 0.44, BLUE, 'DIGITAL WORLD · SOFTWARE AGENT'], [0.54, 0.44, 0.44, MINT, 'PHYSICAL WORLD · PHYSICAL AI']].forEach(function (b) {
            var x = W * b[0], y = H * b[1], w = W * b[2], h = H * 0.54;
            ctx.strokeStyle = 'rgba(' + b[3] + ',0.22)';
            ctx.setLineDash([3, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(' + b[3] + ',0.8)';
            ctx.textAlign = 'left';
            ctx.fillText(narrow ? b[4].split(' · ')[0] : b[4], x + 6, y - 6);
        });

        ctx.lineWidth = 0.8;
        dig.concat(phy).forEach(function (n) { link(bIn(), top(n), 'rgba(' + BRAIN + ',0.2)'); });

        // DIGITAL: 窓のアイコン
        ctx.font = (narrow ? '10px ' : '11px ') + '"Noto Sans JP", sans-serif';
        ctx.textBaseline = 'middle';
        dig.forEach(function (n) {
            var a = 0.45 + n.flash * 0.55;
            ctx.strokeStyle = 'rgba(' + BLUE + ',' + a.toFixed(2) + ')';
            ctx.lineWidth = 1;
            ctx.strokeRect(n.x, n.y - 8, 22, 16);
            ctx.beginPath(); ctx.moveTo(n.x, n.y - 4); ctx.lineTo(n.x + 22, n.y - 4); ctx.stroke();
            if (n.flash > 0.05) { // エージェントが操作中
                ctx.fillStyle = 'rgba(' + BLUE + ',' + (n.flash * 0.4).toFixed(2) + ')';
                ctx.fillRect(n.x, n.y - 4, 22 * (1 - n.flash), 12);
                ctx.fillStyle = 'rgba(' + WHITE + ',' + n.flash.toFixed(2) + ')';
                ctx.beginPath(); ctx.moveTo(n.x + 16, n.y); ctx.lineTo(n.x + 16, n.y + 8); ctx.lineTo(n.x + 19, n.y + 6); ctx.closePath(); ctx.fill();
            }
            ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.5 + n.flash * 0.45).toFixed(2) + ')';
            ctx.textAlign = 'left';
            ctx.fillText(n.label, n.x + 28, n.y);
        });

        // PHYSICAL: ロボットの腕・センサー・デバイス
        phy.forEach(function (n) {
            var a = 0.45 + n.flash * 0.55, x = n.x, y = n.y;
            ctx.strokeStyle = 'rgba(' + MINT + ',' + a.toFixed(2) + ')';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.lineWidth = 1.3;
            if (n.kind === 'arm') {
                var ang = -1.0 + (reduce ? 0 : Math.sin(t * 1.2 + n.ph) * 0.2) - n.flash * 0.6;
                var ex = x - 4 + Math.cos(ang) * 14, ey = y + 8 + Math.sin(ang) * 14;
                var hx = ex + Math.cos(ang + 1.2) * 11, hy = ey + Math.sin(ang + 1.2) * 11;
                ctx.beginPath(); ctx.moveTo(x - 12, y + 10); ctx.lineTo(x + 4, y + 10); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - 4, y + 9); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
                ctx.beginPath(); ctx.arc(ex, ey, 2, 0, 6.2832); ctx.fill();
            } else if (n.kind === 'sensor') {
                ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.2832); ctx.fill();
                for (var k = 1; k <= 2; k++) {
                    ctx.globalAlpha = 0.5 + n.flash * 0.5;
                    ctx.beginPath(); ctx.arc(x, y, 4 + k * 5 + n.flash * 3, -0.9, 0.9); ctx.stroke();
                    ctx.beginPath(); ctx.arc(x, y, 4 + k * 5 + n.flash * 3, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
                }
                ctx.globalAlpha = 1;
            } else {
                ctx.strokeRect(x - 10, y - 7, 20, 14);
                ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.2832); ctx.fill();
            }
            ctx.font = (narrow ? '10px ' : '11px ') + '"Noto Sans JP", sans-serif';
            ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.5 + n.flash * 0.45).toFixed(2) + ')';
            ctx.textAlign = 'center';
            ctx.fillText(n.label, x, y + 28);
        });

        // Company Brain
        var g = ctx.createRadialGradient(brain.x, brain.y, 0, brain.x, brain.y, brain.r * 2.4);
        g.addColorStop(0, 'rgba(' + BRAIN + ',0.32)');
        g.addColorStop(1, 'rgba(' + BRAIN + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(brain.x, brain.y, brain.r * 2.4, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(' + BRAIN + ',0.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(brain.x, brain.y, brain.r, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + BRAIN + ',0.25)';
        ctx.beginPath(); ctx.arc(brain.x, brain.y, brain.r * 0.6, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgb(' + BRAIN + ')';
        ctx.beginPath(); ctx.arc(brain.x, brain.y, 5, 0, 6.2832); ctx.fill();
        ctx.font = '10px "DM Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(' + BRAIN + ',0.95)';
        ctx.fillText('COMPANY BRAIN', brain.x + brain.r + 10, brain.y);

        pulses.forEach(function (p) {
            var q = bez(p.a, p.b, p.u);
            ctx.fillStyle = 'rgba(' + (p.down ? BRAIN : GREY) + ',0.28)';
            ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(242,238,255,0.95)';
            ctx.beginPath(); ctx.arc(q.x, q.y, 1.4, 0, 6.2832); ctx.fill();
        });
    }

    var t0 = null, last = 0, raf = 0, visible = true, acc = 0;
    function frame(ms) {
        raf = 0;
        if (!visible || document.hidden) return;
        if (t0 === null) t0 = ms;
        var t = (ms - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
        acc += dt;
        if (acc > 0.4 && pulses.length < 12) {
            acc = 0;
            var all = dig.concat(phy), n = all[Math.floor(rand() * all.length)];
            pulses.push({ a: top(n), b: bIn(), u: 0, down: false, speed: 0.8 + rand() * 0.3 });
        }
        var born = [];
        pulses = pulses.filter(function (p) {
            p.u += dt * p.speed;
            if (p.u < 1) return true;
            if (!p.down) {
                var all2 = dig.concat(phy), m = all2[Math.floor(rand() * all2.length)];
                born.push({ a: bIn(), b: top(m), n: m, u: 0, down: true, speed: 0.9 + rand() * 0.3 });
            } else p.n.flash = 1;
            return false;
        }).concat(born);
        dig.concat(phy).forEach(function (n) { n.flash = Math.max(0, n.flash - dt * 0.9); });
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
