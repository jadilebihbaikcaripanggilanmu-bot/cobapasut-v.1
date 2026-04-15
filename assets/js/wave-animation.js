(function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function formatUtc(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
  }

  class WaveAnimator {
    constructor(canvas, timeEl, valueEl, infoEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.timeEl = timeEl;
      this.valueEl = valueEl;
      this.infoEl = infoEl;

      this.datasetMap = new Map();
      this.currentKey = 'obs';
      this.currentFrames = { times: [], values: [] };

      this.index = 0;
      this.phase = 0;
      this.playing = false;
      this.speed = 6;
      this.frameSkip = 1;
      this.minValue = 0;
      this.maxValue = 1;
      this.lastTimestamp = 0;
      this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);

      this.animate = this.animate.bind(this);
      this.resize = this.resize.bind(this);

      this.resize();
      window.addEventListener('resize', this.resize);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width || this.canvas.width || 900));
      const height = Math.max(220, Math.round(rect.height || this.canvas.height || 340));
      this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * this.pixelRatio);
      this.canvas.height = Math.round(height * this.pixelRatio);
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.draw();
    }

    setDatasets(datasetMap, defaultKey = 'obs') {
      this.datasetMap = new Map(Object.entries(datasetMap || {}));
      this.currentKey = this.datasetMap.has(defaultKey) ? defaultKey : (this.datasetMap.keys().next().value || 'obs');
      this.useDataset(this.currentKey);
    }

    useDataset(key) {
      if (!this.datasetMap.has(key)) {
        this.currentFrames = { times: [], values: [] };
        this.index = 0;
        this.draw();
        return;
      }

      this.currentKey = key;
      this.currentFrames = this.datasetMap.get(key);
      this.index = 0;
      this.phase = 0;
      this.playing = false;
      this.computeBounds();
      this.updateMeta();
      this.draw();
    }

    setSpeed(speed) {
      this.speed = Number(speed) || 6;
      this.frameSkip = Math.max(1, Math.round(this.speed / 3));
    }

    computeBounds() {
      const valid = this.currentFrames.values.filter((v) => Number.isFinite(v));
      if (!valid.length) {
        this.minValue = 0;
        this.maxValue = 1;
        return;
      }
      this.minValue = Math.min(...valid);
      this.maxValue = Math.max(...valid);
      if (this.maxValue === this.minValue) {
        this.maxValue = this.minValue + 1;
      }
    }

    get hasData() {
      return this.currentFrames.times.length > 0 && this.currentFrames.values.length > 0;
    }

    play() {
      if (!this.hasData) return;
      if (this.index >= this.currentFrames.values.length - 1) this.index = 0;
      this.playing = true;
      this.lastTimestamp = 0;
      requestAnimationFrame(this.animate);
    }

    pause() {
      this.playing = false;
      this.draw();
    }

    reset() {
      this.playing = false;
      this.index = 0;
      this.phase = 0;
      this.draw();
    }

    normalize(value) {
      return clamp((value - this.minValue) / (this.maxValue - this.minValue), 0, 1);
    }

    currentValue() {
      return this.currentFrames.values[this.index];
    }

    currentTime() {
      return this.currentFrames.times[this.index];
    }

    updateMeta() {
      if (!this.hasData) {
        this.timeEl.textContent = 'Waktu: -';
        this.valueEl.textContent = 'Elevasi: -';
        if (this.infoEl) this.infoEl.textContent = 'Animasi belum siap. Jalankan Proses Data dulu.';
        return;
      }

      const value = this.currentValue();
      const time = this.currentTime();
      const label = this.currentKey === 'model' ? 'Model' : 'Observasi';
      this.timeEl.textContent = `Waktu: ${formatUtc(time)}`;
      this.valueEl.textContent = `Elevasi ${label}: ${Number.isFinite(value) ? value.toFixed(3) : '-'} m`;
      if (this.infoEl) this.infoEl.textContent = `${label} | Frame ${this.index + 1} / ${this.currentFrames.values.length}`;
    }

    drawBackground(width, height) {
      const ctx = this.ctx;
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#dcecff');
      sky.addColorStop(0.55, '#eef7ff');
      sky.addColorStop(1, '#ffffff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#c3b28a';
      ctx.fillRect(0, height - 52, width, 52);

      ctx.fillStyle = '#d9c9a0';
      ctx.beginPath();
      ctx.moveTo(0, height - 52);
      ctx.lineTo(190, height - 95);
      ctx.lineTo(250, height - 52);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(88, 121, 160, 0.2)';
      ctx.lineWidth = 1;
      for (let y = 30; y < height - 50; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#455a64';
      ctx.fillRect(width * 0.72, height - 130, 10, 78);
      ctx.fillRect(width * 0.72 - 65, height - 90, 75, 8);
      ctx.fillRect(width * 0.72 - 40, height - 70, 18, 18);
    }

    drawWater(width, height, levelY) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, levelY);

      for (let x = 0; x <= width; x += 3) {
        const ripple =
          Math.sin((x * 0.032) + this.phase) * 6 +
          Math.sin((x * 0.015) + this.phase * 1.55) * 3 +
          Math.cos((x * 0.009) + this.phase * 0.8) * 2;
        ctx.lineTo(x, levelY + ripple);
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      const sea = ctx.createLinearGradient(0, levelY - 10, 0, height);
      sea.addColorStop(0, '#7dc7ff');
      sea.addColorStop(0.4, '#4f9cff');
      sea.addColorStop(1, '#1f67da');
      ctx.fillStyle = sea;
      ctx.fill();

      ctx.strokeStyle = '#dff4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 3) {
        const ripple =
          Math.sin((x * 0.032) + this.phase) * 6 +
          Math.sin((x * 0.015) + this.phase * 1.55) * 3 +
          Math.cos((x * 0.009) + this.phase * 0.8) * 2;
        if (x === 0) ctx.moveTo(x, levelY + ripple);
        else ctx.lineTo(x, levelY + ripple);
      }
      ctx.stroke();
    }

    drawOverlay(width, height, levelY) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(17, 24, 39, 0.75)';
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      ctx.fillText('Ilustrasi 2D muka air laut', 18, 26);

      ctx.strokeStyle = 'rgba(17, 24, 39, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(14, levelY);
      ctx.lineTo(width - 14, levelY);
      ctx.stroke();
      ctx.setLineDash([]);

      const norm = this.normalize(this.currentValue());
      const percent = Math.round(norm * 100);
      ctx.fillStyle = 'rgba(17, 24, 39, 0.75)';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.fillText(`Posisi muka air: ${percent}%`, 18, height - 18);
    }

    drawEmptyState(width, height) {
      const ctx = this.ctx;
      this.drawBackground(width, height);
      ctx.fillStyle = 'rgba(17, 24, 39, 0.78)';
      ctx.font = '600 18px Inter, system-ui, sans-serif';
      ctx.fillText('Animasi gelombang belum aktif', 24, 46);
      ctx.font = '400 14px Inter, system-ui, sans-serif';
      ctx.fillText('Jalankan Proses Data, lalu pilih sumber animasi: observasi atau model.', 24, 72);
      this.updateMeta();
    }

    draw() {
      const width = this.canvas.width / this.pixelRatio;
      const height = this.canvas.height / this.pixelRatio;

      if (!this.hasData) {
        this.drawEmptyState(width, height);
        return;
      }

      const value = this.currentValue();
      const normalized = this.normalize(value);
      const topMargin = 44;
      const bottomMargin = 78;
      const waterBand = height - topMargin - bottomMargin;
      const levelY = lerp(topMargin + waterBand, topMargin, normalized);

      this.drawBackground(width, height);
      this.drawWater(width, height, levelY);
      this.drawOverlay(width, height, levelY);
      this.updateMeta();
    }

    animate(timestamp) {
      if (!this.playing) return;

      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const elapsed = timestamp - this.lastTimestamp;
      const interval = clamp(140 - this.speed * 5, 25, 120);

      if (elapsed >= interval) {
        this.phase += 0.18 + this.speed * 0.01;
        this.index += this.frameSkip;
        if (this.index >= this.currentFrames.values.length) {
          this.index = this.currentFrames.values.length - 1;
          this.playing = false;
        }
        this.lastTimestamp = timestamp;
      } else {
        this.phase += 0.05 + this.speed * 0.004;
      }

      this.draw();
      if (this.playing) requestAnimationFrame(this.animate);
    }
  }

  window.WaveAnimator = WaveAnimator;
})();
