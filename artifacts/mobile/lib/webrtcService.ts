import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
} from "react-native-webrtc";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export interface WebRTCSdp {
  type: string;
  sdp: string;
}

type AnyPc = {
  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null;
  ontrack: ((e: { streams?: MediaStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
} & RTCPeerConnection;

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onIceCandidate: ((c: RTCIceCandidate) => void) | null = null;
  onConnectionStateChange: ((state: string) => void) | null = null;

  async initLocalStream(video: boolean): Promise<MediaStream> {
    const constraints = {
      audio: true,
      video: video
        ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        : false,
    };
    const stream = await mediaDevices.getUserMedia(constraints);
    this.localStream = stream as unknown as MediaStream;
    return this.localStream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  private buildPc(): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    const anyPc = pc as unknown as AnyPc;

    anyPc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(e.candidate);
      }
    };

    anyPc.ontrack = (e) => {
      const streams = e.streams;
      if (streams?.[0] && this.onRemoteStream) {
        this.onRemoteStream(streams[0]);
      }
    };

    anyPc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(pc.connectionState ?? "");
      }
    };

    return pc;
  }

  private addLocalTracks() {
    if (!this.pc || !this.localStream) return;
    this.localStream.getTracks().forEach((t: MediaStreamTrack) =>
      this.pc!.addTrack(t, this.localStream!)
    );
  }

  async createOffer(): Promise<WebRTCSdp> {
    this.pc = this.buildPc();
    this.addLocalTracks();
    const desc = await this.pc.createOffer({});
    await this.pc.setLocalDescription(desc);
    return { type: desc.type as string, sdp: (desc.sdp ?? "") as string };
  }

  async createAnswer(offerSdp: WebRTCSdp): Promise<WebRTCSdp> {
    this.pc = this.buildPc();
    this.addLocalTracks();
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: offerSdp.type as (string & "offer"), sdp: offerSdp.sdp })
    );
    const desc = await this.pc.createAnswer();
    await this.pc.setLocalDescription(desc);
    return { type: desc.type as string, sdp: (desc.sdp ?? "") as string };
  }

  async setRemoteAnswer(answerSdp: WebRTCSdp): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: answerSdp.type as (string & "answer"), sdp: answerSdp.sdp })
    );
  }

  async addIceCandidate(candidate: { candidate: string; sdpMLineIndex?: number | null; sdpMid?: string | null }): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch { }
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return true;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  hasVideo(): boolean {
    return (this.localStream?.getVideoTracks().length ?? 0) > 0;
  }

  cleanup(): void {
    try {
      this.localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch { }
    this.localStream = null;
    try { this.pc?.close(); } catch { }
    this.pc = null;
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;
  }
}
