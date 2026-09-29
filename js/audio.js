/**
 * audio.js
 * Captura de micrófono, índice relativo de ruido y resumen de sesión.
 * Depende de: config.js. Llama a sendMeasurementIfDue() (community.js).
 */

const meterCopy = {
  es: { stop: 'Detener', activate: 'Activar', measuring: 'Midiendo en vivo', idle: 'Inactivo', denied: 'Permiso de micrófono denegado o no soportado.', start: 'Presiona para empezar', noData: 'Sin datos', low: 'Bajo', moderate: 'Moderado', high: 'Alto', lowIndex: 'Índice bajo', moderateIndex: 'Índice moderado', highIndex: 'Índice alto' },
  en: { stop: 'Stop', activate: 'Enable', measuring: 'Measuring live', idle: 'Inactive', denied: 'Microphone permission was denied or is unavailable.', start: 'Press to start', noData: 'No data', low: 'Low', moderate: 'Moderate', high: 'High', lowIndex: 'Low index', moderateIndex: 'Moderate index', highIndex: 'High index' },
  pt: { stop: 'Parar', activate: 'Ativar', measuring: 'Medindo ao vivo', idle: 'Inativo', denied: 'A permissão do microfone foi negada ou não está disponível.', start: 'Toque para começar', noData: 'Sem dados', low: 'Baixo', moderate: 'Moderado', high: 'Alto', lowIndex: 'Índice baixo', moderateIndex: 'Índice moderado', highIndex: 'Índice alto' }
};

function meterText(key) {
  return (meterCopy[document.documentElement.lang] || meterCopy.es)[key];
}

// ============================================
// TOGGLE MICRÓFONO
// ============================================
async function toggleMonitoring() {
  const btn        = document.getElementById('btn-toggle');
  const badge      = document.getElementById('status-badge');
  const pulse      = document.getElementById('pulse-dot');
  const statusText = document.getElementById('status-text');

  if (!isMonitoring) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      microphone = audioCtx.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;
      timeDomainBuffer = new Float32Array(analyser.fftSize);
      smoothedRms = 0;

      isMonitoring = true;
      document.getElementById('stats-panel').classList.add('monitoring');

      // ✅ Actualizar botón principal
      btn.classList.add('active');
      btn.innerHTML = `<span class="action-icon">⏹️</span><span class="action-text">${meterText('stop')}</span>`;

      // ✅ Actualizar badge de estado
      badge.classList.add('active');
      pulse.style.display = 'inline-block';
      statusText.innerText = meterText('measuring');

      // ✅ Activar Wake Lock
      await requestWakeLock();

      startSession();
      updateMeter();
    } catch (err) {
      console.error(err);
      alert(meterText('denied'));
    }
  } else {
    isMonitoring = false;
    document.getElementById('stats-panel').classList.remove('monitoring');
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }

    // ✅ Restaurar botón principal
    btn.classList.remove('active');
    btn.innerHTML = `<span class="action-icon">🎤</span><span class="action-text">${meterText('activate')}</span>`;

    // ✅ Restaurar badge de estado
    badge.classList.remove('active');
    pulse.style.display = 'none';
    statusText.innerText = meterText('idle');

    // Resetear UI del medidor
    document.getElementById('db-number').innerText = '--';
    document.getElementById('db-bar').style.width = '0%';
    document.getElementById('db-status-text').innerText = meterText('start');

    // ✅ Guardar resumen antes de detener
    await saveSessionSummary();

    stopSession();

    // ✅ Liberar Wake Lock
    releaseWakeLock();
  }
}

// ============================================
// SESIÓN
// ============================================
function startSession() {
  session = {
    sum: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
    startTime: Date.now(),
    timerId: null
  };
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = Date.now();
  updateAvgUI();
  document.getElementById('avg-time').innerText = '00:00';

  if (session.timerId) clearInterval(session.timerId);
  session.timerId = setInterval(updateTimer, 1000);
}

function stopSession() {
  if (session.timerId) clearInterval(session.timerId);
  session.timerId = null;
}

function updateTimer() {
  if (!isMonitoring) return;
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

  const avg = Math.round(session.sum / session.count);
  avgEl.innerText = avg;

  const cat = classifyDb(avg);
  tagEl.innerText = cat === 'bajo' ? `🟢 ${meterText('low')}` : cat === 'moderado' ? `🟡 ${meterText('moderate')}` : `🔴 ${meterText('high')}`;
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

  const avg = Math.round(session.sum / session.count);
  const category = classifyDb(avg);
  const snapped = snapToGrid(currentPosition.lat, currentPosition.lng);

  const sessionData = {
    id: crypto.randomUUID(),
    latitude:     snapped.lat,
    longitude:    snapped.lng,
    avg_db:       avg,
    category:     category,
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
function updateMeter() {
  if (!isMonitoring) return;

  // Amplitud real en el tiempo, no el promedio del espectro.
  //
  // La version anterior promediaba los 128 bins de getByteFrequencyData. Ese
  // promedio se hunde con sonidos tonales: un pitido fuerte de prueba ocupaba
  // unos pocos bins y dejaba la media en 93 de 255, indice 64, sin acercarse
  // nunca a "alto". Para llegar a 70 hacia falta una media de 178, casi el tope
  // absoluto, y con datos reales el mapa salia siempre verde. El RMS sube con
  // la energia total, que es lo que oye la persona.
  if (!timeDomainBuffer || timeDomainBuffer.length !== analyser.fftSize) {
    timeDomainBuffer = new Float32Array(analyser.fftSize);
  }
  analyser.getFloatTimeDomainData(timeDomainBuffer);
  let energy = 0;
  for (let i = 0; i < timeDomainBuffer.length; i++) {
    energy += timeDomainBuffer[i] * timeDomainBuffer[i];
  }
  const rms = Math.sqrt(energy / timeDomainBuffer.length);
  // El suavizado del analizador no cubre el dominio temporal, asi que la media
  // es propia: sin ella el digito de la pantalla parpadea.
  smoothedRms = smoothedRms ? smoothedRms * 0.8 + rms * 0.2 : rms;

  // Indice relativo: 30 en silencio, 95 con el analizador casi saturado. Un
  // punto de indice por cada dB. No es dB SPL calibrado y no sirve para
  // evaluar exposicion; ver README.
  const dbfs = 20 * Math.log10(smoothedRms || 1e-6);
  const db = Math.min(95, Math.max(30, Math.round(dbfs + 100)));

  document.getElementById('db-number').innerText = db;
  const percent = Math.min(100, Math.max(0, ((db - 30) / 65) * 100));
  const dbBar = document.getElementById('db-bar');
  dbBar.style.width = `${percent}%`;

  const dbStatus = document.getElementById('db-status-text');
  if (db < 55) {
    dbBar.style.backgroundColor = 'var(--green)';
    dbStatus.innerText = `🟢 ${meterText('lowIndex')}`;
  } else if (db <= 70) {
    dbBar.style.backgroundColor = 'var(--yellow)';
    dbStatus.innerText = `🟡 ${meterText('moderateIndex')}`;
  } else {
    dbBar.style.backgroundColor = 'var(--red)';
    dbStatus.innerText = `🔴 ${meterText('highIndex')}`;
  }

  const now = performance.now();
  if (now - lastStatTime > 200) {
    lastStatTime = now;

    session.sum += db;
    session.count += 1;
    if (db < session.min) session.min = db;
    if (db > session.max) session.max = db;
    updateAvgUI();

    sendWindowSum += db;
    sendWindowCount += 1;
    sendMeasurementIfDue().catch((error) => console.warn('No se pudo enviar la medición:', error));
  }

  rafId = requestAnimationFrame(updateMeter);
}
