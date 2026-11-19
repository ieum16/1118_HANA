const celebrateCompletion = (() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#ff2d75', '#7c3aed', '#f59e0b', '#00a7d6', '#17b26a', '#ff5a24', '#2855ef'];
  const fullTurn = Math.PI * 2;
  const random = (min, max) => min + Math.random() * (max - min);
  let canvas;
  let context;
  let particles = [];
  let rings = [];

  function burst(x, y, direction, spread, count, start) {
    for (let index = 0; index < count; index++) {
      const angle = direction + random(-spread / 2, spread / 2);
      const speed = random(200, 710);
      particles.push({
        x, y, start,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        size: random(3, 9),
        spin: random(-15, 15),
        phase: random(0, fullTurn),
        lifetime: random(0.95, 1.9),
        color: colors[index % colors.length],
        spark: index % 4 === 0,
      });
    }
  }

  function drawFrame(now) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scale = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.round(height * scale);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    particles = particles.filter((particle) => now < particle.start + particle.lifetime * 1000);
    rings = rings.filter((ring) => now < ring.start + 460);
    if (reducedMotion.matches || (!particles.length && !rings.length)) {
      canvas.remove();
      canvas = null;
      particles = [];
      rings = [];
      return;
    }

    for (const ring of rings) {
      const progress = (now - ring.start) / 460;
      if (progress < 0) continue;
      context.globalAlpha = (1 - progress) * 0.82;
      context.strokeStyle = ring.color;
      context.lineWidth = 4 * (1 - progress) + 1;
      context.beginPath();
      context.arc(ring.x, ring.y, 9 + 83 * (1 - (1 - progress) ** 2), 0, fullTurn);
      context.stroke();
    }

    for (const particle of particles) {
      const age = (now - particle.start) / 1000;
      if (age < 0) continue;
      const travel = (1 - Math.exp(-2.1 * age)) / 2.1;
      const x = particle.x + particle.velocityX * travel + 10 * Math.sin(age * 9 + particle.phase) * age;
      const y = particle.y + particle.velocityY * travel + 235 * age ** 2;
      const size = particle.size;

      context.save();
      context.globalAlpha = Math.min(1, (particle.lifetime - age) / 0.38);
      context.fillStyle = particle.color;
      context.translate(x, y);
      if (particle.spark) {
        context.rotate(Math.atan2(particle.velocityY, particle.velocityX));
        context.fillRect(-size * (2 - age), -1.4, size * (3 - age), 2.8);
      } else {
        context.rotate(particle.phase + age * particle.spin);
        const ribbonWidth = size * (0.35 + 0.65 * Math.abs(Math.cos(age * 14 + particle.phase)));
        context.fillRect(-ribbonWidth / 2, -size * 0.7, ribbonWidth, size * 1.4);
      }
      context.restore();
    }

    requestAnimationFrame(drawFrame);
  }

  return (checkbox) => {
    if (reducedMotion.matches) return;

    const startLoop = !canvas;
    if (startLoop) {
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d');
      if (!context) {
        canvas = null;
        return;
      }
      canvas.className = 'confetti';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.append(canvas);
    }

    const { left, top, width, height } = checkbox.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const now = performance.now();
    rings.push({ x, y, start: now, color: '#f59e0b' });
    rings.push({ x, y, start: now + 55, color: '#7c3aed' });
    burst(x, y, 0, fullTurn, 104, now);
    burst(14, canvas.clientHeight - 12, -Math.PI / 3.5, 1.15, 62, now + 120);
    burst(canvas.clientWidth - 14, canvas.clientHeight - 12, -Math.PI * 0.72, 1.15, 62, now + 235);
    particles = particles.slice(-684);
    rings = rings.slice(-6);

    checkbox.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.4) rotate(-12deg)', offset: 0.28 },
      { transform: 'scale(0.92) rotate(5deg)', offset: 0.64 },
      { transform: 'scale(1)' },
    ], { duration: 360, easing: 'ease-out' });

    if (startLoop) requestAnimationFrame(drawFrame);
  };
})();
