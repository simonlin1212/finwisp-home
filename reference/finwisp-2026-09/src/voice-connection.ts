import type { VoiceReply, VoiceRequest, VoiceEvent } from '../shared/voice.ts';
import { VoiceHistoryDelivery } from './voice-history-delivery.ts';
import type { VoiceHistoryResult } from '../shared/voice-history-search.ts';
import type { ProductResult } from '../shared/product-agent.ts';
import type { VoiceBacktestDraft } from '../shared/voice-backtest-draft.ts';
import { VoiceBacktestDelivery } from './voice-backtest-delivery.ts';
import { voiceApi } from './voice-api.ts';
import { VOICE_TIMING } from '../shared/voice.ts';
import { localMicrophone, localOutput, type AudioOutput } from './audio-devices.ts';
import type { NavigationIntent } from './voice-navigation.ts';
import { VoiceNewsController } from './voice-news.ts';
import { VoiceNavigationStatusTracker } from './voice-navigation-status.ts';
import type { VoiceNavigationStatus } from '../shared/voice-navigation-status.ts';
import type { NewsChoice, VoiceNewsView } from './voice-news.ts';
import type { VoiceObjectNavigationResult } from '../shared/voice-object-navigation.ts';

export type VoicePhase = 'off' | 'connecting' | 'listening' | 'speaking' | 'stopping' | 'failed';
export type VoiceLine = { role: string; text: string; final: boolean };
type Ports = {
  request: (request: VoiceRequest) => Promise<VoiceReply>;
  microphone: (deviceId?: string) => Promise<MediaStream>;
  output: (audio: HTMLAudioElement, deviceId?: string) => Promise<AudioOutput>;
  peer: () => RTCPeerConnection;
  context: () => AudioContext;
};
type Callbacks = {
  phase: (phase: VoicePhase) => void; error: (text: string) => void;
  lines: (lines: VoiceLine[]) => void; turn: (turnId: string | null, label: string) => void;
  level: (value: number) => void;
  inputLevel?: (value: number) => void;
  microphoneMuted?: (muted: boolean) => void;
  /**
   * What one spoken business instruction actually did, as the host stored it. `openAllowed` is false
   * for a receipt that arrives after the microphone closed: the records are still refreshed, because
   * the change really happened, but a finished call may not take over the page the user is on now.
   * `sessionId` is the conversation this call itself resolved, not whichever one the page is showing
   * when the receipt lands, because only the conversation that made a change may undo it.
   */
  product?: (result: ProductResult, openAllowed: boolean, sessionId: string | null) => void;
  navigate?: (intent: NavigationIntent) => void;
  objectNavigate?: (result: VoiceObjectNavigationResult) => void;
  historySearch?: (result: VoiceHistoryResult) => void;
  /** One locally prepared spoken backtest draft. It has not read data, called a planner or started a run. */
  backtestDraft?: (draft: VoiceBacktestDraft, openAllowed: boolean, sessionId: string | null) => void;
  navigationStatus?: (status: VoiceNavigationStatus | null) => void;
  /** What actually became of the selected article on this call, as this host reported it. */
  news?: (view: VoiceNewsView) => void;
  devices?: (input: string, output: string) => void;
  diagnostic?: (message: string) => void;
  historySaved?: () => void;
};
const STOP_UNCONFIRMED = '研究停止尚未确认，请保留当前页面。';
const defaults: Ports = {
  request: voiceApi,
  microphone: localMicrophone, output: localOutput,
  peer: () => new RTCPeerConnection(), context: () => new AudioContext(),
};

/** Microphone ownership and generation checks keep cancelled permission/SDP results from reviving audio. */
export class VoiceConnection {
  private ports: Ports;
  private callbacks: Callbacks;
  private audio: HTMLAudioElement;
  private generation = 0;
  private stream: MediaStream | null = null;
  private microphoneMuted = false;
  private diagnostic = false;
  private pc: RTCPeerConnection | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollFailures = 0;
  private context: AudioContext | null = null;
  private callId: string | null = null;
  private controlCallId: string | null = null;
  // The conversation each of those two calls actually resolved. They are kept past the microphone,
  // so a receipt delivered after the call ended still names the conversation that produced it.
  private callSessionId: string | null = null;
  private controlSessionId: string | null = null;
  private previousControl: { id: string; cursor: number; sessionId: string | null } | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private outputSource: MediaStreamAudioSourceNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private samples = new Float32Array(256);
  private lastSound = 0;
  private lines: VoiceLine[] = [];
  private partialLines = new Map<string, VoiceLine>();
  private phase: VoicePhase = 'off';
  private cursor = 0;
  private appliedSdp = false;
  private startedRequest = false;
  private receiving = false;
  private turnId: string | null = null;
  private stopping: Promise<void> | null = null;
  private outputSelection: Promise<AudioOutput> | null = null;
  private releaseOutputMonitor: (() => void) | null = null;
  private watchResearch = true;
  /** The selected article of the call in progress. It shares this one connection and never opens another. */
  private news: VoiceNewsController;
  private navigationStatus: VoiceNavigationStatusTracker;
  private historyDelivery = new VoiceHistoryDelivery();
  private backtestDelivery = new VoiceBacktestDelivery();
  /** The alert currently on screen, and the research turn whose stop request was left unconfirmed. */
  private shownError = '';
  private stopUnconfirmedTurn: string | null = null;
  constructor(audio: HTMLAudioElement, callbacks: Callbacks, ports: Partial<Ports> = {}) {
    this.audio = audio; this.ports = { ...defaults, ...ports };
    this.callbacks = { ...callbacks, error: text => { this.shownError = text; callbacks.error(text); } };
    this.navigationStatus = new VoiceNavigationStatusTracker(value => this.callbacks.navigationStatus?.(value));
    this.news = new VoiceNewsController(
      { send: request => this.ports.request(request), uuid: () => crypto.randomUUID() },
      view => this.callbacks.news?.(view),
    );
  }
  /** Identity only, no media or model action. A connecting/closed call cannot authorize an external reference. */
  currentCall(): { callId: string; sessionId: string } | null {
    return this.pc?.connectionState === 'connected' && this.callId && this.callSessionId && ['listening', 'speaking'].includes(this.phase)
      ? { callId: this.callId, sessionId: this.callSessionId } : null;
  }
  /** The article the user currently has selected, whether or not a call is running. */
  selectNews(choice: NewsChoice | null) { this.news.select(choice); }
  /** Asked for again by the user after a failure or an undetermined outcome. */
  retryNews() { this.news.retry(); }
  /** Manual input mute only: keep the peer, incoming audio and research turn intact. */
  setMicrophoneMuted(muted: boolean) {
    if (!this.callId || this.diagnostic || !['connecting', 'listening', 'speaking'].includes(this.phase)) return;
    this.microphoneMuted = muted;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
    if (muted) { this.callbacks.level(0); this.callbacks.inputLevel?.(0); }
    this.callbacks.microphoneMuted?.(muted);
  }
  toggleMicrophoneMuted() { this.setMicrophoneMuted(!this.microphoneMuted); }
  private setPhase(phase: VoicePhase) { if (this.phase !== phase) { this.phase = phase; this.callbacks.phase(phase); } }
  private valid(generation: number) { return this.generation === generation; }
  async start(sessionId: (() => Promise<string>) | string, devices: { inputId?: string; outputId?: string; diagnostic?: boolean } = {}) {
    if (this.outputSelection) { this.callbacks.error('正在确认扬声器设置，请稍候再开始。'); return; }
    if (this.stopping) { this.callbacks.error('正在确认上一通语音已结束，请稍候。'); return; }
    if (this.pc || this.callId) return;
    if (this.turnId) { this.callbacks.error('上一项研究仍在进行，请等待完成或先停止研究。'); return; }
    const generation = ++this.generation;
    this.diagnostic = Boolean(devices.diagnostic);
    if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null;
    this.previousControl = this.controlCallId ? { id: this.controlCallId, cursor: this.cursor, sessionId: this.controlSessionId } : null;
    const callId = crypto.randomUUID(); this.callId = callId; this.controlCallId = callId;
    this.navigationStatus.begin(callId);
    this.callSessionId = null; this.controlSessionId = null;
    this.cursor = 0; this.appliedSdp = false; this.startedRequest = false; this.receiving = false; this.watchResearch = true;
    this.pollFailures = 0;
    this.lines = []; this.partialLines.clear(); this.callbacks.lines([]);
    this.callbacks.error(''); this.setPhase('connecting');
    this.deadline = setTimeout(() => { if (this.valid(generation)) this.fail('语音连接超时，麦克风已关闭。'); }, VOICE_TIMING.mediaDeadline);
    try {
      if (!devices.diagnostic) { this.context = this.ports.context(); await this.context.resume(); }
      if (!this.valid(generation)) return;
      const id = typeof sessionId === 'string' ? sessionId : await sessionId();
      if (!this.valid(generation)) return;
      this.callSessionId = id; this.controlSessionId = id;
      this.historyDelivery.begin(callId, id);
      this.backtestDelivery.begin(callId, id);
      let stream: MediaStream | null = null;
      if (!devices.diagnostic) {
        const selection = this.ports.output(this.audio, devices.outputId);
        this.outputSelection = selection;
        let output: AudioOutput;
        try { output = await selection; }
        finally { if (this.outputSelection === selection) this.outputSelection = null; }
        if (!this.valid(generation)) return;
        if (typeof output !== 'string') this.releaseOutputMonitor = output.monitor(message => { if (this.valid(generation)) void this.fail(message); });
        stream = await this.ports.microphone(devices.inputId);
        if (!this.valid(generation)) { stream.getTracks().forEach(t => t.stop()); return; }
        this.stream = stream;
        stream.getAudioTracks().forEach(track => { track.enabled = !this.microphoneMuted; });
        // Metering starts with the microphone itself, so the level is real input long before any answer arrives.
        try { this.listenInput(stream, generation); }
        catch { this.callbacks.error('声音强度显示暂时不可用，麦克风仍在正常传送。'); this.releaseMeter(); }
        this.callbacks.devices?.(stream.getAudioTracks()[0]?.label ?? '', typeof output === 'string' ? output : output.label);
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (this.valid(generation)) this.fail('麦克风已断开，语音已停止。'); }));
      }
      const pc = this.ports.peer(); this.pc = pc;
      if (stream) { const local = stream; local.getAudioTracks().forEach(track => pc.addTrack(track, local)); }
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      // Native realtime owns interruption and audio playout over this negotiated data channel.
      // Native v3 is not the classic Realtime protocol: real-service verification rejects
      // response.cancel/output_audio_buffer.clear, so this page sends no playback commands.
      pc.createDataChannel('oai-events');
      pc.onconnectionstatechange = () => {
        if (!this.valid(generation)) return;
        if (pc.connectionState === 'connected') {
          if (this.disconnectTimer) clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
          if (this.deadline) clearTimeout(this.deadline); this.deadline = null;
          if (devices.diagnostic) {
            this.callbacks.diagnostic?.('语音网络连接已建立。此次没有采集或播放声音，实际交流仍需麦克风测试。');
            void this.stop(false);
          } else this.setPhase('listening');
        } else if (pc.connectionState === 'disconnected') {
          // A transient ICE disruption is not a terminal failure. Keep this same connection for a
          // bounded recovery window; never start another microphone or silently reconnect a call.
          if (!this.disconnectTimer) this.disconnectTimer = setTimeout(() => {
            this.disconnectTimer = null;
            if (this.valid(generation) && pc.connectionState !== 'connected') void this.fail('语音网络未能恢复，麦克风已关闭。准备好后可以重新开始。');
          }, 8000);
        } else if (['failed', 'closed'].includes(pc.connectionState)) void this.fail('语音网络已断开，麦克风已关闭。准备好后可以重新开始。');
      };
      pc.ontrack = event => {
        if (!this.valid(generation) || devices.diagnostic) return;
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        this.audio.srcObject = remote;
        void this.audio.play().catch(() => { if (this.valid(generation)) this.fail('浏览器未允许播放语音，请检查声音权限后重新开始。'); });
        this.receiving = true;
        try { this.listenOutput(remote); }
        catch { this.callbacks.error('助理声音强度暂时无法检测，通话不受影响。'); }
      };
      const offer = await pc.createOffer();
      if (!this.valid(generation)) return;
      await pc.setLocalDescription(offer);
      if (!this.valid(generation)) return;
      if (!offer.sdp) throw new Error('浏览器没有生成语音连接信息。');
      this.startedRequest = true;
      // Taken here, immediately before asking: whatever is selected at this moment opens the call.
      // A channel check opens no conversation, so it carries no article at all.
      const news = devices.diagnostic ? undefined : this.news.beginCall(callId, id);
      const result = await this.ports.request({ method: 'start', sessionId: id, callId, sdp: offer.sdp, ...(news ? { news } : {}) });
      if (!this.valid(generation)) {
        // A stop can beat the HTTP start response; stop again after its outcome is known.
        await this.ports.request({ method: 'stop', callId }); return;
      }
      if (result.callId !== callId) throw new Error('语音连接返回了不匹配的会话，请重试。');
      this.previousControl = null;
      // The call is answered: a choice made while it was connecting goes in now, on this connection.
      this.news.acknowledge(result);
      await this.consume(result, generation);
      if (this.valid(generation)) this.poll(generation, callId);
    } catch (error) {
      if (!this.valid(generation)) return;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      await this.fail(denied ? '麦克风权限未开启。允许此网页使用麦克风后再试。' : error instanceof Error ? error.message : '语音连接失败。');
    }
  }
  private listenInput(local: MediaStream, generation: number) {
    const ctx = this.context; if (!ctx) return;
    this.releaseMeter();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(local); source.connect(analyser);
    this.inputAnalyser = analyser; this.inputSource = source;
    this.meterTimer = setInterval(() => this.sample(generation), 80);
  }
  /** The answer stream only decides who is speaking; it never feeds the microphone level. */
  private listenOutput(remote: MediaStream) {
    const ctx = this.context; if (!ctx) return;
    this.outputSource?.disconnect(); this.outputAnalyser?.disconnect();
    this.outputSource = null; this.outputAnalyser = null;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(remote); source.connect(analyser);
    this.outputAnalyser = analyser; this.outputSource = source;
  }
  private strength(node: AnalyserNode | null) {
    if (!node) return 0;
    node.getFloatTimeDomainData(this.samples);
    return Math.sqrt(this.samples.reduce((sum, value) => sum + value * value, 0) / this.samples.length);
  }
  private sample(generation: number) {
    if (!this.valid(generation)) return;
    const outgoing = this.microphoneMuted ? 0 : this.strength(this.inputAnalyser), incoming = this.strength(this.outputAnalyser);
    const level = Math.min(1, outgoing * 5);
    this.callbacks.level(level); this.callbacks.inputLevel?.(level);
    // The meters only drive the orb. Playback and turn taking stay with the native session.
    if (incoming > 0.008 && !this.audio.paused) this.lastSound = Date.now();
    if (this.pc?.connectionState === 'connected') this.setPhase(Date.now() - this.lastSound < 250 ? 'speaking' : 'listening');
  }
  private releaseMeter() {
    if (this.meterTimer) clearInterval(this.meterTimer); this.meterTimer = null;
    this.inputSource?.disconnect(); this.outputSource?.disconnect();
    this.inputAnalyser?.disconnect(); this.outputAnalyser?.disconnect();
    this.inputSource = null; this.outputSource = null; this.inputAnalyser = null; this.outputAnalyser = null;
    this.lastSound = 0;
  }
  private async consume(reply: VoiceReply, generation: number, watchOnly = false) {
    if (!this.valid(generation) || reply.callId !== (watchOnly ? this.controlCallId : this.callId)) return;
    // A later poll of the live call may carry the outcome of the article it is holding.
    if (!watchOnly) { this.news.observe(reply); this.navigationStatus.observe(reply); }
    for (const event of reply.events) {
      if (!this.valid(generation) || event.seq <= this.cursor) continue;
      if (!watchOnly || ['turn.started', 'turn.completed', 'turn.unconfirmed', 'tool', 'history.saved', 'history.warning', 'product.result', 'backtest.draft'].includes(event.type)) await this.event(event, generation, watchOnly);
      this.cursor = event.seq;
    }
  }
  private async event(event: VoiceEvent, generation: number, watchOnly = false) {
    if (event.type === 'sdp' && !this.appliedSdp && this.pc) {
      this.appliedSdp = true;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: event.text });
    } else if (event.type === 'error') this.fail(event.text ?? '原生语音发生错误。');
    else if (event.type === 'closed') { if (this.valid(generation)) void this.stop(); }
    else if (event.type === 'history.saved') this.callbacks.historySaved?.();
    else if (event.type === 'history.warning') this.callbacks.error(event.text ?? '语音文字尚未确认保存。');
    else if (event.type === 'transcript.delta' || event.type === 'transcript.done') {
      const role = event.role ?? 'assistant', final = event.type === 'transcript.done';
      // Full-duplex speakers can interleave fragments. Finalize that speaker's pending bubble,
      // not whichever speaker happened to emit the most recent fragment.
      const last = this.partialLines.get(role);
      if (last && last.role === role && !last.final) { last.text = (final ? event.text ?? '' : last.text + (event.text ?? '')).slice(0, 12_000); last.final = final; }
      else {
        const line = { role, text: (event.text ?? '').slice(0, 12_000), final };
        this.lines.push(line); if (!final) this.partialLines.set(role, line);
      }
      if (final) this.partialLines.delete(role);
      this.lines = this.lines.slice(-30);
      for (const [speaker, line] of this.partialLines) if (!this.lines.includes(line)) this.partialLines.delete(speaker);
      this.callbacks.lines(this.lines.map(line => ({ ...line })));
    } else if (event.type === 'product.result') {
      // The host's own validated result, carried by this call's own event stream. A replay is already
      // behind the cursor and never arrives here twice; a receipt from a call that has ended is still
      // delivered, so the records catch up, but it may not open a page over what the user is doing.
      // It travels with the conversation of the call it came from — an older call's receipt belongs
      // to that older conversation even after the page has moved to another one.
      if (event.product) this.callbacks.product?.(event.product, !watchOnly && Boolean(this.callId), watchOnly ? this.controlSessionId : this.callSessionId);
    } else if (event.type === 'history.search') {
      const result = this.historyDelivery.accept(event, !watchOnly && Boolean(this.callId) && ['connecting', 'listening', 'speaking'].includes(this.phase));
      if (result) this.callbacks.historySearch?.(result);
    } else if (event.type === 'backtest.draft') {
      const draft = this.backtestDelivery.accept(event);
      if (draft) this.callbacks.backtestDraft?.(draft, !watchOnly && Boolean(this.callId), watchOnly ? this.controlSessionId : this.callSessionId);
    } else if (event.type === 'navigation') {
      // The host already decided from the canonical item; flat subtitles stay display-only,
      // so one sentence delivered twice cannot toggle the page.
      if (watchOnly || !this.callId || event.role !== 'user') return;
      if (event.text === 'open-overview' || event.text === 'close-overview' || event.text === 'open-research' || event.text === 'open-backtest' || event.text === 'open-watch' || event.text === 'open-records' || event.text === 'open-memory') this.callbacks.navigate?.(event.text);
    } else if (event.type === 'object.navigation') {
      // Object identity was resolved by the host from canonical local records. A completed call may
      // report late task receipts, but it may not take over the page after the microphone is gone.
      if (watchOnly || !this.callId || event.role !== 'user' || !event.objectNavigation) return;
      this.callbacks.objectNavigate?.(event.objectNavigation);
    } else if (event.type === 'turn.started') {
      this.turnId = event.turnId ?? null; this.callbacks.turn(this.turnId, '正在研究，可以继续和我交流。');
    } else if (event.type === 'turn.unconfirmed') {
      if (event.turnId === this.turnId) this.turnId = null;
      this.callbacks.turn(this.turnId, event.text ?? '研究结果尚未确认。');
    } else if (event.type === 'turn.completed') {
      // The turn's own end answers an earlier unconfirmed stop. Only that alert is withdrawn.
      if (event.turnId && event.turnId === this.stopUnconfirmedTurn) {
        this.stopUnconfirmedTurn = null;
        if (this.shownError === STOP_UNCONFIRMED) this.callbacks.error('');
      }
      if (event.turnId === this.turnId) this.turnId = null;
      this.callbacks.turn(this.turnId, event.text === 'interrupted' ? '研究已确认停止。' : event.text === 'completed' ? '本轮研究已完成。' : '本轮研究结束，请查看结果或错误。');
    } else if (event.type === 'tool') this.callbacks.turn(this.turnId, event.text ?? '已读取资料。');
  }
  private poll(generation: number, callId: string, watchOnly = false) {
    this.pollTimer = setTimeout(() => {
      void this.ports.request({ method: 'poll', callId, cursor: this.cursor }).then(reply => {
        if (this.valid(generation)) this.pollFailures = 0;
        return this.consume(reply, generation, watchOnly);
      }).then(() => {
        if (this.valid(generation) && (!watchOnly || this.watchResearch)) this.poll(generation, callId, watchOnly);
      }).catch(() => { if (this.valid(generation)) {
        if (watchOnly) this.callbacks.error('后台研究状态暂时无法确认，请保留页面并重试停止操作。');
        else if (++this.pollFailures < 3) this.poll(generation, callId);
        else void this.fail('本机语音控制连接中断，麦克风已关闭。');
      } });
    }, this.pollFailures ? 500 : 250);
  }
  async interrupt() {
    if (!this.controlCallId || !this.turnId) return;
    const generation = this.generation, turnId = this.turnId;
    try {
      const reply = await this.ports.request({ method: 'interrupt', callId: this.controlCallId, turnId: this.turnId });
      await this.consume(reply, generation, !this.callId);
      if (this.turnId) { this.callbacks.turn(this.turnId, '已请求停止研究，等待确认。'); }
      if (!this.callId && this.valid(generation) && this.turnId) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.poll(generation, this.controlCallId, true);
      }
    }
    catch {
      // The host refuses a stop for a turn it has already finished; that completion may reach this
      // page before or after the refusal. Once the turn has ended, there is nothing left to confirm.
      if (this.turnId !== turnId) return;
      this.stopUnconfirmedTurn = turnId; this.callbacks.error(STOP_UNCONFIRMED);
    }
  }
  private cleanup() {
    this.releaseOutputMonitor?.(); this.releaseOutputMonitor = null;
    this.generation++;
    // The call is over: its pending and initial article statuses end with it, and a late answer to
    // one of them may no longer be shown. What the user has selected on the page stays selected.
    this.news.endCall();
    this.navigationStatus.end();
    this.historyDelivery.end();
    this.backtestDelivery.end();
    if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null;
    if (this.deadline) clearTimeout(this.deadline); this.deadline = null;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
    this.releaseMeter();
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.microphoneMuted = false; this.callbacks.microphoneMuted?.(false);
    this.pc?.close(); this.pc = null;
    this.audio.pause(); this.audio.srcObject = null;
    if (this.context) void this.context.close().catch(() => undefined); this.context = null;
    this.callbacks.level(0); this.callbacks.inputLevel?.(0); this.receiving = false;
  }
  async stop(watchResearch = true) {
    this.watchResearch = watchResearch;
    if (this.stopping) return this.stopping;
    if (!this.callId) {
      this.generation++;
      if (this.pollTimer) clearTimeout(this.pollTimer); this.pollTimer = null;
      if (watchResearch) this.resumeResearch();
      return;
    }
    const callId = this.callId, requested = this.startedRequest;
    // `controlSessionId` deliberately survives: this call's late work still belongs to it.
    this.cleanup(); this.callId = null; this.callSessionId = null; this.startedRequest = false; this.setPhase(requested ? 'stopping' : 'off');
    const generation = this.generation;
    if (callId && requested) {
      this.stopping = (async () => {
        try {
          const reply = await this.ports.request({ method: 'stop', callId });
          // Keep late work events even when the page is leaving; only polling is paused.
          await this.consume(reply, generation, true);
          // Mutation replies contain the first history page. Drain from our cursor before
          // releasing ownership, including a turn that arrived after the last audio poll.
          let page: VoiceReply;
          do {
            if (!this.valid(generation)) return;
            page = await this.ports.request({ method: 'poll', callId, cursor: this.cursor });
            await this.consume(page, generation, true);
          } while (page.events.length === 100);
          if (this.valid(generation) && this.watchResearch) this.poll(generation, callId, true);
        }
        catch {
          try {
            const status = await this.ports.request({ method: 'status' });
            if (!this.valid(generation)) return;
            if (status.callId === callId) throw new Error('STOP_UNCONFIRMED');
            // The host never accepted this call (e.g. an older research turn is busy).
            // Keep ownership of our previous call, but never adopt another tab's call.
            if (this.previousControl && status.callId === this.previousControl.id) {
              this.controlCallId = this.previousControl.id; this.cursor = this.previousControl.cursor;
              this.controlSessionId = this.previousControl.sessionId;
              let page: VoiceReply;
              do {
                page = await this.ports.request({ method: 'poll', callId: this.controlCallId, cursor: this.cursor });
                if (!this.valid(generation)) return;
                await this.consume(page, generation, true);
              } while (page.events.length === 100);
              if (this.watchResearch) this.poll(generation, this.controlCallId, true);
            } else { this.controlCallId = null; this.controlSessionId = null; }
            this.previousControl = null;
          } catch { this.callbacks.error('本机麦克风和播放已关闭；服务端结束尚未确认，将等待断线清理。'); }
        }
      })();
      try { await this.stopping; }
      finally { this.stopping = null; if (this.phase === 'stopping') this.setPhase('off'); }
    } else if (this.previousControl) {
      this.controlCallId = this.previousControl.id; this.cursor = this.previousControl.cursor;
      this.controlSessionId = this.previousControl.sessionId; this.previousControl = null;
      if (this.watchResearch) this.poll(generation, this.controlCallId, true);
    } else { this.controlCallId = null; this.controlSessionId = null; }
  }
  resumeResearch() {
    this.watchResearch = true;
    if (this.callId || this.stopping || !this.controlCallId) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.poll(this.generation, this.controlCallId, true);
  }
  private async fail(text: string) {
    const stopping = this.stop(), generation = this.generation;
    this.callbacks.error(text);
    await stopping;
    if (this.valid(generation)) this.setPhase('failed');
  }
  hasAudio() { return this.receiving; }
}
