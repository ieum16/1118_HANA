// Decode the bundled clip offscreen and draw only the cat on the card.
globalThis.CatAnimation = (() => {
  const videos = { happy: document.getElementById('happyVideo'), huh: document.getElementById('huhVideo') };
  let video = videos.happy, variant = 'happy', crop = null;
  const canvas = document.getElementById('happyCat');
  const output = canvas.getContext('2d');
  const buffer = document.createElement('canvas');
  buffer.width = 480; buffer.height = 270;
  const context = buffer.getContext('2d', { willReadFrequently: true });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = null, running = false, generation = 0, lastPaint = 0;

  function paint() {
    context.drawImage(video, 0, 0, buffer.width, buffer.height);
    const image = context.getImageData(0, 0, buffer.width, buffer.height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const spill = g - Math.max(r, b);
      if (g > 30 && spill > 14) {
        const key = Math.min(1, (spill - 14) / 48);
        pixels[i + 3] = Math.round(255 * (1 - key * key * (3 - 2 * key)));
        pixels[i + 1] = Math.min(g, Math.max(r, b) + 6);
      }
    }
    context.putImageData(image, 0, 0);
    output.clearRect(0, 0, canvas.width, canvas.height);
    // Keep the crop stable within a reaction to preserve the original movement.
    if (variant === 'happy') output.drawImage(buffer, 145, 15, 205, 235, 55, 20, 490, 560);
    else {
      if (!crop) {
        // The largest connected foreground is the cat, rather than the small source label.
        const seen = new Uint8Array(480 * 270), stack = new Int32Array(480 * 270);
        let largest = 0, bounds = null;
        for (let seed = 0; seed < seen.length; seed++) {
          if (seen[seed] || pixels[seed * 4 + 3] <= 128) continue;
          let count = 0, size = 1, left = 480, top = 270, right = 0, bottom = 0;
          stack[0] = seed; seen[seed] = 1;
          while (size) {
            const index = stack[--size], x = index % 480, y = Math.floor(index / 480);
            count++; left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
            for (const neighbor of [x > 0 ? index - 1 : -1, x < 479 ? index + 1 : -1, y > 0 ? index - 480 : -1, y < 269 ? index + 480 : -1]) {
              if (neighbor >= 0 && !seen[neighbor] && pixels[neighbor * 4 + 3] > 128) {
                seen[neighbor] = 1; stack[size++] = neighbor;
              }
            }
          }
          if (count > largest) { largest = count; bounds = { left, top, right, bottom }; }
        }
        // Some MP4s briefly decode a black lead-in; wait for a keyed foreground.
        if (largest > 480 * 270 * 0.8 || largest < 200) return;
        const padding = 18;
        const { left, top, right, bottom } = bounds || { left: 0, top: 0, right: 480, bottom: 270 };
        crop = { x: Math.max(0, left - padding), y: Math.max(0, top - padding),
          width: Math.min(480, right + padding) - Math.max(0, left - padding),
          height: Math.min(270, bottom + 1) - Math.max(0, top - padding) };
        canvas.dataset.crop = JSON.stringify(crop);
      }
      // Account for the source aspect ratio after the low-resolution keying pass.
      const displayRatio = crop.width / crop.height * (video.videoWidth / video.videoHeight) / (480 / 270);
      const width = Math.min(550, 550 * displayRatio), height = width / displayRatio;
      output.drawImage(buffer, crop.x, crop.y, crop.width, crop.height, (600 - width) / 2, 572 - height, width, height);
    }
    canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1);
  }
  function tick(now) {
    if (!running) return;
    if (video.readyState >= 2 && now - lastPaint >= 1000 / 30) {
      try { paint(); lastPaint = now; }
      catch { stop(); canvas.dispatchEvent(new Event('animationerror')); return; }
    }
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    running = false; generation++;
    cancelAnimationFrame(frame); frame = null;
    Object.values(videos).forEach(source => source.pause());
  }
  async function start(mood = 'happy') {
    stop();
    variant = mood; video = videos[mood] || videos.happy; crop = null;
    const current = generation;
    video.currentTime = 0; video.muted = true; video.controls = false; video.loop = mood === 'huh';
    canvas.dataset.variant = mood;
    canvas.dataset.frames = '0'; lastPaint = 0;
    try {
      if (reducedMotion.matches) {
        if (video.readyState < 1) await new Promise((resolve, reject) => {
          const done = () => { video.removeEventListener('loadedmetadata', done); video.removeEventListener('error', fail); resolve(); };
          const fail = () => { video.removeEventListener('loadedmetadata', done); video.removeEventListener('error', fail); reject(new Error('Cat clip unavailable')); };
          video.addEventListener('loadedmetadata', done); video.addEventListener('error', fail);
        });
        if (current !== generation) return;
        // Seek past any black lead-in without playing motion.
        await new Promise((resolve, reject) => {
          const cleanup = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
          const done = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error('Cat frame unavailable')); };
          video.addEventListener('seeked', done); video.addEventListener('error', fail);
          video.currentTime = Math.min(0.75, video.duration / 2 || 0.75);
        });
        if (current === generation) paint();
        return;
      }
      await video.play();
      if (current !== generation) return;
      running = true; frame = requestAnimationFrame(tick);
    } catch { if (current === generation) canvas.dispatchEvent(new Event('animationerror')); }
  }
  window.addEventListener('pagehide', stop);
  return { start, stop };
})();
