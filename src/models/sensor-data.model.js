/**
 * Modelo para representar los datos de un sensor
 */
class SensorData {
  /**
   * Constructor del modelo de datos de sensor
   * @param {String} fileName - Nombre del archivo original del sensor
   * @param {Array<Number>} times - Array con los tiempos
   * @param {Array<Number>} values - Array con los valores medidos
   * @param {Number|null} anomalyTime - Tiempo en el que ocurre la anomalía (null si no hay anomalía)
   */
  constructor(fileName, times, values, anomalyTime = null) {
    this.fileName = fileName;
    this.times = times;
    this.values = values;
    this.length = times.length;
    this.anomalyTime = anomalyTime;

    // Validar que las longitudes coinciden
    if (times.length !== values.length) {
      throw new Error(`Las longitudes de tiempos (${times.length}) y valores (${values.length}) no coinciden`);
    }
  }

  /**
   * Parsea un archivo de texto con datos de sensor
   * @param {String} fileName - Nombre del archivo
   * @param {String} content - Contenido del archivo
   * @param {Number|null} anomalyTime - Tiempo en el que ocurre la anomalía
   * @returns {SensorData} - Instancia del modelo con los datos del sensor
   */
  static fromTextFile(fileName, content, anomalyTime = null) {
    const lines = content.trim().split('\n');
    const times = [];
    const values = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/); // Separar por espacios en blanco
      if (parts.length >= 2) {
        const time = parseFloat(parts[0]);
        const value = parseFloat(parts[1]);

        if (!isNaN(time) && !isNaN(value)) {
          times.push(time);
          values.push(value);
        }
      }
    }

    return new SensorData(fileName, times, values, anomalyTime);
  }

  /**
   * Convierte a formato JSON para enviar a la API
   */
  toJSON() {
    return {
      fileName: this.fileName,
      times: this.times,
      values: this.values,
      length: this.length,
      anomalyTime: this.anomalyTime
    };
  }
}

module.exports = SensorData;
