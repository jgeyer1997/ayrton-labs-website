(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Rotating point-sphere background ---------- */

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const CYAN = [70, 230, 255];
  const VIOLET = [139, 92, 255];

  let w = 0;
  let h = 0;
  let dpr = 1;

  // Points evenly distributed over a unit sphere (Fibonacci lattice).
  const SPHERE_COUNT = 720;
  const sphere = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SPHERE_COUNT; i++) {
    const y = 1 - (i / (SPHERE_COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    sphere.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }

  // A sparse subset of points forms a network of links.
  const nodes = sphere.filter((_, i) => i % 6 === 0);
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [ax, ay, az] = nodes[i];
      const [bx, by, bz] = nodes[j];
      const d = Math.hypot(ax - bx, ay - by, az - bz);
      if (d < 0.32) links.push([nodes[i], nodes[j]]);
    }
  }

  // Two tilted orbital rings.
  const rings = [
    { radius: 1.38, tilt: 0.42, count: 180, speed: 1.6 },
    { radius: 1.62, tilt: -0.28, count: 220, speed: -1.1 },
  ];

  // Signals travelling along links.
  const pulses = [];

  // Faint drifting dust in screen space.
  const dust = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.00004 + Math.random() * 0.00012,
    s: Math.random() * 1.2 + 0.3,
  }));

  let mouseX = 0;
  let mouseY = 0;
  let tiltX = 0;
  let tiltY = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function frame(time) {
    const t = time * 0.001;
    const mobile = w < 820;
    const scroll = window.scrollY;

    const R = mobile ? Math.min(w * 0.46, h * 0.3) : Math.min(w, h) * 0.3;
    const cx = mobile ? w * 0.5 : w * 0.7;
    const cy = (mobile ? h * 0.3 : h * 0.5) - scroll * 0.25;
    const fade = Math.max(0.3, 1 - scroll / (h * 1.2)) * (mobile ? 0.55 : 1);

    tiltX += (mouseY * 0.25 - tiltX) * 0.04;
    tiltY += (mouseX * 0.35 - tiltY) * 0.04;
    const rotY = t * 0.12 + tiltY + scroll * 0.0008;
    const rotX = -0.35 + tiltX;
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const sinX = Math.sin(rotX);
    const cosX = Math.cos(rotX);
    const fov = 3.2;

    function project(p) {
      const x1 = p[0] * cosY - p[2] * sinY;
      const z1 = p[0] * sinY + p[2] * cosY;
      const y1 = p[1] * cosX - z1 * sinX;
      const z2 = p[1] * sinX + z1 * cosX;
      const s = fov / (fov + z2);
      return { x: cx + x1 * R * s, y: cy + y1 * R * s, z: z2, s };
    }

    ctx.clearRect(0, 0, w, h);

    // Dust
    for (const d of dust) {
      d.y -= d.v * 16;
      if (d.y < 0) d.y += 1;
      ctx.fillStyle = `rgba(160, 190, 255, ${0.25 * fade})`;
      ctx.fillRect(d.x * w, d.y * h, d.s, d.s);
    }

    // Core glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    glow.addColorStop(0, `rgba(70, 230, 255, ${0.10 * fade})`);
    glow.addColorStop(0.5, `rgba(139, 92, 255, ${0.05 * fade})`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);

    // Links
    ctx.lineWidth = 0.6;
    for (const [a, b] of links) {
      const pa = project(a);
      const pb = project(b);
      const depth = 1 - (pa.z + pb.z + 2) / 4;
      ctx.strokeStyle = `rgba(110, 200, 255, ${0.04 + depth * 0.22 * fade})`;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Pulses along links
    if (!reduceMotion && pulses.length < 14 && Math.random() < 0.08) {
      pulses.push({ link: links[(Math.random() * links.length) | 0], p: 0 });
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      pulse.p += 0.018;
      if (pulse.p >= 1) {
        pulses.splice(i, 1);
        continue;
      }
      const pa = project(pulse.link[0]);
      const pb = project(pulse.link[1]);
      const x = pa.x + (pb.x - pa.x) * pulse.p;
      const y = pa.y + (pb.y - pa.y) * pulse.p;
      const front = (pa.z + pb.z) / 2 < 0.2;
      if (!front) continue;
      ctx.fillStyle = `rgba(200, 250, 255, ${0.9 * fade})`;
      ctx.shadowColor = "rgba(70, 230, 255, 0.9)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Sphere points
    for (const p of sphere) {
      const q = project(p);
      const depth = 1 - (q.z + 1) / 2;
      const [r, g, b] = mix(CYAN, VIOLET, (p[1] + 1) / 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.12 + depth * 0.88) * fade})`;
      const size = 0.6 + depth * 1.4 * q.s;
      ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
    }

    // Orbital rings
    for (const ring of rings) {
      const sinT = Math.sin(ring.tilt);
      const cosT = Math.cos(ring.tilt);
      for (let i = 0; i < ring.count; i++) {
        const a = (i / ring.count) * Math.PI * 2 + t * 0.05 * ring.speed;
        const x = Math.cos(a) * ring.radius;
        const z = Math.sin(a) * ring.radius;
        const q = project([x, -z * sinT, z * cosT]);
        const depth = 1 - (q.z + ring.radius) / (2 * ring.radius);
        // A brighter "comet" segment travels around each ring.
        const head = ((t * 0.12 * ring.speed) % 1 + 1) % 1;
        let k = ((i / ring.count - head) % 1 + 1) % 1;
        k = ring.speed > 0 ? 1 - k : k;
        const trail = k < 0.12 ? 1 - k / 0.12 : 0;
        ctx.fillStyle = `rgba(150, 220, 255, ${(0.08 + depth * 0.3 + trail * 0.7) * fade})`;
        const size = 0.8 + trail * 1.6;
        ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      }
    }

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) frame(0);
  });
  window.addEventListener("pointermove", (e) => {
    mouseX = (e.clientX / w) * 2 - 1;
    mouseY = (e.clientY / h) * 2 - 1;
  });
  if (reduceMotion) {
    frame(0);
    window.addEventListener("scroll", () => frame(0), { passive: true });
  } else {
    requestAnimationFrame(frame);
  }

  /* ---------- Reveal on scroll ---------- */

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 5) * 90}ms`;
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Card cursor glow ---------- */

  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      card.style.setProperty("--my", `${e.clientY - rect.top}px`);
    });
  });

  /* ---------- Readout counter + year ---------- */

  const build = document.getElementById("build");
  let n = 0;
  const target = 4096;
  function tick() {
    n = Math.min(target, n + Math.ceil((target - n) * 0.06));
    build.textContent = String(n).padStart(4, "0");
    if (n < target) requestAnimationFrame(tick);
  }
  if (reduceMotion) build.textContent = String(target);
  else setTimeout(() => requestAnimationFrame(tick), 600);

  document.getElementById("year").textContent = new Date().getFullYear();
})();
