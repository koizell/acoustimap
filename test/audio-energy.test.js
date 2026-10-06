const test = require('node:test');
const assert = require('node:assert/strict');
const { createAudioProcessor } = require('./helpers/audio-processor-context');

function feed(engine, rate, seconds, amplitude, block = 128, stereo = false) {
  let remaining = Math.round(seconds * rate);
  while (remaining > 0) {
    const size = Math.min(block, remaining);
    const values = new Float32Array(size).fill(amplitude);
    const channels = stereo ? [values, new Float32Array(size).fill(-amplitude)] : [values];
    assert.ok(engine.feed(channels).every((v) => v === 0), 'no reproduce audio');
    remaining -= size;
  }
}

test('energía: señal constante conserva RMS crudo; ventana ponderada de 3 s', () => {
  for (const amplitude of [0, 0.0002, 0.01, 0.3, 0.8]) {
    const engine = createAudioProcessor();
    feed(engine, 48000, 3.4, amplitude);
    const m = engine.messages.at(-1);
    assert.equal(m.ready, true);
    assert.ok(Math.abs(m.rms - amplitude) < 1e-7);
    assert.ok(m.windowMs >= 3000 && m.windowMs < 3025);
  }
});

test('energía: pico crudo de 50 ms pesa por duración y marca recorte', () => {
  const engine = createAudioProcessor();
  feed(engine, 48000, 1, 0.01);
  feed(engine, 48000, 0.05, 1);
  feed(engine, 48000, 0.15, 0.01);
  const m = engine.messages.at(-1);
  assert.ok(Math.abs(m.rms - Math.sqrt(0.05 + 0.95 * 0.01 ** 2)) < 1e-7);
  assert.equal(m.clippedFraction, 0.25);
  feed(engine, 48000, 1, 0.01);
  assert.ok(Math.abs(engine.messages.at(-1).rms - 0.01) < 1e-7);
});

test('energía: cambio sostenido alcanza el RMS real tras 1 s', () => {
  const engine = createAudioProcessor();
  feed(engine, 48000, 1, 0.01);
  feed(engine, 48000, 0.2, 0.1);
  assert.ok(Math.abs(engine.messages.at(-1).rms - Math.sqrt(0.8 * 0.01 ** 2 + 0.2 * 0.1 ** 2)) < 1e-7);
  feed(engine, 48000, 0.8, 0.1);
  assert.ok(Math.abs(engine.messages.at(-1).rms - 0.1) < 1e-7);
});

test('energía: independiente del bloque y de 44.1/48 kHz', () => {
  for (const rate of [44100, 48000]) for (const block of [128, 256, 480]) {
    const engine = createAudioProcessor(rate);
    feed(engine, rate, 1, 0.01, block);
    feed(engine, rate, 0.2, 0.2, block);
    assert.equal(engine.messages.length, 6);
    assert.equal(engine.messages.at(-1).endTime, 1.2);
    assert.ok(Math.abs(engine.messages.at(-1).rms - Math.sqrt(0.8 * 0.01 ** 2 + 0.2 * 0.2 ** 2)) < 1e-7);
  }
});

test('energía: canales opuestos no se cancelan ni duplican el nivel', () => {
  const engine = createAudioProcessor();
  feed(engine, 48000, 1, 0.1, 128, true);
  assert.ok(Math.abs(engine.messages.at(-1).rms - 0.1) < 1e-7);
  const tone = createAudioProcessor();
  for (let o = 0; o < 48000 * 4; o += 128) {
    const values = Float32Array.from({ length: 128 }, (_, i) => 0.01 * Math.SQRT2 * Math.sin(2 * Math.PI * 1000 * (o + i) / 48000));
    tone.feed([values, Float32Array.from(values, (v) => -v)]);
  }
  assert.ok(Math.abs(tone.messages.at(-1).aDbfs + 40) < 0.1);
});

test('energía: reset vacía la ventana y solo comunica números', () => {
  const engine = createAudioProcessor();
  feed(engine, 48000, 3.4, 0.8);
  engine.reset(4);
  feed(engine, 48000, 0.2, 0.01);
  assert.equal(engine.messages.at(-1).ready, false);
  assert.equal(engine.messages.at(-1).generation, 4);
  feed(engine, 48000, 3.2, 0.01);
  assert.ok(Math.abs(engine.messages.at(-1).rms - 0.01) < 1e-7);
  for (const report of engine.messages) {
    assert.deepEqual(Object.keys(report), ['type', 'generation', 'endTime', 'ready', 'windowMs', 'aDbfs', 'peakDbfs', 'rms', 'clippedFraction']);
    assert.ok(Object.values(report).every((v) => !ArrayBuffer.isView(v)), 'no transmite audio');
  }
});
