/* nerdech — ambient.js
   サイト全体の音と、事業ページの背景の光。
   - 左下の SOUND ボタンで、生成音楽(その場で合成するアンビエント)を流す。既定はオフ
     ・ブラウザの制限で、音は「ユーザーが操作した後」にしか鳴らせない。
       一度オンにすると次のページでも覚えていて、画面のどこかに触れた時点で再開する
     ・点やタブに触れると、小さな鐘の音が重なる
     ・音声ファイルは使わず、Web Audio で和音と音を合成している(外部の音源・著作物は使っていない)
   - .note のページでは、背景にごく薄いネットワークを流し、音の大きさに合わせて少し明るくする
   - prefers-reduced-motion: 背景は動かさない(音は選べる) */
(function () {
    'use strict';

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var KEY = 'nerdech-sound';
    function pref() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
    function setPref(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} }

    /* ================= 音 ================= */
    var AC = window.AudioContext || window.webkitAudioContext;
    var audio = null; // { ctx, master, analyser, ... }

    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    function build() {
        var ctx = new AC();
        var master = ctx.createGain(); master.gain.value = 0;
        var analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        var comp = ctx.createDynamicsCompressor();
        master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

        // 残響(ノイズから作った響き)
        var conv = ctx.createConvolver();
        var len = Math.floor(ctx.sampleRate * 3.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (var c = 0; c < 2; c++) {
            var d = ir.getChannelData(c);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
        conv.buffer = ir;
        var wet = ctx.createGain(); wet.gain.value = 0.55;
        conv.connect(wet); wet.connect(master);

        // 鐘のためのこだま
        var delay = ctx.createDelay(2); delay.delayTime.value = 0.42;
        var fb = ctx.createGain(); fb.gain.value = 0.32;
        var dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
        delay.connect(dlp); dlp.connect(fb); fb.connect(delay);
        dlp.connect(conv); dlp.connect(master);

        return { ctx: ctx, master: master, analyser: analyser, conv: conv, delay: delay, buf: new Uint8Array(analyser.fftSize), timer: 0, next: 0, bar: 0, beat: 0 };
    }

    // 和音(Am9 → Fmaj7 → Cmaj7 → G6)。低音は別に鳴らす
    var CHORDS = [
        { bass: 45, pad: [52, 55, 59, 60] },
        { bass: 41, pad: [48, 52, 57, 60] },
        { bass: 48, pad: [55, 59, 64, 67] },
        { bass: 43, pad: [50, 55, 59, 64] }
    ];
    var BELLS = [69, 72, 74, 76, 79, 81, 84];
    var BAR = 8; // 秒

    function pad(a, midi, t, dur, level) {
        var ctx = a.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.4;
        f.frequency.setValueAtTime(600, t);
        f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
        f.frequency.linearRampToValueAtTime(700, t + dur + 3);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 3);
        g.gain.setValueAtTime(level, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 4);
        [-7, 6].forEach(function (cents, k) {
            var o = ctx.createOscillator();
            o.type = k ? 'sine' : 'triangle';
            o.frequency.value = mtof(midi); o.detune.value = cents;
            o.connect(f); o.start(t); o.stop(t + dur + 4.2);
        });
        f.connect(g); g.connect(a.master); g.connect(a.conv);
    }
    function bell(a, midi, t, level) {
        var ctx = a.ctx, g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
        var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi) * 2.01;
        var g2 = ctx.createGain(); g2.gain.value = 0.18;
        o.connect(g); o2.connect(g2); g2.connect(g);
        g.connect(a.master); g.connect(a.delay); g.connect(a.conv);
        o.start(t); o2.start(t); o.stop(t + 3); o2.stop(t + 3);
    }
    function sub(a, midi, t, dur) {
        var ctx = a.ctx, g = ctx.createGain(), o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = mtof(midi - 12);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 2);
        g.gain.setValueAtTime(0.09, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 2);
        o.connect(g); g.connect(a.master); o.start(t); o.stop(t + dur + 2.2);
    }

    // 少し先までの音を予約していく
    function schedule() {
        var a = audio, now = a.ctx.currentTime;
        while (a.next < now + 0.3) {
            var t = a.next, beatLen = BAR / 8;
            if (a.beat % 8 === 0) {
                var ch = CHORDS[a.bar % CHORDS.length];
                ch.pad.forEach(function (m, k) { pad(a, m, t + k * 0.18, BAR - 1, 0.045); });
                sub(a, ch.bass, t, BAR - 1.5);
                a.bar++;
            }
            if (Math.random() < 0.34) bell(a, BELLS[Math.floor(Math.random() * BELLS.length)], t + Math.random() * 0.08, 0.05);
            a.beat++;
            a.next += beatLen;
        }
    }

    function start() {
        if (!AC) return false;
        if (!audio) {
            audio = build();
            audio.next = audio.ctx.currentTime + 0.1;
        }
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        clearInterval(audio.timer);
        audio.timer = setInterval(schedule, 100);
        schedule();
        var g = audio.master.gain, now = audio.ctx.currentTime;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.32, now + 2.5);
        return true;
    }
    function stop() {
        if (!audio) return;
        var g = audio.master.gain, now = audio.ctx.currentTime;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 1.2);
        clearInterval(audio.timer);
        var a = audio;
        setTimeout(function () { if (!on) a.ctx.suspend(); }, 1400);
    }
    function level() {
        if (!audio || !on) return 0;
        audio.analyser.getByteTimeDomainData(audio.buf);
        var s = 0;
        for (var i = 0; i < audio.buf.length; i++) { var v = (audio.buf[i] - 128) / 128; s += v * v; }
        return Math.min(1, Math.sqrt(s / audio.buf.length) * 6);
    }

    /* ================= ボタン ================= */
    var on = false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sound-toggle';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<span class="sound-toggle__bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="sound-toggle__label">SOUND OFF</span>';
    document.body.appendChild(btn);
    var label = btn.querySelector('.sound-toggle__label');

    function render(waiting) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-on', on);
        btn.classList.toggle('is-waiting', !!waiting);
        label.textContent = on ? 'SOUND ON' : waiting ? 'TAP TO RESUME' : 'SOUND OFF';
        btn.setAttribute('aria-label', on ? '音楽を止める' : '音楽を流す');
    }
    btn.addEventListener('click', function () {
        on = !on;
        setPref(on);
        if (on) { if (!start()) on = false; } else stop();
        render(false);
    });

    // 前のページでオンにしていたら、最初の操作で再開する
    if (pref()) {
        render(true);
        var resume = function (e) {
            if (e.target && e.target.closest && e.target.closest('.sound-toggle')) return cleanup();
            on = start(); render(false); cleanup();
        };
        var cleanup = function () {
            ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.removeEventListener(ev, resume, true); });
        };
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, resume, true); });
    } else render(false);

    document.addEventListener('visibilitychange', function () {
        if (!audio) return;
        if (document.hidden) audio.ctx.suspend();
        else if (on) audio.ctx.resume();
    });

    // 点・タブ・カードに触れたときの小さな音
    var lastPing = 0;
    function ping() {
        if (!on || !audio) return;
        var now = audio.ctx.currentTime;
        if (now - lastPing < 0.12) return;
        lastPing = now;
        bell(audio, BELLS[Math.floor(Math.random() * BELLS.length)] + 12, now + 0.01, 0.035);
    }
    document.addEventListener('pointerover', function (e) {
        var el = e.target.closest && e.target.closest('.gnode, .hub, .worlds a, .backlinks__list a, [role="tab"], .note-cta, .qa__q button, .stepper__arrow');
        if (el && !el.contains(e.relatedTarget)) ping();
    });

    window.nerdechSound = { level: level, isOn: function () { return on; } };

    /* ================= 事業ページの背景 ================= */
    var note = document.querySelector('.note');
    if (!note) return;
    var cv = document.createElement('canvas');
    cv.className = 'ambient-bg';
    cv.setAttribute('aria-hidden', 'true');
    note.insertBefore(cv, note.firstChild);
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var RGB = (getComputedStyle(note).getPropertyValue('--accent-rgb') || '168,130,255').replace(/\s/g, '');
    var W = 1, H = 1, dpr = 1, pts = [];

    function layout() {
        W = window.innerWidth; H = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var n = W < 700 ? 30 : 60;
        pts = [];
        for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H * 2, z: 0.3 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 4, ph: Math.random() * 6.28 });
    }
    window.addEventListener('resize', layout);
    layout();

    var last = 0, raf2 = 0, smoothLv = 0;
    function draw(ms) {
        raf2 = 0;
        if (document.hidden) return;
        var t = ms / 1000, dt = Math.min(0.05, t - last || 0); last = t;
        smoothLv += (level() - smoothLv) * 0.1;
        var sy = window.scrollY;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var P = pts.map(function (p) {
            if (!reduce) { p.x += p.vx * dt; p.y += p.vy * dt; }
            if (p.x < -20) p.x += W + 40; if (p.x > W + 20) p.x -= W + 40;
            var y = ((p.y - sy * 0.12 * p.z) % (H * 2) + H * 2) % (H * 2) - H * 0.5;
            return { x: p.x, y: y, z: p.z, ph: p.ph };
        });
        var boost = 1 + smoothLv * 2.2;
        // ゆっくり漂う大きな光(奥行き)
        [[0.18, 0.3, 0.13], [0.82, 0.72, 0.17]].forEach(function (g, k) {
            var gx = W * g[0] + Math.sin(t * 0.07 + k * 2) * W * 0.08;
            var gy = H * g[1] + Math.cos(t * 0.05 + k) * H * 0.1 - (sy * 0.05 % H);
            var R = Math.max(W, H) * 0.45;
            var gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
            gr.addColorStop(0, 'rgba(' + RGB + ',' + (0.05 * boost).toFixed(3) + ')');
            gr.addColorStop(1, 'rgba(' + RGB + ',0)');
            ctx.fillStyle = gr;
            ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
        });
        ctx.lineWidth = 0.6;
        for (var i = 0; i < P.length; i++) {
            for (var j = i + 1; j < P.length; j++) {
                var dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = dx * dx + dy * dy;
                if (d > 150 * 150) continue;
                var a = (1 - Math.sqrt(d) / 150) * 0.12 * Math.min(P[i].z, P[j].z) * boost;
                ctx.strokeStyle = 'rgba(' + RGB + ',' + a.toFixed(3) + ')';
                ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke();
            }
        }
        P.forEach(function (p) {
            var tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 0.8 + p.ph);
            ctx.fillStyle = 'rgba(' + RGB + ',' + (0.3 * p.z * tw * boost).toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.1 + p.z, 0, 6.2832); ctx.fill();
        });
        if (!reduce || on) raf2 = requestAnimationFrame(draw);
    }
    raf2 = requestAnimationFrame(draw);
    window.addEventListener('scroll', function () { if (!raf2) raf2 = requestAnimationFrame(draw); }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !raf2) raf2 = requestAnimationFrame(draw); });
    btn.addEventListener('click', function () { if (!raf2) raf2 = requestAnimationFrame(draw); });
})();
