/**
 * audio.js
 * Captura de micrófono, cálculo de dB, promedio de sesión.
 */

async function toggleMonitoring() {
  const btn = document.getElementById('btn-toggle');

  if (!isMonitoring) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      microphone = audioCtx.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;

      isMonitoring = true;
      btn.classList.add('active');
      btn.innerHTML = '<span class="action-icon">⏹️</span><span class="action-text">Detener</span>';
      
      await requestWakeLock();
      startSession();
      showStatsPanel();
      updateMeter();
    } catch (err) {
      console.error(err);
      alert('Permiso de micrófono denegado o no soportado.');
    }
  } else {
    isMonitoring = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    
    btn.classList.remove('active');
    btn.innerHTML = '<span class="action-icon">🎤</span><span class="action-text">Activar Micrófono</span>';
    
    document.getElementById('db-number').innerText = '--';
    document.getElementById('db-bar').style.width = '0%';
    document.getElementById('db-status-text').innerText = 'Presiona Iniciar';
    hideStatsPanel();

    await saveSessionSummary();
    stopSession();
    releaseWakeLock();
  }
}

// ... el resto de funciones (startSession, stopSession, updateTimer, updateAvgUI, saveSessionSummary, updateMeter) permanecen igual