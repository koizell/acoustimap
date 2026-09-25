/**
 * audio.js
 * Captura de micrófono, índice relativo de ruido y resumen de sesión.
 * Depende de: config.js. Llama a sendMeasurementIfDue() (community.js).
 */

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

      isMonitoring = true;
      document.getElementById('stats-panel').classList.add('monitoring');

      // ✅ Actualizar botón principal
      btn.classList.add('active');
      btn.innerHTML = '<span class="action-icon">⏹️</span><span class="action-text">Detener</span>';

      // ✅ Actualizar badge de estado
      badge.classList.add('active');
      pulse.style.display = 'inline-block';
      statusText.innerText = 'Midiendo en Vivo';

      // ✅ Activar Wake Lock
      await requestWakeLock();

      startSession();
      updateMeter();
    } catch (err) {
      console.error(err);
      alert('Permiso de micrófono denegado o no soportado.');
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
    btn.innerHTML = '<span class="action-icon">🎤</span><span class="action-text">Activar Micrófono</span>';

    // ✅ Restaurar badge de estado
    badge.classList.remove('active');
    pulse.style.display = 'none';
    statusText.innerText = 'Inactivo';

    // Resetear UI del medidor
    document.getElementById('db-number').innerText = '--';
    document.getElementById('db-bar').style.width = '0%';
    document.getElementById('db-status-text').innerText = 'Presiona para empezar';

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
    tagEl.innerText = 'Sin datos';
    tagEl.className = 'avg-tag';
    minEl.innerText = '--';
    maxEl.innerText = '--';
    cntEl.innerText = '0';
    return;
  }

  const avg = Math.round(session.sum / session.count);
  avgEl.innerText = avg;

  const cat = classifyDb(avg);
  tagEl.innerText = cat === 'bajo' ? '🟢 Bajo' : cat === 'moderado' ? '🟡 Moderado' : '🔴 Alto';
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

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  const average = sum / dataArray.length;

  // Indicador relativo sin calibración de presión sonora (no dB SPL).
  let db = Math.round(20 * Math.log10(average || 1) + 25);
  if (db < 30) db = 35;

  document.getElementById('db-number').innerText = db;
  const percent = Math.min(100, Math.max(0, (db / 100) * 100));
  const dbBar = document.getElementById('db-bar');
  dbBar.style.width = `${percent}%`;

  const dbStatus = document.getElementById('db-status-text');
  if (db < 55) {
    dbBar.style.backgroundColor = 'var(--green)';
    dbStatus.innerText = '🟢 Índice bajo';
  } else if (db <= 70) {
    dbBar.style.backgroundColor = 'var(--yellow)';
    dbStatus.innerText = '🟡 Índice moderado';
  } else {
    dbBar.style.backgroundColor = 'var(--red)';
    dbStatus.innerText = '🔴 Índice alto';
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
