import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// ffmpeg-static es un paquete CJS (trae el binario nativo por plataforma) y
// su interop de tipos con TS bajo module: NodeNext no resuelve bien el
// default export — se importa con require en vez de `import ... from`.
const ffmpegPath: string | null = createRequire(import.meta.url)('ffmpeg-static');

// El navegador graba en el contenedor que soporte (WebM/Opus en Chrome y
// derivados, a veces MP4/AAC en Safari) — para que WhatsApp lo muestre como
// nota de voz de verdad (con el visualizador de ondas) hace falta mandarlo
// como OGG/Opus. Se reencodea siempre (en vez de copiar el stream) para no
// depender de qué códec haya elegido cada navegador; un audio de nota de voz
// dura segundos, así que el costo de reencodear es insignificante.
export function convertirAOggOpus(entrada: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('No se encontró el binario de ffmpeg (ffmpeg-static) para esta plataforma'));
      return;
    }
    const proceso = spawn(ffmpegPath, ['-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1']);
    const salida: Buffer[] = [];
    const errores: Buffer[] = [];
    proceso.stdout.on('data', (chunk: Buffer) => salida.push(chunk));
    proceso.stderr.on('data', (chunk: Buffer) => errores.push(chunk));
    proceso.on('error', reject);
    proceso.on('close', (codigo) => {
      if (codigo === 0) resolve(Buffer.concat(salida));
      else reject(new Error(`ffmpeg terminó con código ${codigo}: ${Buffer.concat(errores).toString('utf8').slice(-500)}`));
    });
    proceso.stdin.end(entrada);
  });
}
