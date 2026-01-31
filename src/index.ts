import 'dotenv/config';
import { AssemblyAI } from 'assemblyai';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const CHUNK_DURATION = parseInt(process.env.CHUNK_DURATION_SEC || '300', 10);
const PARALLEL_REQUESTS = parseInt(process.env.PARALLEL_REQUESTS || '3', 10);
const SUPPORTED_FORMATS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getDuration(filePath: string): number {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    { encoding: 'utf-8' }
  );
  return parseFloat(result.trim());
}

function splitIntoChunks(filePath: string, chunkDuration: number): string[] {
  const duration = getDuration(filePath);
  const numChunks = Math.ceil(duration / chunkDuration);
  const chunks: string[] = [];
  const baseName = path.parse(filePath).name;

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const chunkPath = path.join(TEMP_DIR, `${baseName}_chunk_${i}.mp3`);

    execSync(
      `ffmpeg -y -i "${filePath}" -ss ${start} -t ${chunkDuration} -vn -acodec libmp3lame "${chunkPath}"`,
      { stdio: 'pipe' }
    );

    chunks.push(chunkPath);
  }

  return chunks;
}

function cleanupChunks(chunks: string[]): void {
  for (const chunk of chunks) {
    if (fs.existsSync(chunk)) {
      fs.unlinkSync(chunk);
    }
  }
}

interface Utterance {
  start: number;
  speaker: string;
  text: string;
}

async function transcribeChunk(chunkPath: string, offsetMs: number): Promise<Utterance[]> {
  const transcript = await client.transcripts.transcribe({
    audio: chunkPath,
    speaker_labels: true,
    language_code: 'ru',
  });

  if (transcript.status === 'error') {
    throw new Error(transcript.error);
  }

  const utterances = transcript.utterances || [];
  return utterances.map(u => ({
    start: u.start + offsetMs,
    speaker: u.speaker,
    text: u.text,
  }));
}

async function transcribeFile(filePath: string, outputPath: string): Promise<void> {
  const duration = getDuration(filePath);
  const numChunks = Math.ceil(duration / CHUNK_DURATION);

  if (numChunks === 1) {
    console.log('  Uploading...');
    const utterances = await transcribeChunk(filePath, 0);
    let output = '';
    for (const u of utterances) {
      output += `[${formatTime(u.start)}] Speaker ${u.speaker}:\n${u.text}\n\n`;
    }
    fs.writeFileSync(outputPath, output.trim());
    return;
  }

  console.log(`  Splitting into ${numChunks} chunks...`);
  const chunks = splitIntoChunks(filePath, CHUNK_DURATION);

  const allUtterances: Utterance[] = [];
  const results: { index: number; utterances: Utterance[] }[] = [];

  for (let i = 0; i < chunks.length; i += PARALLEL_REQUESTS) {
    const batch = chunks.slice(i, i + PARALLEL_REQUESTS);
    const batchIndices = batch.map((_, j) => i + j);

    console.log(`  Processing chunks ${i + 1}-${Math.min(i + PARALLEL_REQUESTS, chunks.length)}/${chunks.length}...`);

    const batchResults = await Promise.all(
      batch.map(async (chunk, j) => {
        const index = batchIndices[j];
        const offsetMs = index * CHUNK_DURATION * 1000;
        const utterances = await transcribeChunk(chunk, offsetMs);
        return { index, utterances };
      })
    );

    results.push(...batchResults);
  }

  results.sort((a, b) => a.index - b.index);
  for (const r of results) {
    allUtterances.push(...r.utterances);
  }

  cleanupChunks(chunks);

  let output = '';
  for (const u of allUtterances) {
    output += `[${formatTime(u.start)}] Speaker ${u.speaker}:\n${u.text}\n\n`;
  }

  fs.writeFileSync(outputPath, output.trim());
}

async function processMediaFiles(): Promise<void> {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  const files = fs.readdirSync(MEDIA_DIR);
  const mediaFiles = files.filter(file =>
    SUPPORTED_FORMATS.includes(path.extname(file).toLowerCase())
  );

  if (mediaFiles.length === 0) {
    console.log('No media files found in media folder');
    return;
  }

  const total = mediaFiles.length;
  console.log(`Found ${total} media file(s)\n`);

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const current = i + 1;
    const filePath = path.join(MEDIA_DIR, file);

    console.log(`[${current}/${total}] ${file}`);

    try {
      const outputPath = path.join(MEDIA_DIR, `${path.parse(file).name}.txt`);
      await transcribeFile(filePath, outputPath);
      console.log(`  Saved: ${path.parse(file).name}.txt\n`);
    } catch (error) {
      console.error(`  Error: ${error}\n`);
    }
  }

  console.log('All files processed!');
}

processMediaFiles();
