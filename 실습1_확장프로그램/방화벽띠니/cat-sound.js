// Local sound effects; a new reaction always replaces the previous one.
globalThis.CatSound = (() => {
  const sounds = {
    happy: document.getElementById('happySound'),
    crying: document.getElementById('cryingSound'),
    gag: document.getElementById('gagSound'),
    huh: document.getElementById('huhSound')
  };
  let generation = 0;
  function stop() {
    generation++;
    for (const sound of Object.values(sounds)) {
      sound.pause();
      sound.currentTime = 0;
    }
  }
  function play(mood, enabled) {
    stop();
    if (!enabled || !sounds[mood]) return;
    const sound = sounds[mood], current = generation;
    sound.volume = 0.45;
    sound.play().catch(error => {
      if (current !== generation || error.name === 'AbortError') return;
      document.getElementById('soundToggle').title = '소리를 재생하지 못했어요. 소리 버튼으로 다시 시도해 주세요.';
    });
  }
  window.addEventListener('pagehide', stop);
  return { play, stop };
})();
