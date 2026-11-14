import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function normalizePng(pngBuffer) {
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  const preIdat = [];
  const idatParts = [];
  const postIdat = [];
  let seenIdat = false;
  let offset = 8;

  while (offset + 12 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBuffer.length) {
      throw new Error(`Truncated PNG chunk ${type}`);
    }
    const rawChunk = pngBuffer.subarray(offset, dataEnd + 4);
    if (type === 'IDAT') {
      seenIdat = true;
      idatParts.push(pngBuffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      postIdat.push(rawChunk);
      break;
    } else if (!seenIdat) {
      preIdat.push(rawChunk);
    } else {
      postIdat.push(rawChunk);
    }
    offset = dataEnd + 4;
  }

  if (idatParts.length === 0) {
    throw new Error('PNG missing IDAT chunks');
  }

  const rawScanlines = zlib.inflateSync(Buffer.concat(idatParts));
  const deterministicDeflate = zlib.deflateSync(rawScanlines, { level: 9 });
  const idatChunk = makePngChunk('IDAT', deterministicDeflate);

  return Buffer.concat([PNG_SIGNATURE, ...preIdat, idatChunk, ...postIdat]);
}
