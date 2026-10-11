// Reads the PED Chart Line Listing from a byte stream: one CSV, or a zip of CSVs, a piece at a time so the
// 280 MB never sits in memory. Only the funds asked for are kept (see pedListing.js).
import { Unzip, UnzipInflate } from 'fflate';
import { createPedParser } from './pedListing.js';

async function pump(stream, push) {
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    push(value);
  }
}

// A stream holding one CSV. Returns the parser's result: { kept, rows, funds, chartName }.
export async function readPedCsv(stream, funds) {
  const p = createPedParser(funds),
    dec = new TextDecoder();
  await pump(stream, (chunk) => p.push(dec.decode(chunk, { stream: true })));
  p.push(dec.decode());
  return p.finish();
}

// A stream holding a zip. Returns one result per CSV inside; entries that are not CSV files are skipped.
// onFile(name) is called as each CSV starts, so the screen can say what it is reading.
export async function readPedZip(stream, funds, onFile = () => {}) {
  const results = [];
  let failure = null;
  const uz = new Unzip((f) => {
    if (!/\.csv$/i.test(f.name)) return;
    onFile(f.name);
    const p = createPedParser(funds),
      dec = new TextDecoder();
    f.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      try {
        p.push(dec.decode(chunk, { stream: !final }));
        if (final) results.push(p.finish());
      } catch (e) {
        failure = e;
      }
    };
    f.start();
  });
  uz.register(UnzipInflate);
  await pump(stream, (chunk) => uz.push(chunk));
  uz.push(new Uint8Array(0), true);
  if (failure) throw failure;
  return results;
}

// A File or Blob (name decides zip or CSV).
export async function readPedFile(file, funds, onFile) {
  if (/\.zip$/i.test(file.name)) return readPedZip(file.stream(), funds, onFile);
  onFile?.(file.name);
  return [await readPedCsv(file.stream(), funds)];
}
