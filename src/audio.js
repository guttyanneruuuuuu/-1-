/**
 * Lightweight procedural audio using WebAudio — no asset files needed.
 * Provides a continuous mosquito wing buzz whose pitch/volume tracks speed,
 * plus one-shot SFX (slap, feed, alert, egg, death).
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.buzzOsc = null;
    this.buzzGain = null;
    this.buzzFilter = null;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startBuzz();
    } catch (e) {
      this.enabled = false;
      console.warn('Audio unavailable', e);
    }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _startBuzz() {
    const ctx = this.ctx;
    this.buzzOsc = ctx.createOscillator();
    this.buzzOsc.type = 'sawtooth';
    this.buzzOsc.frequency.value = 320;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 326; // detune for "beating" buzz
    this.buzzOsc2 = osc2;

    this.buzzFilter = ctx.createBiquadFilter();
    this.buzzFilter.type = 'bandpass';
    this.buzzFilter.frequency.value = 700;
    this.buzzFilter.Q.value = 4;

    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0.0;

    this.buzzOsc.connect(this.buzzFilter);
    osc2.connect(this.buzzFilter);
    this.buzzFilter.connect(this.buzzGain);
    this.buzzGain.connect(this.master);
    this.buzzOsc.start();
    osc2.start();
  }

  /** speed01: 0..1 normalized flight speed; landed mutes buzz */
  updateBuzz(speed01, landed) {
    if (!this.ctx || !this.buzzGain) return;
    const now = this.ctx.currentTime;
    const target = landed ? 0.0 : 0.02 + speed01 * 0.16;
    this.buzzGain.gain.setTargetAtTime(target, now, 0.08);
    const freq = 300 + speed01 * 260;
    this.buzzOsc.frequency.setTargetAtTime(freq, now, 0.1);
    this.buzzOsc2.frequency.setTargetAtTime(freq + 6, now, 0.1);
  }

  _blip(freq, dur, type = 'sine', vol = 0.3, sweep = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + dur);
  }

  _noise(dur, vol = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=1800;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now);
  }

  feed() { this._blip(180, 0.12, 'sine', 0.25, 120); }
  feedTick() { this._blip(120 + Math.random()*40, 0.05, 'sine', 0.12); }
  slap() { this._noise(0.18, 0.6); this._blip(90, 0.15, 'square', 0.3, -50); }
  alert() { this._blip(660, 0.1, 'square', 0.25); setTimeout(()=>this._blip(880,0.12,'square',0.25),110); }
  egg() { this._blip(520, 0.1, 'triangle', 0.2, 200); setTimeout(()=>this._blip(720,0.12,'triangle',0.2,200),90); }
  death() { this._blip(200,0.5,'sawtooth',0.4,-150); this._noise(0.4,0.4); }
  land() { this._blip(140, 0.08, 'sine', 0.15); }
}
