// Web platform stub — react-native-webrtc requires native modules not available in browsers.
// Metro bundler automatically uses webrtcService.native.ts for iOS/Android builds.

export interface WebRTCSdp {
  type: string;
  sdp: string;
}

// Minimal stream interface for cross-platform type compatibility
export interface WebRTCStream {
  toURL(): string;
}

export class WebRTCService {
  onRemoteStream: ((stream: WebRTCStream) => void) | null = null;
  onIceCandidate: ((c: unknown) => void) | null = null;
  onConnectionStateChange: ((state: string) => void) | null = null;

  async initLocalStream(_video: boolean): Promise<WebRTCStream> {
    throw new Error("WebRTC не поддерживается в браузере");
  }

  getLocalStream(): WebRTCStream | null { return null; }

  async createOffer(): Promise<WebRTCSdp> {
    throw new Error("WebRTC не поддерживается в браузере");
  }

  async createAnswer(_sdp: WebRTCSdp): Promise<WebRTCSdp> {
    throw new Error("WebRTC не поддерживается в браузере");
  }

  async setRemoteAnswer(_sdp: WebRTCSdp): Promise<void> {}

  async addIceCandidate(_c: unknown): Promise<void> {}

  toggleMute(): boolean { return true; }

  toggleVideo(): boolean { return false; }

  hasVideo(): boolean { return false; }

  cleanup(): void {}
}
