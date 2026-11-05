// TEST-ONLY: tiny structurally valid JPEG / PNG / WebP files that carry location metadata.
import { crc32 } from "node:zlib";

export const GPS = "GPS-LAT-3.139N-LON-101.686E";
const u32 = (n: number, le = false) => {
  const b = Buffer.alloc(4);
  if (le) b.writeUInt32LE(n);
  else b.writeUInt32BE(n);
  return b;
};

const jpegSegment = (marker: number, data: Buffer) => Buffer.concat([Buffer.from([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
export const JPEG_PIXELS = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]); // SOS + entropy data + EOI
export const jpegWithGps = () =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    jpegSegment(0xe1, Buffer.from(`Exif\0\0${GPS}`)),
    jpegSegment(0xed, Buffer.from(`Photoshop 3.0\0${GPS}`)),
    jpegSegment(0xdb, Buffer.alloc(65, 1)),
    JPEG_PIXELS,
  ]);

const pngChunk = (type: string, data: Buffer) => {
  const t = Buffer.from(type, "latin1");
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
};
export const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const pngIhdr = pngChunk("IHDR", Buffer.concat([u32(1), u32(1), Buffer.from([8, 0, 0, 0, 0])]));
export const pngIdat = pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1]));
export const pngIend = pngChunk("IEND", Buffer.alloc(0));
export const pngPlain = () => Buffer.concat([PNG_SIG, pngIhdr, pngIdat, pngIend]);
export const pngWithGps = () =>
  Buffer.concat([
    PNG_SIG,
    pngIhdr,
    pngChunk("eXIf", Buffer.from(GPS)),
    pngChunk("tEXt", Buffer.from(`Comment\0${GPS}`)),
    pngChunk("iTXt", Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${GPS}`)),
    pngChunk("zTXt", Buffer.from(`Comment\0\0${GPS}`)),
    pngIdat,
    pngIend,
  ]);

const webpChunk = (fourcc: string, data: Buffer) =>
  Buffer.concat([Buffer.from(fourcc, "latin1"), u32(data.length, true), data, Buffer.alloc(data.length % 2)]);
export const webpVp8x = (flags: number) => webpChunk("VP8X", Buffer.concat([Buffer.from([flags, 0, 0, 0]), Buffer.alloc(6)]));
export const webpPixels = webpChunk("VP8L", Buffer.from([0x2f, 0, 0, 0, 0, 1, 2]));
const riff = (...chunks: Buffer[]) => {
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  return Buffer.concat([Buffer.from("RIFF"), u32(body.length, true), body]);
};
export const webpPlain = () => riff(webpPixels);
export const webpWithGps = () =>
  riff(webpVp8x(0x08 | 0x04 | 0x10), webpPixels, webpChunk("EXIF", Buffer.from(GPS)), webpChunk("XMP ", Buffer.from(`${GPS}!`)));
