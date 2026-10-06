const test = require('node:test');
const assert = require('node:assert/strict');
const { createAudioProcessor } = require('./helpers/audio-processor-context');

function feedSignal(engine, seconds, signal, rate = 48000, block = 128) {
  const start = engine.processor.totalFrames;
  const count = Math.round(seconds * rate);
  for (let o = 0; o < count; o += block) {
    engine.feed([Float32Array.from({ length: Math.min(block, count - o) },
      (_, i) => signal((start + o + i) / rate))]);
  }
}

test('curva A: frecuencias exactas contra tabla independiente', () => {
  const engine = createAudioProcessor();
  for (const [hz, expected] of [[31.5, -39.4], [63, -26.2], [125, -16.1],
    [250, -8.6], [500, -3.2], [1000, 0], [2000, 1.2], [4000, 1], [8000, -1.1]]) {
    const actual = engine.evaluate(`20 * Math.log10(aWeightingGain(${hz}))`);
    assert.ok(Math.abs(actual - expected) < 0.2, `${hz} Hz: ${actual}`);
  }
});

test('FFT: tonos entre bins conservan energía sin corrección empírica', () => {
  for (const rate of [44100, 48000]) for (const hz of [750, 1000, 4000]) {
    const engine = createAudioProcessor(rate);
    feedSignal(engine, 4, (t) => 0.01 * Math.SQRT2 * Math.sin(2 * Math.PI * hz * t), rate);
    const level = engine.messages.at(-1);
    const weighting = engine.evaluate(`20 * Math.log10(aWeightingGain(${hz}))`);
    assert.equal(level.ready, true);
    assert.ok(Math.abs(level.aDbfs - (-40 + weighting)) < 0.1,
      `${rate} Hz / tono ${hz}: ${level.aDbfs}`);
  }
});

test('espectro: misma RMS, 63 Hz y 1 kHz separados por la curva A', () => {
  const levels = [];
  for (const hz of [63, 1000]) {
    const engine = createAudioProcessor();
    feedSignal(engine, 4, (t) => 0.01 * Math.SQRT2 * Math.sin(2 * Math.PI * hz * t));
    levels.push(engine.messages.at(-1).aDbfs);
  }
  assert.ok(Math.abs((levels[1] - levels[0]) - 26.2) < 0.5, levels.join(', '));
});

test('golpe audible: contribuye al promedio por duración y sale de la ventana', () => {
  const engine = createAudioProcessor();
  const tone = (t) => 0.01 * Math.SQRT2 * Math.sin(2 * Math.PI * 1000 * t);
  feedSignal(engine, 4, tone);
  const before = engine.messages.at(-1);
  // Ruido pseudoaleatorio reproducible, sin DC; no usar fill(0.95) como palmada.
  let seed = 123;
  feedSignal(engine, 0.05, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296 * 2 - 1) * 0.5;
  });
  feedSignal(engine, 0.55, tone);
  const during = engine.messages.at(-1);
  assert.ok(during.aDbfs > before.aDbfs + 3, 'el sonido real no se oculta');
  assert.ok(during.peakDbfs > during.aDbfs + 5, 'el pico no es la lectura sostenida');
  assert.ok(during.aDbfs < during.peakDbfs - 5);
  feedSignal(engine, 4, tone);
  const after = engine.messages.at(-1);
  assert.ok(Math.abs(after.aDbfs - before.aDbfs) < 0.1);
  assert.ok(Math.abs(after.peakDbfs - before.peakDbfs) < 0.1, 'el pico también caduca');
});

test('nivel sostenido: converge y permanece estable, independiente del bloque', () => {
  for (const block of [128, 256, 480]) {
    const engine = createAudioProcessor();
    feedSignal(engine, 4, (t) => 0.01 * Math.SQRT2 * Math.sin(2 * Math.PI * 1000 * t), 48000, block);
    feedSignal(engine, 4, (t) => 0.1 * Math.SQRT2 * Math.sin(2 * Math.PI * 1000 * t), 48000, block);
    const last = engine.messages.slice(-3);
    assert.ok(last.every((m) => Math.abs(m.aDbfs + 20) < 0.1));
  }
});

test('DC no es sonido audible y reiniciar exige otra ventana completa', () => {
  const engine = createAudioProcessor();
  feedSignal(engine, 4, () => 0.01);
  assert.equal(engine.messages.at(-1).aDbfs, -120);
  engine.reset(7);
  feedSignal(engine, 1, () => 0);
  assert.equal(engine.messages.at(-1).ready, false);
  assert.equal(engine.messages.at(-1).generation, 7);
  feedSignal(engine, 3, () => 0);
  assert.equal(engine.messages.at(-1).ready, true);
});
