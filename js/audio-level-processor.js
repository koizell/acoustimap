/**
 * v5: espectro ponderado A y promedio energético móvil de 3 s.
 * Solo salen resúmenes numéricos: ni audio, ni bins del espectro.
 * El resultado es digital, no presión sonora calibrada ni un sonómetro certificado.
 */
const WINDOW_SIZE = 8192;
const HOP_SIZE = 1024;

class FFT {
  constructor(size) {
    this.size = size;
    this.levels = Math.log2(size);
    if ((1 << this.levels) !== size) throw new Error('FFT: tamaño no válido');
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    this.rev = new Uint16Array(size);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos(2 * Math.PI * i / size);
      this.sin[i] = Math.sin(2 * Math.PI * i / size);
    }
    for (let i = 0; i < size; i++) {
      let x = i;
      let r = 0;
      for (let j = 0; j < this.levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
  }

  transform(re, im) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const tre = re[j + half] * this.cos[k] + im[j + half] * this.sin[k];
          const tim = -re[j + half] * this.sin[k] + im[j + half] * this.cos[k];
          re[j + half] = re[j] - tre; im[j + half] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  }
}

function aWeightingResponse(frequency) {
  const f2 = frequency * frequency;
  return (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6)
    * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9))
    * (f2 + 12194 * 12194));
}

const A_REFERENCE = aWeightingResponse(1000);
/** Ganancia de amplitud normalizada a 1 kHz; la energía usa su cuadrado. */
function aWeightingGain(frequency) {
  return aWeightingResponse(frequency) / A_REFERENCE;
}

class NoiseLevelProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.generation = options?.processorOptions?.generation || 0;
    this.fft = new FFT(WINDOW_SIZE);
    this.hann = new Float64Array(WINDOW_SIZE);
    this.re = new Float64Array(WINDOW_SIZE);
    this.im = new Float64Array(WINDOW_SIZE);
    this.channels = [];
    let windowEnergy = 0;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      this.hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / WINDOW_SIZE));
      windowEnergy += this.hann[i] ** 2;
    }
    // Parseval: potencia de una banda real = 2|X|²/(N·Σw²).
    // DC y Nyquist no se duplican. No hay corrección empírica por tono.
    this.spectralNorm = 2 / (WINDOW_SIZE * windowEnergy);
    this.aGain = new Float64Array(WINDOW_SIZE / 2 + 1);
    for (let bin = 0; bin < this.aGain.length; bin++) {
      this.aGain[bin] = aWeightingGain(bin * sampleRate / WINDOW_SIZE);
    }
    this.eqSlots = Math.ceil(3 * sampleRate / HOP_SIZE);
    this.eqEnergyRing = new Float64Array(this.eqSlots);
    this.rmsFrames = Math.round(sampleRate);
    this.rmsEnergyRing = new Float64Array(this.rmsFrames);
    this.reportFrames = Math.round(sampleRate / 5);
    this.resetAll();
    this.port.onmessage = ({ data }) => {
      if (data?.type !== 'reset') return;
      this.generation = data.generation;
      this.resetAll();
    };
  }

  resetAll() {
    for (const channel of this.channels) channel.fill(0);
    this.fill = 0; this.totalFrames = 0; this.hopFrames = 0;
    this.eqEnergyRing.fill(0); this.eqCursor = 0; this.eqCount = 0; this.eqEnergy = 0;
    this.rmsEnergyRing.fill(0); this.rmsCursor = 0; this.rmsCount = 0; this.rmsEnergy = 0;
    this.framesSinceReport = 0; this.pendingClipped = 0;
  }

  weightedEnergy() {
    let total = 0;
    for (const channel of this.channels) {
      let mean = 0;
      for (let i = 0; i < WINDOW_SIZE; i++) mean += channel[i];
      mean /= WINDOW_SIZE;
      for (let i = 0; i < WINDOW_SIZE; i++) {
        // El cursor apunta a la muestra más antigua: Hann necesita orden temporal.
        this.re[i] = (channel[(this.fill + i) % WINDOW_SIZE] - mean) * this.hann[i];
        this.im[i] = 0;
      }
      this.fft.transform(this.re, this.im);
      for (let bin = 1; bin < this.aGain.length; bin++) {
        const edge = bin === WINDOW_SIZE / 2 ? 0.5 : 1;
        total += (this.re[bin] ** 2 + this.im[bin] ** 2)
          * this.spectralNorm * edge * this.aGain[bin] ** 2;
      }
    }
    // Promediar potencias: canales en oposición no se anulan.
    return total / this.channels.length;
  }

  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (!channels?.length || !channels[0]?.length) return true;
    if (this.channels.length !== channels.length) {
      this.channels = channels.map(() => new Float64Array(WINDOW_SIZE));
      this.resetAll();
    }
    const length = channels[0].length;
    for (let frame = 0; frame < length; frame++) {
      let power = 0;
      let clipped = false;
      for (let c = 0; c < channels.length; c++) {
        const value = Number.isFinite(channels[c][frame]) ? channels[c][frame] : 0;
        this.channels[c][this.fill] = value;
        power += value * value;
        if (Math.abs(value) >= 0.99) clipped = true;
      }
      power /= channels.length;
      this.rmsEnergy += power - this.rmsEnergyRing[this.rmsCursor];
      this.rmsEnergyRing[this.rmsCursor] = power;
      this.rmsCursor = (this.rmsCursor + 1) % this.rmsFrames;
      this.rmsCount = Math.min(this.rmsFrames, this.rmsCount + 1);
      this.fill = (this.fill + 1) % WINDOW_SIZE;
      this.totalFrames++;
      this.hopFrames++;
      if (this.totalFrames >= WINDOW_SIZE && this.hopFrames >= HOP_SIZE) {
        this.hopFrames = 0;
        const weighted = this.weightedEnergy();
        this.eqEnergy += weighted - this.eqEnergyRing[this.eqCursor];
        this.eqEnergyRing[this.eqCursor] = weighted;
        this.eqCursor = (this.eqCursor + 1) % this.eqSlots;
        this.eqCount = Math.min(this.eqSlots, this.eqCount + 1);
      }
      this.framesSinceReport++;
      if (clipped) this.pendingClipped++;
      if (this.framesSinceReport >= this.reportFrames) {
        let peak = 0;
        for (let i = 0; i < this.eqCount; i++) peak = Math.max(peak, this.eqEnergyRing[i]);
        this.port.postMessage({
          type: 'level', generation: this.generation,
          endTime: (currentFrame + frame + 1) / sampleRate,
          ready: this.eqCount === this.eqSlots,
          windowMs: this.eqCount * HOP_SIZE / sampleRate * 1000,
          aDbfs: 10 * Math.log10(Math.max(1e-12, this.eqEnergy / Math.max(1, this.eqCount))),
          // Máximo espectral reciente, no Lmax certificado Fast/Slow.
          peakDbfs: 10 * Math.log10(Math.max(1e-12, peak)),
          rms: Math.sqrt(Math.max(0, this.rmsEnergy) / Math.max(1, this.rmsCount)),
          clippedFraction: this.pendingClipped / this.framesSinceReport
        });
        this.framesSinceReport = 0; this.pendingClipped = 0;
      }
    }
    return true;
  }
}

registerProcessor('noise-level-processor', NoiseLevelProcessor);
