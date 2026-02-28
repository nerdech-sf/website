function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

const canvas = document.createElement('canvas');
canvas.className = 'particle-canvas';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const PARTICLE_COUNT = 120;
const particles = [];

for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
        x:       Math.random() * window.innerWidth,
        y:       Math.random() * window.innerHeight,
        vx:      (Math.random() - 0.5) * 0.3,
        vy:      (Math.random() - 0.5) * 0.3,
        size:    Math.random() * 1.5 + 0.3,
        alpha:   Math.random() * 0.5 + 0.1,
        flicker: Math.random() * Math.PI * 2,
    });
}

function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const section = document.elementFromPoint(canvas.width / 2, canvas.height / 2);
    const isDark = section && section.closest('.section--services, .section--about') === null;
    const baseColor = isDark ? '255,255,255' : '0,0,0';

    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.flicker += 0.02;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        const a = p.alpha * (0.7 + 0.3 * Math.sin(p.flicker));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseColor},${a})`;
        ctx.fill();
    });
    requestAnimationFrame(drawParticles);
}
drawParticles();

const cursor = document.createElement('div');
cursor.className = 'cursor-glow';
document.body.appendChild(cursor);

let mx = window.innerWidth / 2;
let my = window.innerHeight / 2;
let cx = mx, cy = my;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

function animateCursor() {
    cx += (mx - cx) * 0.08;
    cy += (my - cy) * 0.08;
    cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(animateCursor);
}
animateCursor();

const scanline = document.createElement('div');
scanline.className = 'scanline';
document.body.appendChild(scanline);

const typewriterText = 'forge new order';
const typewriterEl = document.getElementById('typewriter-text');
let i = 0;

function type() {
    if (i < typewriterText.length) {
        typewriterEl.textContent += typewriterText[i];
        i++;
        setTimeout(type, 80 + Math.random() * 60);
    }
}

document.fonts.ready.then(() => {
    setTimeout(type, 600);
});

const sections = document.querySelectorAll('.section');
const navButtons = document.querySelectorAll('.header-nav button');

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            navButtons.forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.querySelector(`.header-nav button[onclick*="${id}"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
    });
}, { threshold: 0.5 });

sections.forEach(s => observer.observe(s));
