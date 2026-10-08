/**
 * audio.js
 * Captura de micrófono, índice relativo de ruido y resumen de sesión.
 * Depende de: config.js. Llama a sendMeasurementIfDue() (community.js).
 */

// Hereda la misma versión de caché que audio.js sin otro contador manual.
const AUDIO_PROCESSOR_URL = typeof document !== 'undefined' && document.currentScript?.src
  ? document.currentScript.src.replace(/audio\.js(?=\?|$)/, 'audio-level-processor.js') : 'js/audio-level-processor.js';
let levelProcessor = null;
let meterGeneration = 0;
let audioChanging = false;
let lastMeterTime = null;
let lastAudioTime = null;
let captureSettings = null;
let audioDiagnostics = null;
let clippingWarningUntil = 0;

/** Preferencias, no requisitos obligatorios: no bloquean navegadores limitados. */
function microphoneConstraints(supported = {}) {
  const audio = {};
  for (const key of ['autoGainControl', 'noiseSuppression', 'echoCancellation']) {
    if (supported[key]) audio[key] = { ideal: false };
  }
  return { audio: Object.keys(audio).length ? audio : true };
}

/** No guardamos deviceId, groupId, nombre del dispositivo ni audio. */
function readCaptureSettings(track) {
  const settings = track?.getSettings?.() || {};
  return Object.fromEntries(['autoGainControl', 'noiseSuppression', 'echoCancellation', 'sampleRate']
    .map((key) => [key, settings[key]]));
}

function classifyCaptureProfile(settings) {
  const flags = ['autoGainControl', 'noiseSuppression', 'echoCancellation'].map((key) => settings[key]);
  if (flags.some((value) => value === true)) return 'processed';
  return flags.every((value) => value === false) ? 'unprocessed' : 'unknown';
}

function calculateRms(samples) {
  if (!samples.length) return 0;
  let energy = 0;
  for (const value of samples) energy += value * value;
  return Math.sqrt(energy / samples.length);
}

/** Escala relativa dBFS + 100; el worklet ya ha ponderado el espectro. Sin calibrar. */
function weightedDbToIndex(dbfs) {
  return Math.min(95, Math.max(30, Math.round(dbfs + 100)));
}

/** Conversión del RMS sin ponderar, conservada para diagnóstico y pruebas. */
function rmsToIndex(rms) {
  const dbfs = 20 * Math.log10(Math.max(Number.isFinite(rms) ? rms : 0, 1e-6));
  return weightedDbToIndex(dbfs);
}

/** Aproximación al límite digital; un índice 95 no demuestra recorte de audio. */
function clippingFraction(samples) {
  if (!samples.length) return 0;
  let clipped = 0;
  for (const value of samples) if (Math.abs(value) >= 0.99) clipped += 1;
  return clipped / samples.length;
}

const diagnosticCopy = {
  es: { title: 'Diagnóstico del micrófono', help: 'No tapes ni roces el micrófono, y evita hablarle de cerca o con viento directo.', idle: 'Activa el micrófono para comprobar los ajustes.', gain: 'Ganancia automática', noise: 'Reducción de ruido', echo: 'Cancelación de eco', on: 'activa', off: 'desactivada', unknown: 'no verificable', rate: 'Muestreo', version: 'Método', clean: 'Tratamientos del navegador desactivados; el micrófono sigue sin calibrar.', processed: 'El navegador mantiene tratamientos activos: pueden modificar el índice.', uncertain: 'No se pudieron verificar todos los tratamientos: pueden modificar el índice.', clipped: 'Señal próxima al límite digital. Aleja la fuente y evita soplar o rozar el micrófono.', history: 'Mapa y estadísticas: solo método v5. El histórico anterior se conserva por separado.', allow: 'Publicar igualmente (calidad reducida)' },
  en: { title: 'Microphone diagnostics', help: 'Do not cover or rub the microphone, and avoid close speech or direct wind.', idle: 'Enable the microphone to check its settings.', gain: 'Automatic gain', noise: 'Noise suppression', echo: 'Echo cancellation', on: 'enabled', off: 'disabled', unknown: 'unverified', rate: 'Sampling', version: 'Method', clean: 'Browser processing disabled; the microphone is still uncalibrated.', processed: 'Browser processing is active and may change the index.', uncertain: 'Not all processing settings could be verified; they may change the index.', clipped: 'Signal near the digital limit. Move the source away and avoid blowing on or rubbing the microphone.', history: 'Map and statistics: v5 only. Earlier history is kept separately.', allow: 'Publish anyway (reduced quality)' },
  pt: { title: 'Diagnóstico do microfone', help: 'Não cubra nem esfregue o microfone, e evite falar de perto ou com vento direto.', idle: 'Ative o microfone para verificar os ajustes.', gain: 'Ganho automático', noise: 'Redução de ruído', echo: 'Cancelamento de eco', on: 'ativo', off: 'desativado', unknown: 'não verificável', rate: 'Amostragem', version: 'Método', clean: 'Tratamentos do navegador desativados; o microfone continua sem calibração.', processed: 'O navegador mantém tratamentos ativos: podem modificar o índice.', uncertain: 'Não foi possível verificar todos os tratamentos: podem modificar o índice.', clipped: 'Sinal próximo ao limite digital. Afaste a fonte e evite soprar ou esfregar o microfone.', history: 'Mapa e estatísticas: apenas método v5. O histórico anterior é mantido separadamente.', allow: 'Publicar mesmo assim (qualidade reduzida)' }
};

/**
 * Autoriza publicar pese al procesado del navegador.
 *
 * No cambia la medición ni la fórmula: solo levanta el filtro de calidad que
 * impide enviar cuando el navegador confirma ganancia automática o supresión
 * de ruido. El usuario asume la limitación de forma explícita.
 */
function setForceProcessedPublish(value) {
  forceProcessedPublish = Boolean(value);
  updateAudioDiagnostics();
}

function updateAudioDiagnostics() {
  const copy = diagnosticCopy[document.documentElement.lang] || diagnosticCopy.es;
  const setText = (id, text) => {
    const element = document.getElementById(id);
    if (element && element.textContent !== text) element.textContent = text;
  };
  setText('audio-diagnostics-title', copy.title);
  /*
   * El aviso de debajo del número.
   *
   * Eran cuatro datos en una línea: «Sin calibrar · 1 s · no son dB». Tres de ellos
   * se han ido a `mic-detail`, que está oculto, y aquí queda el único que cambia lo
   * que alguien haría con el número. La ventana de un segundo es un detalle del
   * método, y «no son dB» contradecía la unidad que ahora lleva el número delante:
   * decir las dos cosas a la vez hace que el lector se quede con la que le suena y
   * descarte la que no.
   *
   * Lo que sí se conserva aquí es el aviso de recorte, porque ese cambia una
   * lectura concreta: con la señal al límite digital el número no describe el ruido.
   */
  const compact = {
    es: { caveat: 'Sin calibrar', help: 'Cómo medir', peak: 'Señal cerca del límite digital' },
    en: { caveat: 'Uncalibrated', help: 'How to measure', peak: 'Signal near the digital limit' },
    pt: { caveat: 'Sem calibração', help: 'Como medir', peak: 'Sinal perto do limite digital' }
  }[document.documentElement.lang] || { caveat: 'Sin calibrar', help: 'Cómo medir', peak: 'Señal cerca del límite digital' };
  setText('measurement-guidance', copy.help);
  setText('measurement-caveat', compact.caveat);
  // Promedio digital ponderado y máximo espectral reciente, no un Lmax certificado.
  const signalCopy = {
    es: { idle: 'Señal del micrófono: sin lectura', ready: 'Ponderado A', peak: 'pico', limit: 'Índice en su límite; no demuestra ruido extremo', processed: 'Tratamientos activos', unknown: 'Tratamientos no verificables' },
    en: { idle: 'Microphone signal: no reading', ready: 'A-weighted', peak: 'peak', limit: 'Index at its limit; does not prove extreme noise', processed: 'Processing enabled', unknown: 'Processing unverified' },
    pt: { idle: 'Sinal do microfone: sem leitura', ready: 'Ponderação A', peak: 'pico', limit: 'Índice no limite; não comprova ruído extremo', processed: 'Tratamentos ativos', unknown: 'Tratamentos não verificáveis' }
  }[document.documentElement.lang] || { idle: 'Señal del micrófono: sin lectura', ready: 'Ponderado A', peak: 'pico', limit: 'Índice en su límite; no demuestra ruido extremo', processed: 'Tratamientos activos', unknown: 'Tratamientos no verificables' };
  const pico = audioDiagnostics && Number.isFinite(audioDiagnostics.peakDbfs)
    && Number.isFinite(audioDiagnostics.dbfs)
    && audioDiagnostics.peakDbfs - audioDiagnostics.dbfs > 0.5
    ? ` · ${signalCopy.peak} +${(audioDiagnostics.peakDbfs - audioDiagnostics.dbfs).toFixed(0)}`
    : '';
  setText('audio-signal-reading', isMonitoring && audioDiagnostics?.ready
    ? `${signalCopy.ready}: ${audioDiagnostics.dbfs.toFixed(1)} dBFS${pico}${audioDiagnostics.index === 95 ? ` · ${signalCopy.limit}` : ''}` : signalCopy.idle);
  setText('audio-processing-warning', isMonitoring && captureProfile !== 'unprocessed'
    ? signalCopy[captureProfile === 'processed' ? 'processed' : 'unknown'] : '');
  setText('measurement-help-title', compact.help);
  setText('measurement-method-note', copy.history);
  /*
   * Autorización del usuario para publicar pese al procesado.
   *
   * Solo aparece cuando el navegador confirma que procesa el audio y hay medición
   * activa. No se activa sola: es una decisión consciente con la limitación dicha.
   */
  const allowLabel = document.getElementById('allow-processed-label');
  const allowText = document.getElementById('allow-processed-text');
  if (allowText) allowText.textContent = copy.allow;
  if (allowLabel) allowLabel.hidden = captureProfile !== 'processed' || !isMonitoring;
  const allowInput = document.getElementById('allow-processed-publish');
  if (allowInput && allowInput.checked !== forceProcessedPublish) allowInput.checked = forceProcessedPublish;
  if (!captureSettings || !isMonitoring) {
    setText('audio-diagnostics-data', copy.idle);
    setText('audio-quality-warning', '');
    setText('audio-capture-note', '');
    return;
  }
  const flag = (value) => value === false ? copy.off : value === true ? copy.on : copy.unknown;
  const lines = [
    `${copy.version}: v${MEASUREMENT_VERSION}`,
    `${copy.gain}: ${flag(captureSettings.autoGainControl)}`,
    `${copy.noise}: ${flag(captureSettings.noiseSuppression)}`,
    `${copy.echo}: ${flag(captureSettings.echoCancellation)}`,
    `${copy.rate}: ${captureSettings.sampleRate || audioCtx?.sampleRate || copy.unknown} Hz`
  ];
  if (audioDiagnostics) {
    if (audioDiagnostics.ready) {
      lines.push(`L_Aeq (${Math.round((audioDiagnostics.windowMs ?? 3000) / 100) / 10} s): ${audioDiagnostics.dbfs.toFixed(1)} dBFS · pico: ${audioDiagnostics.peakDbfs.toFixed(1)} dBFS · ${audioDiagnostics.index}`);
    } else lines.push(meterText('collecting'));
  }
  setText('audio-diagnostics-data', lines.join('\n'));
  setText('audio-quality-warning', audioDiagnostics?.clippingRecently ? compact.peak : '');
  setText('audio-capture-note', audioDiagnostics?.clippingRecently
    ? copy.clipped : captureProfile === 'unprocessed' ? copy.clean
      : captureProfile === 'processed' ? copy.processed : copy.uncertain);
}

async function releaseAudioCapture() {
  meterGeneration++;
  if (levelProcessor) {
    levelProcessor.port.onmessage = null;
    levelProcessor.onprocessorerror = null;
    levelProcessor.port.close();
    levelProcessor.disconnect();
  }
  levelProcessor = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (microphone) {
    try { microphone.disconnect(); } catch (error) { console.warn('No se pudo desconectar la entrada:', error); }
  }
  microphone = null;
  const context = audioCtx;
  audioCtx = null;
  lastMeterTime = null;
  lastAudioTime = null;
  if (context && context.state !== 'closed') {
    try { await context.close(); } catch (error) { console.warn('No se pudo cerrar AudioContext:', error); }
  }
}

function resetMonitoringUi() {
  document.getElementById('stats-panel').classList.remove('monitoring');
  const btn = document.getElementById('btn-toggle');
  btn.classList.remove('active');
  btn.innerHTML = `<span class="action-icon">${actionIconMarkup('mic')}</span><span class="action-text">${meterText('activate')}</span>`;
  document.getElementById('status-badge').classList.remove('active');
  document.getElementById('pulse-dot').style.display = 'none';
  document.getElementById('status-text').innerText = meterText('idle');
  document.getElementById('db-number').innerText = '--';
  document.getElementById('db-bar').style.width = '0%';
  document.getElementById('db-status-text').innerText = meterText('start');
  document.getElementById('db-status-text').className = 'db-status';
  updateAudioDiagnostics();
}

const meterCopy = {
  es: { stop: 'Detener', activate: 'Medir', measuring: 'Midiendo', idle: 'Inactivo', denied: 'No se pudo iniciar el micrófono. Revisa el permiso y usa un navegador compatible con AudioWorklet.', collecting: 'Tomando señal…', start: 'Sin medir', noData: 'Sin datos', low: 'Bajo', moderate: 'Moderado', high: 'Alto', lowIndex: 'Bajo', moderateIndex: 'Moderado', highIndex: 'Alto' },
  en: { stop: 'Stop', activate: 'Measure', measuring: 'Measuring', idle: 'Inactive', denied: 'Could not start the microphone. Check permission and use a browser supporting AudioWorklet.', collecting: 'Reading signal…', start: 'Not measuring', noData: 'No data', low: 'Low', moderate: 'Moderate', high: 'High', lowIndex: 'Low', moderateIndex: 'Moderate', highIndex: 'High' },
  pt: { stop: 'Parar', activate: 'Medir', measuring: 'Medindo', idle: 'Inativo', denied: 'Não foi possível iniciar o microfone. Verifique a permissão e use um navegador compatível com AudioWorklet.', collecting: 'Lendo sinal…', start: 'Sem medir', noData: 'Sem dados', low: 'Baixo', moderate: 'Moderado', high: 'Alto', lowIndex: 'Baixo', moderateIndex: 'Moderado', highIndex: 'Alto' }
};

function meterText(key) {
  return (meterCopy[document.documentElement.lang] || meterCopy.es)[key];
}

// ============================================
// TOGGLE MICRÓFONO
// ============================================
async function toggleMonitoring() {
  if (audioChanging) return;
  audioChanging = true;
  const btn        = document.getElementById('btn-toggle');
  const badge      = document.getElementById('status-badge');
  const pulse      = document.getElementById('pulse-dot');
  const statusText = document.getElementById('status-text');

  btn.disabled = true;
  try {
    if (!isMonitoring) {
      try {
        const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
        stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(supported));
        const track = stream.getAudioTracks()[0];
        captureSettings = readCaptureSettings(track);
        captureProfile = classifyCaptureProfile(captureSettings);
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        if (!audioCtx.audioWorklet || typeof window.AudioWorkletNode !== 'function') {
          throw new Error('AudioWorklet no disponible: no se sustituye por lecturas discontinuas.');
        }
        await audioCtx.audioWorklet.addModule(AUDIO_PROCESSOR_URL);
        levelProcessor = new window.AudioWorkletNode(audioCtx, 'noise-level-processor', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { generation: ++meterGeneration }
        });
        levelProcessor.port.onmessage = ({ data }) => updateMeter(data);
        levelProcessor.onprocessorerror = () => {
          console.error('Se interrumpió el procesador de audio.');
          if (isMonitoring) toggleMonitoring().catch((error) => console.warn(error));
        };
        microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(levelProcessor);
        levelProcessor.connect(audioCtx.destination);
        lastMeterTime = null;
        lastAudioTime = null;
        audioDiagnostics = null;
        clippingWarningUntil = 0;
        if (track.readyState === 'ended') throw new Error('El micrófono se desconectó al iniciar.');
        track.addEventListener?.('ended', () => {
          if (isMonitoring && stream?.getAudioTracks().includes(track)) {
            toggleMonitoring().catch((error) => console.warn(error));
          }
        }, { once: true });

        isMonitoring = true;
        document.getElementById('stats-panel').classList.add('monitoring');
        btn.classList.add('active');
        btn.innerHTML = `<span class="action-icon">${actionIconMarkup('stop')}</span><span class="action-text">${meterText('stop')}</span>`;
        badge.classList.add('active');
        pulse.style.display = 'inline-block';
        statusText.innerText = meterText('measuring');

        startSession();
        showMeterCollecting();
        updateAudioDiagnostics();
        await requestWakeLock();
      } catch (err) {
        isMonitoring = false;
        stopSession();
        await releaseAudioCapture();
        releaseWakeLock();
        resetMonitoringUi();
        console.error(err);
        alert(meterText('denied'));
      }
    } else {
      isMonitoring = false;
      stopSession();
      await releaseAudioCapture();
      releaseWakeLock();
      resetMonitoringUi();
      await saveSessionSummary();
    }
  } finally {
    btn.disabled = false;
    audioChanging = false;
    if (typeof updateActionButtons === 'function') updateActionButtons();
  }
}

// ============================================
// SESIÓN
// ============================================
function startSession() {
  stopSession();
  session = {
    /*
     * `energia`, no `sum`.
     *
     * Antes guardaba la suma de los dB de cada lectura. Sumar dB no es sumar nada:
     * los dB son logaritmicos, de modo que la media aritmetica de una serie de dB
     * no es un nivel, es un promedio de numeros que ya son logaritmos. Se guarda la
     * energia (10^dB/10) y se vuelve a logaritmo al promediar; la razon esta en
     * `promedioEnergetico()`, en config.js, con la medicion del error que pasaba
     * inadvertido porque en una senal constante las dos medias coinciden.
     */
    energia: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
    startTime: Date.now(),
    timerId: null
  };
  sendWindowEnergia = 0;
  sendWindowCount = 0;
  lastSendTime = Date.now();
  updateAvgUI();
  document.getElementById('avg-time').innerText = '00:00';

  session.timerId = setInterval(updateTimer, 1000);
}

function stopSession() {
  if (session.timerId) clearInterval(session.timerId);
  session.timerId = null;
}

/**
 * Recupera la captura cuando el navegador la ha suspendido.
 *
 * ## Por qué hace falta
 *
 * `AudioContext` se suspende solo: Chrome lo hace al ocultar la pestaña, al bloquear
 * la pantalla y, en móvil, al entrar en otra app. Ninguna de esas cosas es un fallo
 * del micrófono — la pista sigue viva y los permisos siguen concedidos— pero el
 * grafo deja de recibir muestras, y con él desaparece el `postMessage` del worklet.
 *
 * Sin esto la aplicación quedaba **atascada**: `isMonitoring` seguía en `true`, el
 * botón decía «Detener» y el estado «Midiendo», pero el número se congelaba en la
 * última lectura y a los dos segundos volvía a «Tomando señal…» para siempre. Lo
 * único que la sacaba de ahí era un `resume()` manual desde la consola.
 *
 * Medido con un micrófono simulado, suspendiendo el contexto a mano: tras 4 s el
 * número era `--`, el estado «Tomando señal…», y un `visibilitychange` no lo
 * cambiaba porque **nadie escuchaba ese evento** en todo el código. Sólo un
 * `audioCtx.resume()` a mano devolvía la lectura.
 *
 * ## Por qué no basta con escuchar `visibilitychange`
 *
 * Porque no es el único motivo y porque el evento no siempre llega. La suspensión por
 * bloqueo de pantalla no pasa por `visibilitychange` en todas las plataformas, y en
 * algunos navegadores el contexto se reanuda solo sin que se emita nada. Por eso el
 * `setInterval` de `startSession()` sondea el estado cada segundo: el evento pone la
 * recuperación en marcha de inmediato y el sondeo la garantiza.
 *
 * ## Por qué la comprobación de los datos acumulados
 *
 * Al reanudar, el worklet puede entregar una ventana que mezcla lo grabado antes de
 * la suspensión con lo de después. `resetMeterWindow()` descarta esa ventana y sube
 * `meterGeneration`, así que el siguiente mensaje llega con la generación nueva y
 * empieza a contar de cero. Sin esto, el resumen de la sesión sumaría segundos
 * silenciosos como si fueran mediciones: es justo el fallo que los datos acumulados
 * de la app dice evitar.
 *
 * ## El wake lock también se pierde
 *
 * El navegador lo libera al ocultar la pestaña, y `releaseWakeLock()` lo limpia
 * dejándolo en `null`. Sin volver a pedirlo, la pantalla se apaga durante la medición
 * y con ella se suspende el contexto otra vez — un bucle que el usuario no puede
 * cerrar, porque no sabe que existe. Se vuelve a pedir aquí, y por el mismo motivo
 * que el audio: si no hay segundo aviso, no hay error visible.
 */
async function resumeCaptureIfSuspended() {
  if (!isMonitoring || !audioCtx || audioCtx.state === 'running') return;
  try {
    await audioCtx.resume();
    if (audioCtx.state === 'running') resetMeterWindow();
  } catch (error) {
    // Un fallo aquí no apaga la sesión: el contexto puede seguir suspendido y el
    // sondeo del temporizador volverá a intentarlo en un segundo.
    console.warn('No se pudo reanudar la captura de audio:', error);
  }
}

/**
 * `visibilitychange` es la vía rápida; el sondeo de `updateTimer` es la garantía.
 *
 * El registro va dentro de la guarda por una razón concreta: `audio.js` se carga
 * también en contextos de prueba sin `document`, que es donde vive la fórmula del
 * índice. Con el `addEventListener` en el nivel superior —que es donde lo empezaría
 * cualquiera— esos contextos lanzan `ReferenceError` al cargar el fichero y el
 * fallo aparece como un test que se cae entero, sin señalar la línea. La comprobación
 * del lado del navegador es la que corresponde: en un navegador `document` siempre
 * existe, y si algún día no existiera no hay medición que recuperar.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' && isMonitoring) {
      requestWakeLock();
      resumeCaptureIfSuspended();
    }
  });
}

function updateTimer() {
  if (!isMonitoring) return;
  // Sondeo de seguridad: cubre la suspensión por bloqueo de pantalla y cualquier
  // caso en el que el evento no llegue.
  resumeCaptureIfSuspended();
  if (lastMeterTime !== null && performance.now() - lastMeterTime > 1000) {
    lastMeterTime = performance.now();
    resetMeterWindow();
  }
  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  document.getElementById('avg-time').innerText = `${mm}:${ss}`;
}

function updateAvgUI() {
  const avgEl = document.getElementById('avg-number');
  const tagEl = document.getElementById('avg-tag');
  const minEl = document.getElementById('min-db');
  const maxEl = document.getElementById('max-db');
  const cntEl = document.getElementById('sample-count');

  if (session.count === 0) {
    avgEl.innerText = '--';
    tagEl.innerText = meterText('noData');
    tagEl.className = 'avg-tag';
    minEl.innerText = '--';
    maxEl.innerText = '--';
    cntEl.innerText = '0';
    return;
  }

  const avg = Math.round(promedioEnergetico(session.energia, session.count));
  avgEl.innerText = avg;

  const cat = classifyDb(avg);
  tagEl.innerText = cat === 'bajo' ? meterText('lowIndex') : cat === 'moderado' ? meterText('moderateIndex') : meterText('highIndex');
  tagEl.className = 'avg-tag ' + cat;

  minEl.innerText = session.min;
  maxEl.innerText = session.max;
  cntEl.innerText = session.count;
}

// ============================================
// GUARDAR RESUMEN DE SESIÓN EN SUPABASE
// ============================================
async function saveSessionSummary() {
  if (session.count === 0) return;
  if (!sharingEnabled) return;
  if (!currentPosition) return;

  const avg = Math.round(promedioEnergetico(session.energia, session.count));
  const category = classifyDb(avg);
  const snapped = snapToGrid(currentPosition.lat, currentPosition.lng);

  const sessionData = {
    id: crypto.randomUUID(),
    latitude:     snapped.lat,
    longitude:    snapped.lng,
    avg_db:       avg,
    category:     category,
    measurement_version: MEASUREMENT_VERSION,
    capture_profile: captureProfile,
    sample_count: session.count,
    start_time:   new Date(session.startTime).toISOString(),
    end_time:     new Date().toISOString()
  };

  try {
    if (!supabaseClient && typeof enqueueOfflineRecord === 'function') {
      await enqueueOfflineRecord('noise_sessions', sessionData);
      return;
    }
    if (!navigator.onLine && typeof enqueueOfflineRecord === 'function') {
      await enqueueOfflineRecord('noise_sessions', sessionData);
      return;
    }
    const { error } = await supabaseClient
      .from('noise_sessions')
      .insert(sessionData);

    if (error) {
      console.warn('No se pudo guardar el resumen de sesión:', error.message);
      if ((typeof isOfflineError === 'function' ? isOfflineError(error) : !navigator.onLine) && typeof enqueueOfflineRecord === 'function') await enqueueOfflineRecord('noise_sessions', sessionData);
    } else {
      console.log('✅ Resumen de sesión guardado:', sessionData);
    }
  } catch (err) {
    console.warn('Error al guardar resumen de sesión:', err);
    if ((typeof isOfflineError === 'function' ? isOfflineError(err) : !navigator.onLine) && typeof enqueueOfflineRecord === 'function') await enqueueOfflineRecord('noise_sessions', sessionData);
  }
}

// ============================================
// MEDIDOR EN TIEMPO REAL
// ============================================
function showMeterCollecting() {
  document.getElementById('db-number').innerText = '--';
  document.getElementById('db-bar').style.width = '0%';
  const status = document.getElementById('db-status-text');
  status.className = 'db-status';
  status.innerText = meterText('collecting');
}

function resetMeterWindow() {
  levelProcessor?.port.postMessage({ type: 'reset', generation: ++meterGeneration });
  lastAudioTime = null;
  sendWindowEnergia = 0;
  sendWindowCount = 0;
  lastSendTime = Date.now();
  clippingWarningUntil = 0;
  audioDiagnostics = null;
  showMeterCollecting();
  updateAudioDiagnostics();
}

function updateMeter(data) {
  if (!isMonitoring || data?.type !== 'level' || data.generation !== meterGeneration) return;
  if (!Number.isFinite(data.rms) || data.rms < 0 || !Number.isFinite(data.aDbfs)
    || !Number.isFinite(data.peakDbfs) || !Number.isFinite(data.endTime)) return;
  if (lastAudioTime !== null && data.endTime <= lastAudioTime) return;
  const now = performance.now();
  const elapsed = lastMeterTime === null ? 0 : now - lastMeterTime;
  lastMeterTime = now;
  // No reproducir como mediciones nuevas los mensajes acumulados al suspender.
  if (elapsed > 1000 || audioCtx.currentTime - data.endTime > 0.5 || audioCtx.state !== 'running'
    || stream?.getAudioTracks()[0]?.muted) {
    resetMeterWindow();
    return;
  }
  lastAudioTime = data.endTime;
  if (data.clippedFraction > 0) clippingWarningUntil = now + 1000;

  const aDbfs = data.aDbfs;
  const peakDbfs = data.peakDbfs;
  const db = weightedDbToIndex(aDbfs);
  audioDiagnostics = {
    ready: data.ready,
    rms: data.rms,
    dbfs: aDbfs,
    peakDbfs,
    index: db,
    windowMs: data.windowMs,
    clippedFraction: data.clippedFraction,
    clippingRecently: now < clippingWarningUntil
  };
  updateAudioDiagnostics();
  // Esperar 3 s de espectros nuevos. Los golpes reales contribuyen por su duración;
  // el promedio no debe confundirse con el máximo ni omitir su energía.
  if (data.ready !== true || !Number.isFinite(data.windowMs) || data.windowMs < 3000) {
    showMeterCollecting();
    return;
  }

  document.getElementById('db-number').innerText = db;
  const percent = Math.min(100, Math.max(0, ((db - 30) / 65) * 100));
  const dbBar = document.getElementById('db-bar');
  dbBar.style.width = `${percent}%`;

  const dbStatus = document.getElementById('db-status-text');
  dbStatus.className = `db-status ${classifyDb(db)}`;
  if (db < 55) {
    dbBar.style.backgroundColor = 'var(--green)';
    dbStatus.innerText = meterText('lowIndex');
  } else if (db <= 70) {
    dbBar.style.backgroundColor = 'var(--yellow)';
    dbStatus.innerText = meterText('moderateIndex');
  } else {
    dbBar.style.backgroundColor = 'var(--red)';
    dbStatus.innerText = meterText('highIndex');
  }

  // Un resumen cada 200 ms de audio real; no acumula índices en función de FPS.
  session.energia += energiaDe(db);
  session.count += 1;
  if (db < session.min) session.min = db;
  if (db > session.max) session.max = db;
  updateAvgUI();
  sendWindowEnergia += energiaDe(db);
  sendWindowCount += 1;
  sendMeasurementIfDue().catch((error) => console.warn('No se pudo enviar la medición:', error));
}

/**
 * Abre la instrumentación del micrófono, que está oculta en la pantalla.
 *
 * ## Por qué está escondida
 *
 * Antes el panel mostraba cuatro cosas a la vez: el número, la señal en dBFS, los
 * filtros del navegador y la versión del método. Para quien mide ruido en la calle,
 * tres de las cuatro son ruido —en el sentido contrario del que trabaja la app—: no
 * cambian lo que haría con el dato y ocupaban el sitio del botón de compartir.
 *
 * Para quien audita la medida, esas tres son justo lo que hay que ver: si el
 * navegador tenía la ganancia automática puesta, si la señal se recorta, con qué
 * método se midió. Quitarlo de la pantalla no es borrarlo, y esta función es el
 * motivo por el que no se ha borrado: se escribe en la consola y aparece.
 *
 * ```js
 * verCalidadMicrofono()   // con el micrófono midiendo
 * ```
 *
 * ## Por qué una función y no un botón
 *
 * Porque un botón que dijera «diagnóstico» en la pantalla sería el mismo problema
 * en otro sitio: una palabra técnica ofrecida a quien no la pidió. Por consola solo la
 * encuentra quien ya sabe que existe.
 */
function verCalidadMicrofono() {
  const bloque = document.querySelector('.mic-detail');
  if (!bloque) return console.warn('No hay bloque de detalle del micrófono en esta pantalla.');
  bloque.hidden = false;
  updateAudioDiagnostics();
  return bloque;
}
