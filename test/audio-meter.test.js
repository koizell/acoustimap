const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');
const { createAudioProcessor } = require('./helpers/audio-processor-context');

function captureBrowser(options = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const elements = new Map();
  const calls = { requests: [], stopped: 0, closed: 0, alerts: [], intervals: new Set() };
  const settings = options.settings || {
    autoGainControl: false, noiseSuppression: false, echoCancellation: false, sampleRate: 48000,
    deviceId: 'private-device', groupId: 'private-group'
  };
  const track = { getSettings: () => settings, stop() { calls.stopped += 1; } };
  const media = { getTracks: () => [track], getAudioTracks: () => [track] };
  let node;
  let audioContext;
  class AudioContext {
    constructor() {
      audioContext = this;
      this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0;
      this.audioWorklet = options.unsupported ? undefined : { addModule: async (url) => {
        calls.moduleUrl = url;
        if (options.failSetup) throw new Error('AudioWorklet setup failed');
      } };
    }
    async resume() { this.state = 'running'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    async close() { calls.closed += 1; this.state = 'closed'; }
  }
  class AudioWorkletNode {
    constructor(context, name, settings) {
      assert.equal(name, 'noise-level-processor');
      node = this;
      this.port = {
        postMessage: (data) => this.engine.reset(data.generation),
        close() {}, onmessage: null
      };
      this.engine = createAudioProcessor(context.sampleRate,
        (data) => this.port.onmessage?.({ data }), settings.processorOptions);
    }
    connect() {}
    disconnect() {}
  }
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        innerText: '', textContent: '', innerHTML: '', disabled: false, style: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) }
      });
    }
    return elements.get(id);
  }
  // Los listeners de documento se registran de verdad, no como no-op. Sin esto la
  // recuperacion tras una suspension no se puede ni provocar en las pruebas: el
  // helper por defecto se traga el addEventListener y el test pasaria sin haber
  // ejecutado una sola vez el codigo que dice comprobar.
  const documentListeners = new Map();
  const browser = createBrowserContext({
    window: { __ACOUSTIMAP_CONFIG__: {}, AudioContext, AudioWorkletNode },
    document: {
      documentElement: { lang: 'es' },
      getElementById: element,
      visibilityState: 'visible',
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(handler);
      }
    },
    navigator: {
      onLine: true,
      ...(options.wakeLockRequest ? { wakeLock: { request: options.wakeLockRequest } } : {}),
      mediaDevices: {
      getSupportedConstraints: () => ({ autoGainControl: true, noiseSuppression: true, echoCancellation: true }),
        async getUserMedia(constraints) {
          calls.requests.push(constraints);
          if (options.denied) throw new Error('NotAllowedError');
          if (options.pending) await options.pending;
          return media;
        }
      }
    },
    performance: { now: () => now },
    setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    // Los intervalos se guardan con su callback: el sondeo de recuperacion vive en
    // el de updateTimer(), y sin poder dispararlo a mano el test solo podria
    // comprobar el evento, que es la mitadIcono de la garantia.
    setInterval(callback, delay) {
      const id = ++nextTimer;
      calls.intervals.add(id);
      timers.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) { calls.intervals.delete(id); },
    alert: (message) => calls.alerts.push(message),
    sendMeasurementIfDue: async () => {}
  });
  browser.load('config.js', 'audio.js');
  return {
    ...browser, calls, timers, element,
    setMuted(value) { track.muted = value; },
    emitLastReport(overrides = {}) { node.port.onmessage?.({ data: { ...node.engine.messages.at(-1), ...overrides } }); },
    pause(ms) { now += ms; },
    /** Dispara un listener registrado por audio.js sobre document o window. */
    fireDocument(type, extra = {}) {
      const handlers = documentListeners.get(type) || [];
      for (const handler of handlers) handler({ type, ...extra });
      return handlers.length;
    },
    /** Ejecuta el callback del temporizador de la sesion, como si hubiera pasado 1 s. */
    tickTimer() {
      const id = [...calls.intervals][calls.intervals.size - 1];
      const entry = id !== undefined ? timers.get(id) : null;
      if (!entry) return false;
      entry.callback();
      return true;
    },
    advance(ms) {
      let remaining = Math.round(ms * audioContext.sampleRate / 1000);
      while (remaining > 0) {
        const size = Math.min(128, remaining);
        now += size / audioContext.sampleRate * 1000;
        audioContext.currentTime += size / audioContext.sampleRate;
        const start = node.engine.processor.totalFrames;
        node.engine.feed([Float32Array.from({ length: size }, (_, i) =>
          (options.amplitude ?? 0.01) * Math.SQRT2
            * Math.sin(2 * Math.PI * 1000 * (start + i) / audioContext.sampleRate))]);
        remaining -= size;
      }
    }
  };
}

test('captura: solicita desactivar únicamente tratamientos compatibles', () => {
  const browser = captureBrowser();
  const constraints = browser.evaluate('microphoneConstraints({ autoGainControl: true })');
  assert.equal(constraints.audio.autoGainControl.ideal, false);
  assert.equal(Object.hasOwn(constraints.audio, 'noiseSuppression'), false);
  assert.equal(browser.evaluate('microphoneConstraints({}).audio'), true);
});

test('captura: un ajuste solicitado no se considera aplicado sin getSettings', () => {
  const browser = captureBrowser();
  assert.equal(browser.evaluate('classifyCaptureProfile({})'), 'unknown');
  assert.equal(browser.evaluate('classifyCaptureProfile({ autoGainControl: true })'), 'processed');
  assert.equal(browser.evaluate('classifyCaptureProfile({ autoGainControl: false, noiseSuppression: false, echoCancellation: false })'), 'unprocessed');
  assert.equal(browser.evaluate('classifyCaptureProfile({ autoGainControl: false })'), 'unknown');
});

test('RMS: silencio y onda sinusoidal sintética usan la función real', () => {
  const browser = captureBrowser();
  assert.equal(browser.evaluate('calculateRms(new Float32Array(2048))'), 0);
  assert.equal(browser.evaluate('rmsToIndex(0)'), 30);
  const rms = browser.evaluate(`calculateRms(Float32Array.from({ length: 2048 },
    (_, i) => 0.1 * Math.sin(2 * Math.PI * 32 * i / 2048)))`);
  assert.ok(Math.abs(rms - 0.1 / Math.sqrt(2)) < 1e-8);
  assert.equal(browser.evaluate(`rmsToIndex(${rms})`), 77);
});

test('arranque: no presenta ni acumula una ventana incompleta como medición', async () => {
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3000);
  assert.equal(browser.element('db-number').innerText, '--');
  assert.equal(browser.evaluate('session.count'), 0);
  browser.advance(400);
  assert.equal(browser.element('db-number').innerText, 60);
  assert.ok(browser.evaluate('session.count') > 0);
  await browser.evaluate('toggleMonitoring()');
});

test('diagnóstico: índice 95 no implica señal recortada', () => {
  const browser = captureBrowser();
  assert.equal(browser.evaluate('rmsToIndex(0.6)'), 95);
  assert.equal(browser.evaluate('clippingFraction([0.6, -0.6])'), 0);
  assert.equal(browser.evaluate('clippingFraction([1, -1, 0, 0])'), 0.5);
});

test('captura: doble activación no abre dos streams y detener libera los recursos', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const browser = captureBrowser({ pending });
  const first = browser.evaluate('toggleMonitoring()');
  await browser.evaluate('toggleMonitoring()');
  assert.equal(browser.calls.requests.length, 1);
  release();
  await first;
  assert.equal(browser.evaluate('isMonitoring'), true);
  assert.match(browser.calls.moduleUrl, /audio-level-processor\.js/);
  assert.equal(browser.evaluate('captureProfile'), 'unprocessed');
  assert.equal(browser.evaluate("Object.hasOwn(captureSettings, 'deviceId')"), false);
  browser.advance(3400);
  assert.match(browser.element('audio-diagnostics-data').textContent, /L_Aeq \(3 s\):/);
  await browser.evaluate('toggleMonitoring()');
  assert.equal(browser.evaluate('isMonitoring'), false);
  assert.equal(browser.calls.stopped, 1);
  assert.equal(browser.calls.closed, 1);
  // El registro de temporizadores ya no se vacía: el intervalo de sesión guarda
  // su callback para que las pruebas puedan dispararlo a mano. Lo que este test
  // quiere comprobar es que no queda ningún intervalo vivo, y eso lo dice
  // `calls.intervals`, que es el registro que el código usa para limpiar.
  assert.equal(browser.calls.intervals.size, 0);
  assert.equal(browser.element('btn-toggle').disabled, false);
});

test('captura: un fallo de inicialización detiene el micrófono ya concedido', async () => {
  const browser = captureBrowser({ failSetup: true });
  await browser.evaluate('toggleMonitoring()');
  assert.equal(browser.evaluate('isMonitoring'), false);
  assert.equal(browser.calls.stopped, 1);
  assert.equal(browser.calls.closed, 1);
  assert.equal(browser.calls.alerts.length, 1);
  assert.equal(browser.element('btn-toggle').disabled, false);
});

test('captura: permiso denegado deja la interfaz inactiva y permite reintentar', async () => {
  const browser = captureBrowser({ denied: true });
  await browser.evaluate('toggleMonitoring()');
  await browser.evaluate('toggleMonitoring()');
  assert.equal(browser.calls.requests.length, 2);
  assert.equal(browser.evaluate('isMonitoring'), false);
  assert.equal(browser.timers.size, 0);
  assert.equal(browser.element('btn-toggle').disabled, false);
});

test('captura: sin AudioWorklet no sustituye el método ni deja el micrófono abierto', async () => {
  const browser = captureBrowser({ unsupported: true });
  await browser.evaluate('toggleMonitoring()');
  assert.equal(browser.evaluate('isMonitoring'), false);
  assert.equal(browser.calls.stopped, 1);
  assert.equal(browser.calls.closed, 1);
  assert.match(browser.calls.alerts[0], /AudioWorklet/);
});

test('medidor: mensajes repetidos, antiguos o no finitos no inventan muestras', async () => {
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  const before = browser.evaluate('session.count');
  browser.emitLastReport();
  browser.emitLastReport({ generation: -1, endTime: 2 });
  browser.emitLastReport({ rms: NaN, endTime: 2 });
  browser.emitLastReport({ aDbfs: NaN, endTime: 5 });
  browser.emitLastReport({ peakDbfs: Infinity, endTime: 5 });
  assert.equal(browser.evaluate('session.count'), before);
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: suspender el contexto pausa la acumulación y exige señal nueva', async () => {
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  const before = browser.evaluate('session.count');
  browser.evaluate("audioCtx.state = 'suspended'");
  browser.advance(200);
  assert.equal(browser.evaluate('session.count'), before);
  assert.equal(browser.element('db-number').innerText, '--');
  browser.evaluate("audioCtx.state = 'running'");
  browser.advance(3000);
  assert.equal(browser.evaluate('session.count'), before);
  browser.advance(200);
  assert.ok(browser.evaluate('session.count') > before);
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: un track silenciado no se registra como ambiente silencioso', async () => {
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  const before = browser.evaluate('session.count');
  browser.setMuted(true);
  browser.advance(200);
  assert.equal(browser.evaluate('session.count'), before);
  assert.equal(browser.element('db-number').innerText, '--');
  browser.setMuted(false);
  browser.advance(3400);
  assert.ok(browser.evaluate('session.count') > before);
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: una suspensión no reutiliza la ventana anterior', async () => {
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  // Se siembra energia, no una suma de dB: el acumulador guarda 10^dB/10. Con
  // cantidad 10 y energia 900 el promedio daria 19.5 dB, fuera del rango 30-95 que
  // acepta la base, que es justo lo que hacia el dato anterior.
  browser.evaluate('sendWindowEnergia = 900; sendWindowCount = 10');
  browser.advance(3400);
  browser.pause(2000);
  browser.advance(200);
  assert.equal(browser.evaluate('sendWindowCount'), 0);
  browser.advance(3200);
  assert.equal(browser.evaluate('sendWindowCount'), 1);
  // La amplitud del doble de prueba da indice 60, y energia(60) = 10^6.
  assert.equal(Math.round(browser.evaluate('sendWindowEnergia')), 1000000);
  assert.equal(browser.evaluate('Math.round(promedioEnergetico(sendWindowEnergia, sendWindowCount))'), 60);
  await browser.evaluate('toggleMonitoring()');
});

test('sesión: guarda versión y perfil, no audio ni identificadores del micrófono', async () => {
  const browser = captureBrowser();
  const sent = [];
  browser.context.client = { from: (table) => ({ insert: async (payload) => {
    assert.equal(table, 'noise_sessions');
    sent.push(payload);
    return { error: null };
  } }) };
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  browser.evaluate('supabaseClient = client; sharingEnabled = true; currentPosition = { lat: 8.75, lng: -75.88 }');
  await browser.evaluate('toggleMonitoring()');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].measurement_version, 5);
  assert.equal(sent[0].capture_profile, 'unprocessed');
  assert.equal(Object.hasOwn(sent[0], 'client_id'), false);
  assert.equal(JSON.stringify(sent).includes('private-device'), false);
  assert.equal(Object.hasOwn(sent[0], 'audio'), false);
});

test('diagnóstico: tratamientos activos y aviso de recorte se muestran en los tres idiomas', async () => {
  const browser = captureBrowser({ settings: { autoGainControl: true }, amplitude: 1 });
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  assert.equal(browser.evaluate('captureProfile'), 'processed');
  assert.match(browser.element('audio-quality-warning').textContent, /límite digital/);
  for (const [language, title] of [['es', 'Diagnóstico'], ['en', 'diagnostics'], ['pt', 'Diagnóstico']]) {
    browser.context.document.documentElement.lang = language;
    browser.evaluate('updateAudioDiagnostics()');
    assert.ok(browser.element('audio-diagnostics-title').textContent.includes(title));
  }
  await browser.evaluate('toggleMonitoring()');
});

test('diagnóstico: un pico breve mantiene el aviso sin borrar la lectura', async () => {
  const options = { amplitude: 0.01 };
  const browser = captureBrowser(options);
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  const before = browser.evaluate('session.count');
  options.amplitude = 1;
  browser.advance(50);
  options.amplitude = 0.01;
  browser.advance(200);
  assert.match(browser.element('audio-quality-warning').textContent, /límite digital/);
  assert.equal(browser.evaluate('session.count'), before + 1);
  browser.advance(3400);
  assert.doesNotMatch(browser.element('audio-quality-warning').textContent, /límite digital/);
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: señal digital y tratamiento son visibles, sin avisos de recorte falsos', async () => {
  const browser = captureBrowser({ settings: { autoGainControl: true }, amplitude: 0.01 });
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  assert.equal(browser.element('audio-quality-warning').textContent, '');
  assert.match(browser.element('audio-capture-note').textContent, /tratamientos activos/);
  assert.match(browser.element('audio-processing-warning').textContent, /Tratamientos activos/);
  assert.match(browser.element('audio-signal-reading').textContent, /-40\.0 dBFS/);
  assert.equal(browser.element('db-status-text').innerText, 'Moderado');
  for (const [language, word] of [['es', 'Sin calibrar'], ['en', 'Uncalibrated'], ['pt', 'Sem calibração']]) {
    browser.context.document.documentElement.lang = language;
    browser.evaluate('updateAudioDiagnostics()');
    assert.equal(browser.element('measurement-caveat').textContent, word);
    assert.equal(browser.element('audio-quality-warning').textContent, '');
    assert.ok(browser.element('measurement-guidance').textContent.length > 0);
  }
  await browser.evaluate('toggleMonitoring()');
  assert.match(browser.element('audio-signal-reading').textContent, /sem leitura/);
  assert.equal(browser.element('audio-processing-warning').textContent, '');
});

test('interfaz: el diagnóstico existe sin crear un segundo flujo de captura', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['audio-diagnostics-title', 'audio-diagnostics-data', 'audio-quality-warning', 'measurement-guidance', 'measurement-method-note']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});

test('medidor: una suspension del navegador se recupera sola, sin tocar nada', async () => {
  // El fallo que motiva este test, medido en Chromium con microfono simulado:
  // al suspender el AudioContext, isMonitoring seguia en true, el boton decia
  // «Detener» y el estado «Midiendo», pero la lectura se congelaba y a los dos
  // segundos volvia a «Tomando señal…» para siempre. Sin errores de consola: el
  // fallo era mudo. Lo unico que lo resolvia era un resume() a mano.
  //
  // Se comprueba por el sondeo del temporizador, que es la garantia y no el
  // atajo: el evento visibilitychange es la via rapida, pero hay suspensiones
  // que no lo emiten.
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  assert.equal(browser.evaluate('audioCtx.state'), 'running');
  const muestrasAntes = browser.evaluate('session.count');
  assert.ok(muestrasAntes > 0, 'hubo lectura antes de suspender');

  // El navegador suspende el contexto: la pista sigue viva, los permisos siguen.
  browser.evaluate("audioCtx.state = 'suspended'");
  browser.advance(2000);
  assert.equal(browser.element('db-number').innerText, '--');
  assert.equal(browser.element('db-status-text').innerText, 'Tomando señal…');

  // El usuario vuelve a la pestaña. No pulsa nada: solo el temporizador.
  assert.equal(browser.tickTimer(), true, 'el temporizador de sesión está vivo');
  await browser.evaluate('Promise.resolve()');
  assert.equal(browser.evaluate('audioCtx.state'), 'running',
    'el contexto se reanuda solo, sin que nadie llame a resume() a mano');
  assert.equal(browser.evaluate('isMonitoring'), true, 'la sesión no se cae');

  browser.advance(3400);
  assert.ok(browser.evaluate('session.count') > muestrasAntes,
    'vuelve a haber lecturas después de la suspensión');
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: reanudar descarta la ventana anterior, no la suma a la sesión', async () => {
  // Reanudar sin descartar contaría los segundos en silencio como si fueran
  // mediciones, que es justo lo que el resto de la app dice evitar. La
  // generacion del worklet es lo que lo impide: al reiniciar la ventana sube, y
  // los mensajes de la ventana vieja dejan de contar.
  const browser = captureBrowser();
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  const generacionAntes = browser.evaluate('meterGeneration');
  const muestrasAntes = browser.evaluate('session.count');

  browser.evaluate("audioCtx.state = 'suspended'");
  browser.advance(2000);
  browser.evaluate('sendWindowSum = 900; sendWindowCount = 10');
  browser.tickTimer();
  await browser.evaluate('Promise.resolve()');

  assert.notEqual(browser.evaluate('meterGeneration'), generacionAntes,
    'reanudar sube la generación');
  assert.equal(browser.evaluate('sendWindowCount'), 0,
    'la ventana de envío empieza a cero, no con lo acumulado antes de suspender');

  // Un mensaje con la generación anterior no cuenta para nada.
  browser.advance(200);
  browser.emitLastReport({ generation: generacionAntes });
  assert.equal(browser.evaluate('session.count'), muestrasAntes,
    'un mensaje de la ventana anterior se descarta');
  await browser.evaluate('toggleMonitoring()');
});

test('medidor: volver a la pestaña pide el wake lock otra vez', async () => {
  // El navegador libera el wake lock al ocultar la pestaña y lo pone a null. Sin
  // volver a pedirlo, la pantalla se apaga durante la medicion y eso vuelve a
  // suspender el contexto: un bucle que el usuario no puede cerrar porque no sabe
  // que existe.
  const pedidos = [];
  const browser = captureBrowser({
    wakeLockRequest: async () => { pedidos.push('pedido'); return { release() { pedidos.push('liberado'); } }; }
  });
  await browser.evaluate('toggleMonitoring()');
  browser.advance(3400);
  assert.equal(pedidos.length, 1, 'se pide al arrancar');
  pedidos.length = 0;

  assert.equal(browser.fireDocument('visibilitychange', { visibilityState: 'visible' }), 1,
    'audio.js escucha visibilitychange');
  await browser.evaluate('Promise.resolve()');
  assert.deepEqual(pedidos, ['pedido'], 'al volver a verse se vuelve a pedir');
  await browser.evaluate('toggleMonitoring()');
});
