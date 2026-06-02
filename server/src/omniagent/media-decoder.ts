import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';

let ffmpegAvailable: boolean | null = null;

function checkFfmpeg(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
  } catch {
    console.warn('[MediaDecoder] ffmpeg not found - video decode disabled, audio via data channel fallback');
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

export class AudioDecoder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private chunkSize = 3200; // 100ms at 16kHz 16-bit mono = 1600 samples * 2 bytes

  start() {
    if (!checkFfmpeg()) return;
    this.proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'opus', '-i', 'pipe:0',
      '-f', 's16le', '-ar', '16000', '-ac', '1',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      while (this.buffer.length >= this.chunkSize) {
        const chunk = this.buffer.subarray(0, this.chunkSize);
        this.buffer = this.buffer.subarray(this.chunkSize);
        this.emit('audio', chunk.toString('base64'));
      }
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn('[AudioDecoder] ffmpeg:', msg);
    });

    this.proc.on('exit', (code) => {
      console.log(`[AudioDecoder] ffmpeg exited: ${code}`);
      this.proc = null;
    });
  }

  feed(data: Buffer) {
    if (!this.proc?.stdin?.writable) return;
    this.proc.stdin.write(data);
  }

  stop() {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.buffer = Buffer.alloc(0);
  }
}

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

export class VideoDecoder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private frameCount = 0;

  start() {
    if (!checkFfmpeg()) return;
    this.proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'h264', '-i', 'pipe:0',
      '-f', 'image2pipe', '-vcodec', 'mjpeg',
      '-q:v', '5', '-r', '10',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.extractFrames();
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn('[VideoDecoder] ffmpeg:', msg);
    });

    this.proc.on('exit', (code) => {
      console.log(`[VideoDecoder] ffmpeg exited: ${code}`);
      this.proc = null;
    });
  }

  private extractFrames() {
    while (true) {
      const soiIdx = this.buffer.indexOf(JPEG_SOI);
      if (soiIdx === -1) break;

      const eoiIdx = this.buffer.indexOf(JPEG_EOI, soiIdx + 2);
      if (eoiIdx === -1) break;

      const frame = this.buffer.subarray(soiIdx, eoiIdx + 2);
      this.buffer = this.buffer.subarray(eoiIdx + 2);
      this.frameCount++;
      this.emit('frame', frame.toString('base64'));
    }
  }

  feed(data: Buffer) {
    if (!this.proc?.stdin?.writable) return;
    this.proc.stdin.write(data);
  }

  stop() {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.buffer = Buffer.alloc(0);
    this.frameCount = 0;
  }
}
