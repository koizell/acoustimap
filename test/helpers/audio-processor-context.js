const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** Ejecuta el procesador real; solo sustituye el puerto y reloj del navegador. */
function createAudioProcessor(sampleRate = 48000, onReport = () => {}, options = {}) {
  const messages = [];
  const context = vm.createContext({
    sampleRate, currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() { this.port = { postMessage: (data) => { messages.push(data); onReport(data); } }; }
    },
    registerProcessor: (_, Processor) => { context.Processor = Processor; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/audio-level-processor.js'), 'utf8'), context);
  const processor = new context.Processor({ processorOptions: options });
  return {
     processor, messages,
     evaluate(source) { return vm.runInContext(source, context); },
    reset(generation = 0) { processor.port.onmessage({ data: { type: 'reset', generation } }); },
    feed(channels) {
      const output = new Float32Array(channels[0]?.length || 128).fill(1);
      processor.process([channels], [[output]]);
      context.currentFrame += output.length;
      return output;
    }
  };
}

module.exports = { createAudioProcessor };
