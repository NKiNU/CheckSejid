// TEST-ONLY: a fake clamd speaking the INSTREAM protocol (ADR-025 §2). Reports any stream that contains
// the EICAR test signature as infected, everything else as clean.
import { createServer, type AddressInfo } from "node:net";

export const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

export async function startFakeClamd() {
  const server = createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const cmd = "zINSTREAM\0".length;
      const chunks: Buffer[] = [];
      for (let i = cmd; i + 4 <= buf.length; ) {
        const len = buf.readUInt32BE(i);
        if (len === 0) {
          const infected = Buffer.concat(chunks).includes(EICAR);
          socket.end(infected ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          return;
        }
        if (i + 4 + len > buf.length) return; // wait for the rest of the chunk
        chunks.push(buf.subarray(i + 4, i + 4 + len));
        i += 4 + len;
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { host, stop: () => new Promise<void>((r) => server.close(() => r())) };
}
