import type { SceneId } from './types';

const SCENE_FREQUENCIES: Record<SceneId, [number, number]> = {
  orbit: [55, 82.5], earth: [64, 96], neo: [48, 144], helio: [72, 216], archive: [44, 132],
};

export class CosmicSonifier {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private enabled = false;
  private scene: SceneId = 'orbit';
  private energy = 0.3;

  get isEnabled(): boolean { return this.enabled; }

  async setEnabled(value: boolean): Promise<void> {
    if (value) {
      await this.ensureGraph();
      await this.context?.resume();
      this.enabled = true;
      this.master?.gain.setTargetAtTime(0.13, this.context?.currentTime ?? 0, 0.22);
    } else {
      this.enabled = false;
      this.master?.gain.setTargetAtTime(0.0001, this.context?.currentTime ?? 0, 0.16);
    }
  }

  setScene(scene: SceneId): void {
    this.scene = scene;
    this.retune();
  }

  setEnergy(value: number): void {
    this.energy = Math.max(0, Math.min(1, value));
    if (!this.context || !this.filter) return;
    this.filter.frequency.setTargetAtTime(280 + this.energy * 1250, this.context.currentTime, 0.35);
    this.filter.Q.setTargetAtTime(0.6 + this.energy * 3.4, this.context.currentTime, 0.4);
  }

  pulse(strength = 0.5): void {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(SCENE_FREQUENCIES[this.scene][1] * (1 + strength), now);
    oscillator.frequency.exponentialRampToValueAtTime(SCENE_FREQUENCIES[this.scene][0], now + 0.55);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.72);
  }

  getRecordingTrack(): MediaStreamTrack | null {
    return this.enabled ? this.recordingDestination?.stream.getAudioTracks()[0]?.clone() ?? null : null;
  }

  private async ensureGraph(): Promise<void> {
    if (this.context) return;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.0001;
    this.filter = this.context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 620;
    this.filter.Q.value = 1.2;
    this.recordingDestination = this.context.createMediaStreamDestination();
    this.filter.connect(this.master);
    this.master.connect(this.context.destination);
    this.master.connect(this.recordingDestination);

    const types: OscillatorType[] = ['sine', 'triangle', 'sine'];
    const detunes = [-9, 0, 7];
    for (let index = 0; index < 3; index += 1) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = types[index] ?? 'sine';
      oscillator.detune.value = detunes[index] ?? 0;
      gain.gain.value = index === 0 ? 0.58 : 0.18;
      oscillator.connect(gain).connect(this.filter);
      oscillator.start();
      this.oscillators.push(oscillator);
    }

    const noiseLength = this.context.sampleRate * 3;
    const buffer = this.context.createBuffer(1, noiseLength, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      channel[index] = previous * 0.16;
    }
    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    noiseGain.gain.value = 0.24;
    noise.connect(noiseGain).connect(this.filter);
    noise.start();
    this.retune();
    this.setEnergy(this.energy);
  }

  private retune(): void {
    if (!this.context) return;
    const [root, fifth] = SCENE_FREQUENCIES[this.scene];
    const values = [root, fifth, root * 2.01];
    this.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(values[index] ?? root, this.context!.currentTime, 0.8);
    });
  }
}
