/* nerdech — finale.js
   各ページの最後の演出。スクロールすると、大きな nerdech のロゴが一文字ずつ上から追いかけてきて、画面に留まる。
   ♪ ボタンを押したときだけ、ブラウザの中で生成した音楽が流れる(外部の音源は使わない)。
   - 音はこの演出が画面に見えている間だけ鳴り、離れるとフェードアウトする
   - ブラウザは自動再生を止めるので、必ずボタンを押してから鳴る
   - prefers-reduced-motion: 文字は最初から所定の位置 */
(function () {
    'use strict';

    var sec = document.querySelector('.finale');
    if (!sec) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var letters = [].slice.call(sec.querySelectorAll('.finale__word span[aria-hidden]'));
    var glow = sec.querySelector('.finale__glow');
    var btn = sec.querySelector('.finale__sound');
    var bars = [].slice.call(sec.querySelectorAll('.finale__eq i'));

    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

    var audio = { on: false, ctx: null, master: null, analyser: null, data: null, timer: 0, audible: true, next: 0, step: 0,
        setAudible: function (v) {
            this.audible = v;
            if (this.master && this.on) this.master.gain.setTargetAtTime(v ? 0.2 : 0, this.ctx.currentTime, 0.6);
        } };

    /* ---------------- ロゴが追いかけてくる ---------------- */
    var ys = letters.map(function () { return -1; }); // 画面の高さに対する割合(-1 = 上の外)
    var level = 0, raf = 0, inView = false;

    function progress() {
        var r = sec.getBoundingClientRect(), vh = window.innerHeight;
        return clamp((vh - r.top) / (r.height), 0, 1);
    }

    function frame() {
        raf = 0;
        var p = progress(), vh = window.innerHeight;
        letters.forEach(function (el, i) {
            var e = reduce ? 1 : smooth((p - 0.12 - i * 0.045) / 0.32);
            var target = -(1 - e) * 0.9;
            // 前の文字を少し遅れて追う
            ys[i] += (target - ys[i]) * (reduce ? 1 : 0.12 - i * 0.006);
            var bounce = level * (i % 2 ? 1 : -1) * 6;
            el.style.transform = 'translate3d(0,' + (ys[i] * vh + bounce).toFixed(1) + 'px,0)';
            el.style.opacity = clamp(1 + ys[i] * 1.4, 0, 1).toFixed(3);
        });
        if (glow) {
            glow.style.opacity = (0.35 + smooth((p - 0.2) / 0.5) * 0.5 + level * 0.5).toFixed(3);
            glow.style.transform = 'translate(-50%, -50%) scale(' + (1 + level * 0.25).toFixed(3) + ')';
        }
        readLevel();
        if (inView || audio.on) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    if (window.IntersectionObserver) {
        new IntersectionObserver(function (en) {
            inView = en[0].isIntersecting;
            if (inView) kick();
            audio.setAudible(inView);
        }, { rootMargin: '0px' }).observe(sec);
    } else { inView = true; }
    window.addEventListener('scroll', kick, { passive: true });
    frame();

    /* ---------------- 音楽(Web Audio で生成) ---------------- */

    // 和音(MIDI): Am9 → Fmaj7 → Cmaj7 → G6
    var CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 64, 67], [55, 59, 62, 64, 71]];
    var BAR = 8; // 秒 / 和音
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    function build() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        var ctx = new AC();
        var master = ctx.createGain(); master.gain.value = 0;
        var analyser = ctx.createAnalyser(); analyser.fftSize = 256;
        // 残響(ノイズから作る)
        var len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (var c = 0; c < 2; c++) {
            var d = ir.getChannelData(c);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
        var verb = ctx.createConvolver(); verb.buffer = ir;
        var wet = ctx.createGain(); wet.gain.value = 0.55;
        var dry = ctx.createGain(); dry.gain.value = 0.6;
        var bus = ctx.createGain();
        bus.connect(dry); bus.connect(verb); verb.connect(wet);
        dry.connect(master); wet.connect(master);
        master.connect(analyser); analyser.connect(ctx.destination);
        // こだま(アルペジオ用)
        var delay = ctx.createDelay(1.5); delay.delayTime.value = 0.42;
        var fb = ctx.createGain(); fb.gain.value = 0.32;
        delay.connect(fb); fb.connect(delay); delay.connect(bus);
        audio.ctx = ctx; audio.master = master; audio.analyser = analyser; audio.bus = bus; audio.delay = delay;
        audio.data = new Uint8Array(analyser.frequencyBinCount);
        return true;
    }

    function pad(chord, t) {
        var ctx = audio.ctx;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 2.2);
        g.gain.setValueAtTime(0.09, t + BAR - 1.5);
        g.gain.linearRampToValueAtTime(0, t + BAR + 1.8);
        lp.connect(g); g.connect(audio.bus);
        chord.slice(0, 4).forEach(function (m, k) {
            [-4, 4].forEach(function (det) {
                var o = ctx.createOscillator();
                o.type = k === 0 ? 'sine' : 'triangle';
                o.frequency.value = hz(m); o.detune.value = det;
                var og = ctx.createGain(); og.gain.value = k === 0 ? 0.5 : 0.28;
                o.connect(og); og.connect(lp);
                o.start(t); o.stop(t + BAR + 2);
            });
        });
        // ベース
        var b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = 'sine'; b.frequency.value = hz(chord[0] - 12);
        bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.16, t + 0.8); bg.gain.linearRampToValueAtTime(0, t + BAR + 0.5);
        b.connect(bg); bg.connect(audio.bus); b.start(t); b.stop(t + BAR + 1);
    }
    function pluck(m, t) {
        var ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = hz(m);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g); g.connect(audio.bus); g.connect(audio.delay);
        o.start(t); o.stop(t + 1.5);
    }

    function schedule() {
        var ctx = audio.ctx, ahead = ctx.currentTime + 0.3;
        var BEAT = BAR / 16;
        while (audio.next < ahead) {
            var bar = Math.floor(audio.step / 16), chord = CHORDS[bar % CHORDS.length];
            if (audio.step % 16 === 0) pad(chord, audio.next);
            var s = audio.step % 16;
            if ([0, 3, 6, 8, 10, 13].indexOf(s) >= 0 && Math.random() < 0.8) {
                var notes = chord.slice(1).map(function (m) { return m + 12; });
                pluck(notes[(s * 7 + bar) % notes.length], audio.next);
            }
            audio.next += BEAT; audio.step++;
        }
    }

    function start() {
        if (!audio.ctx && !build()) return;
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        audio.on = true;
        if (!audio.timer) {
            audio.next = audio.ctx.currentTime + 0.1;
            audio.timer = setInterval(schedule, 100);
            schedule();
        }
        audio.master.gain.cancelScheduledValues(audio.ctx.currentTime);
        audio.master.gain.setTargetAtTime(audio.audible ? 0.2 : 0, audio.ctx.currentTime, 0.8);
        kick();
    }
    function stop() {
        audio.on = false;
        if (!audio.ctx) return;
        audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.4);
        setTimeout(function () {
            if (audio.on) return;
            clearInterval(audio.timer); audio.timer = 0; audio.step = 0;
            audio.ctx.suspend();
        }, 1600);
    }

    function readLevel() {
        if (!audio.on || !audio.analyser) { level += (0 - level) * 0.1; bars.forEach(function (b) { b.style.transform = 'scaleY(0.2)'; }); return; }
        audio.analyser.getByteFrequencyData(audio.data);
        var sum = 0, n = 24;
        for (var i = 1; i <= n; i++) sum += audio.data[i];
        var l = sum / (n * 255);
        level += (l - level) * 0.2;
        bars.forEach(function (b, k) {
            var v = audio.data[2 + k * 5] / 255;
            b.style.transform = 'scaleY(' + Math.max(0.15, v).toFixed(2) + ')';
        });
    }

    if (btn) {
        btn.addEventListener('click', function () {
            var on = btn.getAttribute('aria-pressed') !== 'true';
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.querySelector('.finale__sound-label').textContent = on ? 'SOUND ON' : 'SOUND OFF';
            if (on) start(); else stop();
        });
    }
    document.addEventListener('visibilitychange', function () {
        if (!audio.ctx) return;
        if (document.hidden) audio.ctx.suspend();
        else if (audio.on) audio.ctx.resume();
    });
})();
