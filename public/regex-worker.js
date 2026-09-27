import { evaluateRegex } from './regex.js';

self.onmessage = ({ data }) => {
  try { self.postMessage({ result: evaluateRegex(data.source, data.flags, data.text) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
