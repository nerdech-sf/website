/* nerdech — perceive-glove.js
   PERCEIVE の中心の CG。半透明のワイヤーフレームの手と、圧力計測グローブ。
   [data-glove] 要素ごとに 1 つ描く。
     data-glove="hero"    … グローブを着けた手が物を掴み、接触点が光り続ける
     data-glove="scrolly" … 段階を切り替える(0 手 / 1 グローブ / 2 圧力 / 3 データの流れ / 4 データセット)
     data-glove="domain"  … 介護・農業・電気工事で、掴む対象だけが変わる
   外から: el.glove.setStage(n) / el.glove.setDomain('care'|'agri'|'elec')
   - 素の Canvas 2D。手は骨格に沿った筒(輪と縦線)で描く
   - 圧力の値は演出用の相対値。実際のセンサー仕様を表すものではない
   - prefers-reduced-motion: 動きを止め、段階の切り替えだけ行う / 画面外・タブ非表示で停止 */
(function () {
    'use strict';

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var MINT = '143,230,216', GREY = '170,170,178', WHITE = '236,240,242';

    /* ---------------- 3D の小道具 ---------------- */
    function v(x, y, z) { return [x, y, z]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
    function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
    function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    // 軸 k まわりに回す(ロドリゲス)
    function rot(p, k, a) {
        var c = Math.cos(a), s = Math.sin(a), d = p[0] * k[0] + p[1] * k[1] + p[2] * k[2];
        var cr = cross(k, p);
        return [p[0] * c + cr[0] * s + k[0] * d * (1 - c), p[1] * c + cr[1] * s + k[1] * d * (1 - c), p[2] * c + cr[2] * s + k[2] * d * (1 - c)];
    }

    /* ---------------- 手の骨格 ---------------- */
    // 右手、手のひらがこちら(+z)を向く。指は +y。曲げると +z 側(手のひら側)へ丸まる
    var FINGERS = [
        { name: 'index',  base: v(0.30, 0.08, 0.02), segs: [0.42, 0.26, 0.20], r: 0.085, spread: -0.06 },
        { name: 'middle', base: v(0.10, 0.12, 0.03), segs: [0.46, 0.30, 0.21], r: 0.088, spread: 0.0 },
        { name: 'ring',   base: v(-0.10, 0.09, 0.02), segs: [0.43, 0.28, 0.20], r: 0.082, spread: 0.05 },
        { name: 'pinky',  base: v(-0.29, 0.02, 0.01), segs: [0.33, 0.22, 0.18], r: 0.072, spread: 0.12 }
    ];
    var THUMB = { name: 'thumb', base: v(0.40, -0.55, 0.06), segs: [0.34, 0.28, 0.24], r: 0.098 };

    // curl: 指の曲げ(0 = 伸ばす / 1.3 ≒ 握る)、thumb: 親指の曲げ
    function skeleton(curl, thumbCurl) {
        var bones = [];
        FINGERS.forEach(function (f, fi) {
            var pts = [f.base], fronts = [], dir = norm(v(f.spread, 1, 0)), front = v(0, 0, 1);
            var axis = norm(cross(dir, front)); // 曲げの軸
            var p = f.base;
            f.segs.forEach(function (L, j) {
                var a = curl * (j === 0 ? 0.9 : j === 1 ? 1.15 : 0.8);
                dir = rot(dir, axis, -a);
                front = rot(front, axis, -a);
                p = add(p, mul(dir, L));
                pts.push(p);
                fronts.push(front);
            });
            bones.push({ name: f.name, pts: pts, fronts: fronts, r: f.r });
        });
        // 親指: 手のひらを横切る方向へ
        var tdir = norm(v(0.55, 0.8, 0.35)), tfront = norm(v(-0.6, 0.2, 0.75));
        var taxis = norm(v(0.35, -0.2, 0.9));
        var tp = THUMB.base, tpts = [tp], tfr = [];
        THUMB.segs.forEach(function (L, j) {
            var a = thumbCurl * (j === 0 ? 0.55 : 0.75);
            tdir = rot(tdir, taxis, a);
            tfront = rot(tfront, taxis, a);
            tp = add(tp, mul(tdir, L));
            tpts.push(tp);
            tfr.push(tfront);
        });
        bones.push({ name: 'thumb', pts: tpts, fronts: tfr, r: THUMB.r });
        return bones;
    }

    // 骨に沿った輪(ワイヤーフレーム)
    function tubeRings(pts, r0, stations, verts) {
        var rings = [];
        var total = 0, segL = [];
        for (var i = 1; i < pts.length; i++) { var l = len(sub(pts[i], pts[i - 1])); segL.push(l); total += l; }
        for (var k = 0; k <= stations; k++) {
            var d = total * k / stations, i2 = 0;
            while (i2 < segL.length - 1 && d > segL[i2]) { d -= segL[i2]; i2++; }
            var a = pts[i2], b = pts[i2 + 1], t = clamp(d / segL[i2], 0, 1);
            var c = add(a, mul(sub(b, a), t));
            var dir = norm(sub(b, a));
            var up = Math.abs(dir[2]) > 0.9 ? v(0, 1, 0) : v(0, 0, 1);
            var e1 = norm(cross(dir, up)), e2 = norm(cross(dir, e1));
            var taper = 1 - 0.28 * (k / stations);
            if (k === stations) taper *= 0.55; // 指先を丸める
            var r = r0 * taper, ring = [];
            for (var q = 0; q < verts; q++) {
                var an = q / verts * Math.PI * 2;
                ring.push(add(c, add(mul(e1, Math.cos(an) * r), mul(e2, Math.sin(an) * r))));
            }
            rings.push(ring);
        }
        return rings;
    }
    function palmRings(stations, verts) {
        var rings = [];
        for (var k = 0; k <= stations; k++) {
            var t = k / stations;
            var y = lerp(-1.0, 0.06, t);
            var w = lerp(0.36, 0.5, smooth(t * 1.3)) * (1 - 0.1 * Math.pow(t, 6));
            var dz = lerp(0.1, 0.13, t);
            var cx = lerp(0.03, 0.0, t);
            var ring = [];
            for (var q = 0; q < verts; q++) {
                var an = q / verts * Math.PI * 2;
                ring.push(v(cx + Math.cos(an) * w, y, Math.sin(an) * dz));
            }
            rings.push(ring);
        }
        return rings;
    }

    // 圧力センサーの位置(指先・中節・手のひら)
    function pads(bones) {
        var out = [];
        bones.forEach(function (b) {
            var n = b.pts.length;
            var tip = add(b.pts[n - 2], mul(sub(b.pts[n - 1], b.pts[n - 2]), 0.62));
            out.push({ p: add(tip, mul(b.fronts[b.fronts.length - 1], b.r * 0.85)), group: b.name, part: 'tip' });
            if (b.name !== 'thumb') {
                var mid = add(b.pts[1], mul(sub(b.pts[2], b.pts[1]), 0.5));
                out.push({ p: add(mid, mul(b.fronts[1], b.r * 0.9)), group: b.name, part: 'mid' });
            }
        });
        [v(0.24, -0.1, 0.13), v(-0.02, -0.05, 0.14), v(-0.24, -0.14, 0.12), v(0.0, -0.55, 0.12), v(0.26, -0.62, 0.12)].forEach(function (p) {
            out.push({ p: p, group: 'palm', part: 'palm' });
        });
        return out;
    }

    /* ---------------- 掴む対象 ---------------- */
    var DOMAINS = {
        none: { curl: 0.25, thumb: 0.2, obj: null },
        grasp: { curl: 0.95, thumb: 0.8, obj: 'sphere', weights: { tip: 0.8, mid: 0.55, palm: 0.35 }, label: 'OBJECT', action: 'grasp / hold' },
        care: { curl: 0.7, thumb: 0.45, obj: 'arm', weights: { tip: 0.45, mid: 0.6, palm: 1.0 }, label: 'CARE', action: 'support / transfer' },
        agri: { curl: 0.9, thumb: 0.85, obj: 'fruit', weights: { tip: 0.55, mid: 0.3, palm: 0.15 }, label: 'AGRICULTURE', action: 'grasp / harvest' },
        elec: { curl: 1.22, thumb: 1.0, obj: 'tool', weights: { tip: 0.7, mid: 0.85, palm: 0.95 }, label: 'ELECTRICAL WORK', action: 'grip / fasten' }
    };

    function objectLines(kind, t) {
        var lines = [];
        function ringAt(c, axis, r, n) {
            var up = Math.abs(axis[1]) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
            var e1 = norm(cross(axis, up)), e2 = norm(cross(axis, e1)), ring = [];
            for (var q = 0; q <= n; q++) { var an = q / n * Math.PI * 2; ring.push(add(c, add(mul(e1, Math.cos(an) * r), mul(e2, Math.sin(an) * r)))); }
            return ring;
        }
        function cylinder(c0, c1, r, rings, verts) {
            var axis = norm(sub(c1, c0)), all = [];
            for (var k = 0; k <= rings; k++) {
                var c = add(c0, mul(sub(c1, c0), k / rings));
                var ring = ringAt(c, axis, r, verts);
                lines.push(ring); all.push(ring);
            }
            for (var q = 0; q < verts; q += 2) lines.push(all.map(function (ring) { return ring[q]; }));
        }
        if (kind === 'sphere' || kind === 'fruit') {
            var c = kind === 'fruit' ? v(0.1, 0.3, 0.34) : v(0.1, 0.3, 0.32), r = kind === 'fruit' ? 0.27 : 0.26;
            for (var i = 1; i < 8; i++) {
                var la = -Math.PI / 2 + i * Math.PI / 8, rr = Math.cos(la) * r, yy = Math.sin(la) * r;
                lines.push(ringAt(add(c, v(0, yy, 0)), v(0, 1, 0), rr, 24));
            }
            for (var m = 0; m < 6; m++) {
                var mer = [];
                for (var j = 0; j <= 16; j++) {
                    var a2 = -Math.PI / 2 + j * Math.PI / 16, b2 = m * Math.PI / 6;
                    mer.push(add(c, v(Math.cos(a2) * Math.cos(b2) * r, Math.sin(a2) * r, Math.cos(a2) * Math.sin(b2) * r)));
                }
                lines.push(mer);
            }
            if (kind === 'fruit') { // へた
                lines.push([add(c, v(0, r, 0)), add(c, v(0.03, r + 0.12, 0.02))]);
                lines.push([add(c, v(-0.1, r - 0.02, 0)), add(c, v(0, r + 0.02, 0)), add(c, v(0.1, r - 0.02, 0.03))]);
            }
        } else if (kind === 'arm') { // 支えている相手の前腕
            cylinder(v(-1.3, 0.34, 0.36), v(1.2, 0.3, 0.36), 0.24, 9, 16);
        } else if (kind === 'tool') { // ドライバー: 握り + 軸
            cylinder(v(-0.42, 0.34, 0.34), v(0.5, 0.34, 0.34), 0.15, 7, 12);
            cylinder(v(0.5, 0.34, 0.34), v(1.25, 0.34, 0.34), 0.035, 3, 6);
            lines.push([v(1.25, 0.34, 0.34), v(1.33, 0.34, 0.34)]);
        }
        return lines;
    }

    /* ---------------- 1 つの描画面 ---------------- */
    function Glove(host) {
        var mode = host.getAttribute('data-glove') || 'hero';
        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;

        var W = 1, H = 1, dpr = 1, narrow = false;
        var stage = mode === 'scrolly' ? 0 : 2, stageT = stage, stageTarget = stage;
        var domain = mode === 'domain' ? 'care' : 'grasp', domainT = 1, prevDomain = domain;
        var cur = { curl: 0.25, thumb: 0.2 };
        var ripples = [], parts = [], hist = [], HIST = 150;
        var CH = ['thumb', 'index', 'middle', 'palm'];
        CH.forEach(function () { hist.push([]); });

        function layout() {
            W = host.clientWidth; H = host.clientHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            narrow = W < 560;
            if (reduce) frame(performance.now(), true);
        }

        // 画面への投影
        var cam = { yaw: 0, pitch: 0, cx: 0, cy: 0, s: 1 };
        function P(p) {
            var q = rot(p, [0, 1, 0], cam.yaw);
            q = rot(q, [1, 0, 0], cam.pitch);
            var f = 3.4 / (3.4 - q[2]);
            return [cam.cx + q[0] * f * cam.s, cam.cy - q[1] * f * cam.s, q[2]];
        }
        function poly(pts, close) {
            ctx.beginPath();
            pts.forEach(function (p, i) { var q = P(p); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
            if (close) ctx.closePath();
            ctx.stroke();
        }

        // 接触(掴んでいる度合い 0〜1)と、センサーごとの相対圧力
        function grip(t) {
            if (reduce) return 1;
            var T = 5.2, x = (t % T) / T;
            if (x < 0.18) return smooth(x / 0.18);
            if (x < 0.72) return 1;
            if (x < 0.9) return 1 - smooth((x - 0.72) / 0.18);
            return 0;
        }
        function pressureOf(pad, g, t, dom) {
            var w = (dom.weights || { tip: 0.6, mid: 0.4, palm: 0.3 })[pad.part];
            var wob = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 5 + pad.p[0] * 9 + pad.p[1] * 7);
            return clamp(w * g * wob, 0, 1);
        }

        var t0 = null, last = 0, raf = 0, visible = true;

        function frame(ms, once) {
            raf = 0;
            if (!once && (!visible || document.hidden)) return;
            if (t0 === null) t0 = ms;
            var t = (ms - t0) / 1000, dt = Math.min(0.05, t - last); last = t;
            if (reduce) { t = 1.7; dt = 0; }

            stageT += (stageTarget - stageT) * (reduce ? 1 : Math.min(1, dt * 3.2));
            domainT = Math.min(1, domainT + (reduce ? 1 : dt * 1.6));
            var s = stageT;
            var gloveOn = smooth(s);           // 1 以上でグローブ
            var pressOn = smooth(s - 1);           // 2 以上で圧力
            var streamOn = smooth(s - 2);          // 3 以上でデータの流れ
            var dataOn = smooth(s - 3);            // 4 でデータセット

            var domKey = mode === 'scrolly' ? (s > 1.5 ? 'grasp' : 'none') : domain;
            var dom = DOMAINS[domKey];
            var g = pressOn > 0.01 || mode !== 'scrolly' ? grip(t) : 0;
            var tc = lerp(0.25, dom.curl, g), tt = lerp(0.2, dom.thumb, g);
            cur.curl += (tc - cur.curl) * (reduce ? 1 : Math.min(1, dt * 6));
            cur.thumb += (tt - cur.thumb) * (reduce ? 1 : Math.min(1, dt * 6));

            // カメラ: データを見せる段階では手を左へ寄せる
            var shift = mode === 'scrolly' ? Math.max(streamOn, dataOn) : 0;
            var handArea = narrow ? 1 : lerp(1, 0.5, shift);
            cam.s = Math.min(W * handArea * 0.4, H * 0.37) * (narrow && shift > 0.5 ? 0.78 : 1);
            cam.cx = narrow ? W / 2 - (shift * W * 0.22) : W * handArea / 2 + (mode === 'domain' ? -W * 0.02 : 0);
            cam.cy = H * 0.5 + cam.s * 0.1;
            cam.yaw = reduce ? -0.35 : -0.35 + Math.sin(t * 0.3) * 0.22;
            cam.pitch = 0.28;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);

            var bones = skeleton(cur.curl, cur.thumb);
            var pd = pads(bones);

            // 対象物(奥)
            if (dom.obj) {
                var oa = (mode === 'scrolly' ? pressOn : domainT) * 0.55;
                ctx.strokeStyle = 'rgba(' + WHITE + ',' + (oa * 0.5).toFixed(3) + ')';
                ctx.lineWidth = 0.8;
                objectLines(dom.obj, t).forEach(function (l) { poly(l, false); });
            }

            // 手 / グローブ
            var col = gloveOn > 0.5 ? MINT : GREY;
            var baseA = lerp(0.3, 0.42, gloveOn);
            ctx.lineWidth = lerp(0.7, 0.9, gloveOn);
            var stations = gloveOn > 0.5 ? 9 : 6, verts = gloveOn > 0.5 ? 10 : 8;
            var tubes = bones.map(function (b) { return tubeRings(b.pts, b.r * lerp(1, 1.1, gloveOn), stations, verts); });
            tubes.push(palmRings(gloveOn > 0.5 ? 9 : 6, gloveOn > 0.5 ? 20 : 14));
            tubes.forEach(function (rings) {
                rings.forEach(function (ring, k) {
                    var z = P(ring[0])[2];
                    ctx.strokeStyle = 'rgba(' + col + ',' + (baseA * (0.55 + 0.45 * clamp((z + 1) / 1.6, 0, 1))).toFixed(3) + ')';
                    poly(ring, true);
                });
                ctx.strokeStyle = 'rgba(' + col + ',' + (baseA * 0.75).toFixed(3) + ')';
                for (var q = 0; q < rings[0].length; q += (gloveOn > 0.5 ? 1 : 2)) poly(rings.map(function (r) { return r[q]; }), false);
            });
            if (gloveOn > 0.02) {
                // 手首のカフ
                ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.55 * gloveOn).toFixed(3) + ')';
                ctx.lineWidth = 1.4;
                var cuff = palmRings(1, 22)[0].map(function (p) { return add(mul(p, 1.12), v(0, 0.02, 0)); });
                poly(cuff, true);
                poly(cuff.map(function (p) { return add(p, v(0, 0.08, 0)); }), true);
            }

            // センサーと圧力
            var peak = 0, sums = { thumb: 0, index: 0, middle: 0, palm: 0 }, counts = { thumb: 0, index: 0, middle: 0, palm: 0 };
            if (gloveOn > 0.05) {
                pd.forEach(function (pad) {
                    var q = P(pad.p);
                    var pr = pressureOf(pad, g, t, dom) * pressOn;
                    if (sums[pad.group] !== undefined) { sums[pad.group] += pr; counts[pad.group]++; }
                    peak = Math.max(peak, pr);
                    var face = clamp((q[2] + 0.4) / 1.0, 0.25, 1);
                    // 等高線のような同心円
                    if (pr > 0.05) {
                        for (var c = 1; c <= 3; c++) {
                            ctx.strokeStyle = 'rgba(' + MINT + ',' + (pr * 0.35 * face / c).toFixed(3) + ')';
                            ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.arc(q[0], q[1], 4 + c * 5 * (0.5 + pr), 0, 6.2832); ctx.stroke();
                        }
                        var gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 16 + pr * 16);
                        gr.addColorStop(0, 'rgba(' + MINT + ',' + (0.55 * pr * face).toFixed(3) + ')');
                        gr.addColorStop(1, 'rgba(' + MINT + ',0)');
                        ctx.fillStyle = gr;
                        ctx.beginPath(); ctx.arc(q[0], q[1], 16 + pr * 16, 0, 6.2832); ctx.fill();
                        if (!reduce && Math.random() < pr * 0.05) ripples.push({ x: q[0], y: q[1], r: 4, a: 0.5 * pr });
                        if (!reduce && streamOn > 0.3 && Math.random() < pr * 0.12) parts.push({ x: q[0], y: q[1], ch: CH.indexOf(pad.group === 'ring' || pad.group === 'pinky' ? 'middle' : pad.group), u: 0 });
                    }
                    // センサー本体(小さな四角)
                    ctx.fillStyle = 'rgba(' + (pr > 0.1 ? MINT : GREY) + ',' + (gloveOn * (0.5 + pr * 0.5) * face).toFixed(3) + ')';
                    var sz = 2.2 + pr * 1.8;
                    ctx.fillRect(q[0] - sz, q[1] - sz, sz * 2, sz * 2);
                });
            }
            // 波紋
            ripples = ripples.filter(function (r) {
                r.r += dt * 40; r.a -= dt * 0.6;
                if (r.a <= 0) return false;
                ctx.strokeStyle = 'rgba(' + MINT + ',' + r.a.toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.2832); ctx.stroke();
                return true;
            });

            // 時系列を記録
            CH.forEach(function (c, i) {
                var val = counts[c] ? sums[c] / counts[c] : 0;
                hist[i].push(val);
                if (hist[i].length > HIST) hist[i].shift();
            });

            // 右: データの流れ / データセット
            if (mode === 'scrolly' && (streamOn > 0.02 || dataOn > 0.02)) drawData(t, dt, streamOn, dataOn, g, dom);

            // 読み取り表示
            if (mode !== 'scrolly' || pressOn > 0.3) {
                ctx.font = '10px "DM Mono", ui-monospace, monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                var lx = 4, ly = 4;
                var blink = reduce ? 1 : (Math.sin(t * 4) > -0.3 ? 1 : 0.35);
                ctx.fillStyle = 'rgba(' + MINT + ',' + blink + ')';
                ctx.beginPath(); ctx.arc(lx + 3, ly + 5, 3, 0, 6.2832); ctx.fill();
                ctx.fillStyle = 'rgba(' + MINT + ',0.85)';
                ctx.fillText('PRESSURE SENSING GLOVE', lx + 12, ly);
                ctx.fillStyle = 'rgba(' + WHITE + ',0.55)';
                if (mode === 'domain') ctx.fillText('DOMAIN  ' + dom.label, lx + 12, ly + 16);
                ctx.fillText('ACTION  ' + (g > 0.5 ? dom.action || 'grasp' : 'reach / release'), lx + 12, ly + (mode === 'domain' ? 32 : 16));
                ctx.fillText('PEAK    ' + peak.toFixed(2) + ' rel.', lx + 12, ly + (mode === 'domain' ? 48 : 32));
            }

            if (!once && !reduce) raf = requestAnimationFrame(frame);
        }

        function drawData(t, dt, streamOn, dataOn, g, dom) {
            var x0 = narrow ? W * 0.52 : W * 0.54, x1 = W - 4;
            var y0 = narrow ? H * 0.2 : H * 0.12, y1 = narrow ? H * 0.95 : H * 0.9;
            ctx.font = '10px "DM Mono", ui-monospace, monospace';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            if (dataOn < 0.99) {
                // 圧力の時系列
                var rows = CH.length, rh = (y1 - y0) / rows, a = streamOn * (1 - dataOn);
                CH.forEach(function (c, i) {
                    var top = y0 + i * rh + 14, bot = y0 + (i + 1) * rh - 6;
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.55 * a).toFixed(3) + ')';
                    ctx.fillText('pressure.' + c, x0, y0 + i * rh + 4);
                    ctx.strokeStyle = 'rgba(' + GREY + ',' + (0.18 * a).toFixed(3) + ')';
                    ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x1, bot); ctx.stroke();
                    ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.9 * a).toFixed(3) + ')';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    hist[i].forEach(function (val, k) {
                        var x = x0 + (k / (HIST - 1)) * (x1 - x0), y = bot - val * (bot - top);
                        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                });
                // 手から流れる粒
                parts = parts.filter(function (p) {
                    p.u += dt * 1.4;
                    if (p.u >= 1 || p.ch < 0) return false;
                    var tx = x0, ty = y0 + (p.ch + 0.6) * rh;
                    var x = lerp(p.x, tx, smooth(p.u)), y = lerp(p.y, ty, smooth(p.u));
                    ctx.fillStyle = 'rgba(' + MINT + ',' + (0.8 * (1 - p.u) * a).toFixed(3) + ')';
                    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.2832); ctx.fill();
                    return true;
                });
            }

            if (dataOn > 0.01) {
                // 同期して記録されるデータセット
                var labels = ['VIDEO', 'TIME', 'ACTION', 'PRESSURE', 'CONTEXT'];
                var rh2 = (y1 - y0) / labels.length, lw = narrow ? 58 : 70, gx = x0 + lw, gw = x1 - gx;
                var A = dataOn;
                var play = reduce ? 0.62 : (t * 0.12) % 1;
                labels.forEach(function (lab, i) {
                    var ry = y0 + i * rh2, mid = ry + rh2 / 2;
                    ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.6 * A).toFixed(3) + ')';
                    ctx.fillText(lab, x0, mid);
                    ctx.strokeStyle = 'rgba(' + GREY + ',' + (0.14 * A).toFixed(3) + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(gx, ry + rh2 - 3); ctx.lineTo(x1, ry + rh2 - 3); ctx.stroke();
                    if (lab === 'VIDEO') {
                        var fw = Math.max(18, gw / 7);
                        for (var f = 0; f < 7; f++) {
                            var fx = gx + f * fw;
                            if (fx + fw - 3 > x1) break;
                            ctx.strokeStyle = 'rgba(' + WHITE + ',' + (0.3 * A).toFixed(3) + ')';
                            ctx.strokeRect(fx, ry + 5, fw - 3, rh2 - 12);
                            // 小さな手の輪郭
                            ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.45 * A).toFixed(3) + ')';
                            var hx = fx + (fw - 3) / 2, hy = ry + rh2 / 2, cu = Math.sin(f * 0.9) * 0.5 + 0.5;
                            ctx.beginPath(); ctx.moveTo(hx, hy + 6); ctx.lineTo(hx, hy - 2);
                            ctx.lineTo(hx + 3 * (1 - cu), hy - 6 + cu * 3); ctx.stroke();
                        }
                    } else if (lab === 'TIME') {
                        ctx.strokeStyle = 'rgba(' + WHITE + ',' + (0.3 * A).toFixed(3) + ')';
                        for (var k2 = 0; k2 <= 20; k2++) {
                            var tx2 = gx + gw * k2 / 20;
                            ctx.beginPath(); ctx.moveTo(tx2, mid + (k2 % 5 ? 2 : -4)); ctx.lineTo(tx2, mid + 6); ctx.stroke();
                        }
                        ctx.fillStyle = 'rgba(' + MINT + ',' + (0.85 * A).toFixed(3) + ')';
                        var sec = play * 5.2;
                        ctx.fillText('00:0' + sec.toFixed(2), gx + 2, ry + 9);
                    } else if (lab === 'ACTION') {
                        var segs = [['reach', 0, 0.16], ['grasp', 0.16, 0.34], ['hold', 0.34, 0.72], ['release', 0.72, 1]];
                        segs.forEach(function (sg) {
                            var sx = gx + gw * sg[1], sw = gw * (sg[2] - sg[1]) - 3;
                            var on = play >= sg[1] && play < sg[2];
                            ctx.fillStyle = 'rgba(' + MINT + ',' + ((on ? 0.28 : 0.08) * A).toFixed(3) + ')';
                            ctx.fillRect(sx, ry + 7, sw, rh2 - 14);
                            ctx.fillStyle = 'rgba(' + WHITE + ',' + ((on ? 0.9 : 0.45) * A).toFixed(3) + ')';
                            if (sw > 26) ctx.fillText(sg[0], sx + 4, mid);
                        });
                    } else if (lab === 'PRESSURE') {
                        ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.9 * A).toFixed(3) + ')';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        for (var k3 = 0; k3 <= 80; k3++) {
                            var u = k3 / 80, gg;
                            if (u < 0.16) gg = 0; else if (u < 0.34) gg = smooth((u - 0.16) / 0.18); else if (u < 0.72) gg = 1; else gg = 1 - smooth((u - 0.72) / 0.18);
                            var yy = ry + rh2 - 6 - gg * (rh2 - 14) * (0.85 + 0.1 * Math.sin(u * 40));
                            if (k3 === 0) ctx.moveTo(gx + gw * u, yy); else ctx.lineTo(gx + gw * u, yy);
                        }
                        ctx.stroke();
                    } else if (lab === 'CONTEXT') {
                        var chips = narrow ? ['object', 'task'] : ['object: sample', 'task: grasp', 'domain: —'];
                        var cx2 = gx;
                        chips.forEach(function (ch) {
                            var w = ctx.measureText(ch).width + 12;
                            ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.4 * A).toFixed(3) + ')';
                            ctx.strokeRect(cx2, mid - 8, w, 16);
                            ctx.fillStyle = 'rgba(' + WHITE + ',' + (0.7 * A).toFixed(3) + ')';
                            ctx.fillText(ch, cx2 + 6, mid);
                            cx2 += w + 6;
                        });
                    }
                });
                // 再生位置(全行で同期)
                var px = gx + gw * play;
                ctx.strokeStyle = 'rgba(' + MINT + ',' + (0.9 * A).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
                ctx.fillStyle = 'rgba(' + MINT + ',' + A.toFixed(3) + ')';
                ctx.beginPath(); ctx.moveTo(px - 4, y0 - 6); ctx.lineTo(px + 4, y0 - 6); ctx.lineTo(px, y0); ctx.fill();
            }
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

        return {
            setStage: function (n) { stageTarget = n; if (reduce) frame(performance.now(), true); },
            setDomain: function (d) { if (DOMAINS[d] && d !== domain) { prevDomain = domain; domain = d; domainT = 0; } if (reduce) frame(performance.now(), true); }
        };
    }

    [].slice.call(document.querySelectorAll('[data-glove]')).forEach(function (el) { el.glove = Glove(el); });

    /* ---------------- スクロールで段階を進める ---------------- */
    [].slice.call(document.querySelectorAll('.scrolly')).forEach(function (sec) {
        var vis = sec.querySelector('[data-glove="scrolly"]');
        var steps = [].slice.call(sec.querySelectorAll('.scrolly__step'));
        var dots = [].slice.call(sec.querySelectorAll('.scrolly__dots li'));
        if (!vis || !vis.glove) return;
        function activate(i) {
            steps.forEach(function (s, j) { s.classList.toggle('is-active', j === i); });
            dots.forEach(function (d, j) { d.classList.toggle('is-active', j === i); });
            vis.glove.setStage(i);
        }
        function check() {
            var line = window.innerHeight * (window.innerWidth < 900 ? 0.72 : 0.55), cur = 0;
            steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < line) cur = i; });
            activate(cur);
        }
        window.addEventListener('scroll', check, { passive: true });
        window.addEventListener('resize', check);
        check();
    });

    /* ---------------- 3 つの現場の切り替え ---------------- */
    [].slice.call(document.querySelectorAll('.domains')).forEach(function (box) {
        var vis = box.querySelector('[data-glove="domain"]');
        var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
        var panels = [].slice.call(box.querySelectorAll('[role="tabpanel"]'));
        function select(i, focus) {
            tabs.forEach(function (t, j) {
                var on = j === i;
                t.setAttribute('aria-selected', on ? 'true' : 'false');
                t.tabIndex = on ? 0 : -1;
                panels[j].hidden = !on;
            });
            if (focus) tabs[i].focus();
            if (vis && vis.glove) vis.glove.setDomain(tabs[i].getAttribute('data-domain'));
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
})();
