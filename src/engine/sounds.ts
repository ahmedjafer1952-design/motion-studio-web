export type SoundId =
  | "pop"
  | "whoosh"
  | "ding"
  | "click"
  | "swoosh"
  | "drumHit"
  | "chime"
  | "riser"
  | "impact"
  | "tick"
  | "bubble"
  | "laser"
  | "coin"
  | "notification"
  | "typewriterKey"
  | "camera"
  | "magic"
  | "drop"
  | "success";

export interface SoundDef {
  id: SoundId;
  label: string;
  description: string;
}

export const SOUND_LIBRARY: SoundDef[] = [
  { id: "pop", label: "بوب", description: "فرقعة قصيرة — ظهور عنصر" },
  { id: "whoosh", label: "ووش", description: "مرور سريع — انتقال أو حركة كاميرا" },
  { id: "ding", label: "دينغ", description: "رنة ناعمة — تنبيه أو إنجاز" },
  { id: "click", label: "كليك", description: "نقرة قصيرة — زر أو تفاعل" },
  { id: "swoosh", label: "سووش", description: "اندفاع سريع — دخول نص أو عنصر" },
  { id: "drumHit", label: "ضربة طبل", description: "ضربة قوية — تأكيد أو إيقاف" },
  { id: "chime", label: "جرس موسيقي", description: "ثلاث نغمات صاعدة — لحظة لطيفة" },
  { id: "riser", label: "رايزر", description: "توتر صاعد — قبل الكشف عن شيء" },
  { id: "impact", label: "ارتطام", description: "دوي عميق — لحظة قوية" },
  { id: "tick", label: "تك", description: "نقرة دقيقة وسريعة جدًا" },
  { id: "bubble", label: "فقاعة", description: "نغمة مرحة صاعدة" },
  { id: "laser", label: "ليزر", description: "صفير هابط سريع — تأثير خيال علمي" },
  { id: "coin", label: "عملة", description: "نغمتان صاعدتان — مكافأة أو نقاط" },
  { id: "notification", label: "إشعار", description: "نغمتان هادئتان — تنبيه لطيف" },
  { id: "typewriterKey", label: "مفتاح آلة كاتبة", description: "طقطقة ميكانيكية قصيرة" },
  { id: "camera", label: "غالق كاميرا", description: "صوت التقاط لقطة" },
  { id: "magic", label: "سحري", description: "تألق صاعد — لحظة سحرية" },
  { id: "drop", label: "قطرة ماء", description: "نغمة هابطة مع رذاذ خفيف" },
  { id: "success", label: "نجاح", description: "ثلاث نغمات منتصرة" },
];

function whiteNoiseBuffer(ctx: OfflineAudioContext, duration: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone(
  ctx: OfflineAudioContext,
  opts: { freq: number; freqEnd?: number; start: number; dur: number; type?: OscillatorType; peak?: number }
) {
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, opts.start);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), opts.start + opts.dur);
  }
  const gain = ctx.createGain();
  const peak = opts.peak ?? 0.4;
  gain.gain.setValueAtTime(0.0001, opts.start);
  gain.gain.exponentialRampToValueAtTime(peak, opts.start + Math.min(0.02, opts.dur * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(opts.start);
  osc.stop(opts.start + opts.dur + 0.02);
}

function noiseBurst(
  ctx: OfflineAudioContext,
  opts: { start: number; dur: number; peak?: number; filterType?: BiquadFilterType; filterFreq?: number }
) {
  const src = ctx.createBufferSource();
  src.buffer = whiteNoiseBuffer(ctx, opts.dur);
  const gain = ctx.createGain();
  const peak = opts.peak ?? 0.3;
  gain.gain.setValueAtTime(peak, opts.start);
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
  let node: AudioNode = src;
  if (opts.filterType) {
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.frequency.value = opts.filterFreq ?? 1200;
    node.connect(filter);
    node = filter;
  }
  node.connect(gain);
  gain.connect(ctx.destination);
  src.start(opts.start);
}

const BUILDERS: Record<SoundId, (ctx: OfflineAudioContext) => number> = {
  pop: (ctx) => {
    tone(ctx, { freq: 900, freqEnd: 300, start: 0, dur: 0.12, type: "sine", peak: 0.5 });
    return 0.15;
  },
  whoosh: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.45, peak: 0.25, filterType: "bandpass", filterFreq: 1400 });
    return 0.5;
  },
  ding: (ctx) => {
    tone(ctx, { freq: 1046, start: 0, dur: 0.9, type: "sine", peak: 0.35 });
    tone(ctx, { freq: 1568, start: 0, dur: 0.6, type: "sine", peak: 0.15 });
    return 1.0;
  },
  click: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.03, peak: 0.4, filterType: "highpass", filterFreq: 3000 });
    return 0.06;
  },
  swoosh: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.3, peak: 0.3, filterType: "bandpass", filterFreq: 2200 });
    tone(ctx, { freq: 2000, freqEnd: 400, start: 0, dur: 0.28, type: "sawtooth", peak: 0.08 });
    return 0.32;
  },
  drumHit: (ctx) => {
    tone(ctx, { freq: 120, freqEnd: 50, start: 0, dur: 0.3, type: "sine", peak: 0.6 });
    noiseBurst(ctx, { start: 0, dur: 0.05, peak: 0.3, filterType: "lowpass", filterFreq: 800 });
    return 0.35;
  },
  chime: (ctx) => {
    tone(ctx, { freq: 523, start: 0, dur: 0.3, type: "sine", peak: 0.3 });
    tone(ctx, { freq: 659, start: 0.1, dur: 0.3, type: "sine", peak: 0.3 });
    tone(ctx, { freq: 784, start: 0.2, dur: 0.5, type: "sine", peak: 0.3 });
    return 0.7;
  },
  riser: (ctx) => {
    tone(ctx, { freq: 150, freqEnd: 1200, start: 0, dur: 1.2, type: "sawtooth", peak: 0.18 });
    noiseBurst(ctx, { start: 0.3, dur: 0.9, peak: 0.12, filterType: "highpass", filterFreq: 1000 });
    return 1.25;
  },
  impact: (ctx) => {
    tone(ctx, { freq: 90, freqEnd: 35, start: 0, dur: 0.6, type: "sine", peak: 0.7 });
    noiseBurst(ctx, { start: 0, dur: 0.15, peak: 0.35, filterType: "lowpass", filterFreq: 500 });
    return 0.65;
  },
  tick: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.015, peak: 0.35, filterType: "highpass", filterFreq: 5000 });
    return 0.04;
  },
  bubble: (ctx) => {
    tone(ctx, { freq: 400, freqEnd: 900, start: 0, dur: 0.22, type: "sine", peak: 0.35 });
    return 0.25;
  },
  laser: (ctx) => {
    tone(ctx, { freq: 1800, freqEnd: 120, start: 0, dur: 0.25, type: "sawtooth", peak: 0.3 });
    return 0.28;
  },
  coin: (ctx) => {
    tone(ctx, { freq: 988, start: 0, dur: 0.1, type: "square", peak: 0.25 });
    tone(ctx, { freq: 1568, start: 0.08, dur: 0.25, type: "square", peak: 0.25 });
    return 0.35;
  },
  notification: (ctx) => {
    tone(ctx, { freq: 740, start: 0, dur: 0.25, type: "sine", peak: 0.3 });
    tone(ctx, { freq: 988, start: 0.18, dur: 0.35, type: "sine", peak: 0.3 });
    return 0.55;
  },
  typewriterKey: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.02, peak: 0.35, filterType: "bandpass", filterFreq: 2500 });
    tone(ctx, { freq: 200, start: 0.015, dur: 0.04, type: "square", peak: 0.15 });
    return 0.08;
  },
  camera: (ctx) => {
    noiseBurst(ctx, { start: 0, dur: 0.04, peak: 0.4, filterType: "highpass", filterFreq: 2000 });
    noiseBurst(ctx, { start: 0.06, dur: 0.03, peak: 0.25, filterType: "highpass", filterFreq: 2500 });
    return 0.11;
  },
  magic: (ctx) => {
    const notes = [784, 988, 1175, 1568, 1976];
    notes.forEach((f, i) => tone(ctx, { freq: f, start: i * 0.06, dur: 0.3, type: "sine", peak: 0.18 }));
    return 0.6;
  },
  drop: (ctx) => {
    tone(ctx, { freq: 700, freqEnd: 150, start: 0, dur: 0.35, type: "sine", peak: 0.35 });
    noiseBurst(ctx, { start: 0.3, dur: 0.2, peak: 0.1, filterType: "highpass", filterFreq: 3000 });
    return 0.52;
  },
  success: (ctx) => {
    tone(ctx, { freq: 523, start: 0, dur: 0.2, type: "triangle", peak: 0.3 });
    tone(ctx, { freq: 659, start: 0.12, dur: 0.2, type: "triangle", peak: 0.3 });
    tone(ctx, { freq: 784, start: 0.24, dur: 0.45, type: "triangle", peak: 0.3 });
    return 0.72;
  },
};

async function synthesize(id: SoundId): Promise<AudioBuffer> {
  const probeCtx = new OfflineAudioContext(1, 1, 44100);
  const dur = BUILDERS[id](probeCtx) || 0.5;
  const ctx = new OfflineAudioContext(1, Math.ceil(44100 * (dur + 0.1)), 44100);
  BUILDERS[id](ctx);
  return ctx.startRendering();
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = data.length * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([out], { type: "audio/wav" });
}

const urlCache = new Map<SoundId, Promise<string>>();

/** Synthesizes (once, cached) and returns an object URL for the given UI sound — usable directly as an audio layer's src. */
export function getSoundUrl(id: SoundId): Promise<string> {
  let cached = urlCache.get(id);
  if (!cached) {
    cached = synthesize(id).then((buf) => URL.createObjectURL(encodeWav(buf)));
    urlCache.set(id, cached);
  }
  return cached;
}
