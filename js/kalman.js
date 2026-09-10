/**
 * kalman.js
 * Filtro de Kalman simplificado para GPS 2D.
 * Suaviza las lecturas ruidosas y da más peso a las mediciones precisas.
 *
 * Basado en el enfoque clásico usado en apps de navegación.
 * No requiere librerías externas.
 */

class KalmanLatLong {
  /**
   * @param {number} processNoise  Ruido del proceso (cuánto puede cambiar la posición entre lecturas)
   * @param {number} minAccuracy   Precisión mínima (en metros) por debajo de la cual se ignora el valor
   */
  constructor(processNoise = 3, minAccuracy = 1) {
    this.processNoise = processNoise;
    this.minAccuracy  = minAccuracy;
    this.reset();
  }

  reset() {
    this.lat       = null;
    this.lng       = null;
    this.variance  = null;   // varianza (en metros²)
    this.timestamp = null;   // ms
  }

  /**
   * Procesa una nueva lectura del GPS y devuelve la posición suavizada.
   * @param {number} lat         Latitud cruda
   * @param {number} lng         Longitud cruda
   * @param {number} accuracy    Precisión en metros reportada por el GPS
   * @param {number} timestamp   Momento de la lectura (ms)
   */
  process(lat, lng, accuracy, timestamp) {
    // Primera lectura: inicializar el filtro
    if (this.lat === null) {
      this.lat       = lat;
      this.lng       = lng;
      this.variance  = accuracy * accuracy;
      this.timestamp = timestamp;
      return;
    }

    // Ignorar lecturas extremadamente imprecisas
    if (accuracy < this.minAccuracy) accuracy = this.minAccuracy;

    // Aumentar la incertidumbre según el tiempo transcurrido
    const dt = (timestamp - this.timestamp) / 1000; // segundos
    if (dt > 0) {
      this.variance  += dt * this.processNoise;
      this.timestamp  = timestamp;
    }

    // Ganancia de Kalman
    const K = this.variance / (this.variance + accuracy * accuracy);

    // Actualización
    this.lat      = this.lat + K * (lat - this.lat);
    this.lng      = this.lng + K * (lng - this.lng);
    this.variance = (1 - K) * this.variance;
  }

  getLat()      { return this.lat; }
  getLng()      { return this.lng; }
  getAccuracy() { return Math.sqrt(this.variance); }
}

// Instancia global del filtro
const gpsFilter = new KalmanLatLong(3, 1);

/**
 * Devuelve la calidad de la señal GPS basada en la precisión en metros.
 * @param {number} accuracy Precisión en metros
 * @returns {'good'|'medium'|'poor'}
 */
function gpsQuality(accuracy) {
  if (!accuracy) return 'poor';
  if (accuracy <= 10)  return 'good';
  if (accuracy <= 30)  return 'medium';
  return 'poor';
}