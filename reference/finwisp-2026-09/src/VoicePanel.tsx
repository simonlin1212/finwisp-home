import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ref } from 'react';
import { voiceApi } from './voice-api.ts';
import { VoiceConnection } from './voice-connection.ts';
import type { VoicePhase, VoiceLine } from './voice-connection.ts';
import type { VoiceReply } from '../shared/voice.ts';
import type { VoiceNavigationStatus } from '../shared/voice-navigation-status.ts';
import { VoiceNavigationNotice } from './VoiceNavigationNotice.tsx';
import { RESEARCH_MODEL_LABEL } from '../shared/model.ts';
import { audioChoices, preferredDevice } from './audio-devices.ts';
import { confirmedMacDevice, macAudioRuntime } from './mac-audio.ts';
import type { AudioDevice } from './audio-devices.ts';
import { InputLevel } from './InputLevel.tsx';
import type { InputLevelHandle } from './InputLevel.tsx';
import { voiceSwitchState } from './voice-switch.ts';
import { openLoginPage, shouldAutoOpenLoginPage } from './login-page.ts';
import { NEWS_VIEW_IDLE, voiceNewsChoice, voiceNewsText } from './voice-news.ts';
import type { NewsChoiceInput, VoiceNewsView } from './voice-news.ts';
import type { NavigationIntent } from './voice-navigation.ts';
import type { ProductResult } from '../shared/product-agent.ts';
import type { VoiceHistoryResult } from '../shared/voice-history-search.ts';
import type { VoiceBacktestDraft } from '../shared/voice-backtest-draft.ts';
import type { VoiceObjectNavigationResult } from '../shared/voice-object-navigation.ts';

/**
 * The one voice controller of the page: one connection, one microphone, one audio element.
 *
 * It is mounted once, above everything that can change, and stays mounted. Switching the middle
 * column, opening settings, showing or hiding a rail and creating the first conversation all leave
 * it exactly where it is, because a remount here would be a dropped call. The two switches in the
 * header and in the composer press this same controller through `toggle`, so there is one state and
 * never two streams.
 *
 * Its connection settings live in the settings window, but the settings window does not own them:
 * they are rendered into slots there through a portal, so closing that window disposes nothing.
 */
export type VoiceHandle = {
  /** Current media-backed call identity, without starting anything. */
  currentCall: () => { callId: string; sessionId: string } | null;
  /** Start or end the call. It does nothing else: no question is sent and no page is changed. */
  toggle: () => void;
  toggleMicrophoneMuted: () => void;
  /** Ask the running research turn to stop. The call itself stays up. */
  stopResearch: () => void;
};

export function VoicePanel({
  session, sessionId, selectedNews = null, onPhase, onTask, onHistory, saveHistory, onNavigation, onObjectNavigation, onHistorySearch, onBacktestDraft, onProduct, onInputLevel,
  onLines, onConfigured, onConnectionBusy, onMicrophoneMuted, onMicrophoneMuteAvailable, onSetupRequired, deviceSlot, connectionSlot, reducedMotion = false, ref,
}: {
  session: () => Promise<string>;
  sessionId: string | null;
  /**
   * The article the page has selected, if any. It is handed to the call that is already running as
   * one current reference — it starts nothing, asks nothing and saves nothing.
   */
  selectedNews?: NewsChoiceInput | null;
  onPhase: (phase: VoicePhase) => void;
  onTask: (running: boolean) => void;
  onHistory: () => void;
  saveHistory: boolean;
  onNavigation?: (intent: NavigationIntent) => void;
  onObjectNavigation?: (result: VoiceObjectNavigationResult) => void;
  onHistorySearch?: (result: VoiceHistoryResult) => void;
  onBacktestDraft?: (draft: VoiceBacktestDraft, openAllowed: boolean, sessionId: string | null) => void;
  onProduct?: (result: ProductResult, openAllowed: boolean, sessionId: string | null) => void;
  onInputLevel?: (level: number) => void;
  /** How much of this call has been transcribed so far, so the page can make room for it. */
  onLines?: (count: number) => void;
  onConfigured?: (configured: boolean) => void;
  onConnectionBusy?: (busy: boolean) => void;
  onMicrophoneMuted?: (muted: boolean) => void;
  onMicrophoneMuteAvailable?: (available: boolean) => void;
  /** Pressed while there is no model connection yet: the page opens the settings window. */
  onSetupRequired?: () => void;
  deviceSlot?: HTMLElement | null;
  connectionSlot?: HTMLElement | null;
  reducedMotion?: boolean;
  ref?: Ref<VoiceHandle>;
}) {
  const audio = useRef<HTMLAudioElement>(null), meter = useRef<HTMLMeterElement>(null);
  const wave = useRef<InputLevelHandle>(null);
  const connection = useRef<VoiceConnection | null>(null);
  const phaseCallback = useRef(onPhase); phaseCallback.current = onPhase;
  const historyCallback = useRef(onHistory); historyCallback.current = onHistory;
  const taskCallback = useRef(onTask); taskCallback.current = onTask;
  const navigationCallback = useRef(onNavigation); navigationCallback.current = onNavigation;
  const objectNavigationCallback = useRef(onObjectNavigation); objectNavigationCallback.current = onObjectNavigation;
  const historySearchCallback = useRef(onHistorySearch); historySearchCallback.current = onHistorySearch;
  const backtestDraftCallback = useRef(onBacktestDraft); backtestDraftCallback.current = onBacktestDraft;
  // Held in a ref like every other callback here: the page may pass a new function on each render
  // without the live connection, the microphone or the running call being torn down and rebuilt.
  const productCallback = useRef(onProduct); productCallback.current = onProduct;
  const levelCallback = useRef(onInputLevel); levelCallback.current = onInputLevel;
  const muteCallback = useRef(onMicrophoneMuted); muteCallback.current = onMicrophoneMuted;
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const lastConfigured = useRef<boolean | null>(null);
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [configured, setConfigured] = useState(false), [key, setKey] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<VoiceReply['authMode']>(null);
  const [login, setLogin] = useState<VoiceReply['login']>(null);
  const [modelCheck, setModelCheck] = useState<VoiceReply['modelCheck']>({ state: 'untested' });
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [inputId, setInputId] = useState(''), [outputId, setOutputId] = useState('');
  const [deviceError, setDeviceError] = useState(''), [usedDevices, setUsedDevices] = useState('');
  const [diagnosing, setDiagnosing] = useState(false), [diagnostic, setDiagnostic] = useState('');
  const [turn, setTurn] = useState<string | null>(null), [progress, setProgress] = useState('');
  const [newsView, setNewsView] = useState<VoiceNewsView>(NEWS_VIEW_IDLE);
  const [navigationStatus, setNavigationStatus] = useState<VoiceNavigationStatus | null>(null);
  const active = ['connecting', 'listening', 'speaking'].includes(phase);
  const connectionBusy = busy || modelCheck?.state === 'testing';
  function account(reply: VoiceReply) {
    setConfigured(reply.configured); setAuthMode(reply.authMode); setLogin(reply.login); setModelCheck(reply.modelCheck);
    if (lastConfigured.current !== reply.configured) { lastConfigured.current = reply.configured; historyCallback.current(); }
  }
  useEffect(() => {
    let disposed = false;
    connection.current = new VoiceConnection(audio.current!, {
      phase: value => {
        if (!['listening', 'speaking'].includes(value)) wave.current?.reset(); // a closed microphone must not leave a frozen wave
        if (!disposed) { setPhase(value); phaseCallback.current(value); }
      },
      error: value => { if (!disposed) setError(value); }, lines: value => { if (!disposed) setLines(value); },
      turn: (id, label) => { if (!disposed) { setTurn(id); setProgress(label); taskCallback.current(!!id); } },
      // Level updates land on DOM nodes only; 80ms of React state would repaint the whole page.
      level: value => { if (meter.current) meter.current.value = value; },
      inputLevel: value => { wave.current?.show(value); levelCallback.current?.(value); },
      microphoneMuted: value => { if (!disposed) { setMicrophoneMuted(value); muteCallback.current?.(value); } },
      navigate: intent => { if (!disposed) navigationCallback.current?.(intent); },
      objectNavigate: result => { if (!disposed) objectNavigationCallback.current?.(result); },
      historySearch: result => { if (!disposed) historySearchCallback.current?.(result); },
      backtestDraft: (draft, openAllowed, callSessionId) => { if (!disposed) backtestDraftCallback.current?.(draft, openAllowed, callSessionId); },
      navigationStatus: value => { if (!disposed) setNavigationStatus(value); },
      news: view => { if (!disposed) setNewsView(view); },
      // The call's own conversation travels with the result; the page must not substitute whichever
      // conversation it happens to be showing when a late receipt arrives.
      product: (result, openAllowed, callSessionId) => { if (!disposed) productCallback.current?.(result, openAllowed, callSessionId); },
      devices: (input, output) => { if (!disposed) setUsedDevices(`正在使用：${input} → ${output}`); },
      historySaved: () => { if (!disposed) historyCallback.current(); },
      diagnostic: message => { if (!disposed) setDiagnostic(message); },
    });
    void voiceApi({ method: 'status' }).then(reply => { if (!disposed) account(reply); }).catch(() => { if (!disposed) setError('本机模型连接状态暂时无法读取，请刷新页面。'); });
    const stop = () => { void connection.current?.stop(false); };
    const visibility = () => {
      // Moving to another browser tab is not a request to hang up. Explicit stop, page exit,
      // component disposal and terminal transport failure still release microphone ownership.
      if (document.visibilityState === 'visible') connection.current?.resumeResearch();
    };
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; stop(); wave.current?.reset(); if (meter.current) meter.current.value = 0; window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list); setDeviceError('');
      setInputId(current => current || preferredDevice(list, 'audioinput'));
      setOutputId(current => current || preferredDevice(list, 'audiooutput'));
      const native = macAudioRuntime();
      if (native.desktop && !audioChoices(list, 'audiooutput').length) {
        await confirmedMacDevice('output', native);
        if (!audioChoices(list, 'audioinput').length) await confirmedMacDevice('input', native);
        setDeviceError('已确认 Mac 内建设备。开始语音时会按需请求麦克风权限。');
        return;
      }
      if (!audioChoices(list, 'audioinput').length) setDeviceError('__TAURI_INTERNALS__' in globalThis
        ? '开始语音时会确认 Mac 内建设备，并按需请求麦克风权限。'
        : '请在浏览器网站权限中允许麦克风，然后点击“检测声音设备”。');
    } catch (error) { setDeviceError(macAudioRuntime().desktop && error instanceof Error ? error.message : '无法读取声音设备，请检查浏览器麦克风权限。'); }
  }
  useEffect(() => { void refreshDevices(); }, []);
  useEffect(() => {
    if (login?.state !== 'pending' && modelCheck?.state !== 'testing') return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const reply = await voiceApi({ method: 'status' }); if (!disposed) account(reply); }
      catch { if (!disposed) setError('登录或模型测试状态暂时无法读取，请稍后重试。'); }
      if (!disposed) timer = setTimeout(() => { void poll(); }, 2000);
    };
    timer = setTimeout(() => { void poll(); }, 1000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [login?.state, modelCheck?.state]);
  // Every act of choosing reaches the one connection, and only the act itself does: the key changes
  // when the user chooses, so re-rendering the page cannot resend the same choice.
  useEffect(() => { connection.current?.selectNews(voiceNewsChoice(selectedNews)); }, [selectedNews?.selection]);
  useEffect(() => { setLines([]); setProgress(''); }, [sessionId]);
  useEffect(() => { onLines?.(lines.length); }, [lines.length, onLines]);
  useEffect(() => { onConfigured?.(configured); }, [configured, onConfigured]);
  useEffect(() => { onConnectionBusy?.(connectionBusy); }, [connectionBusy, onConnectionBusy]);
  useEffect(() => { onMicrophoneMuteAvailable?.(active && !diagnosing); }, [active, diagnosing, onMicrophoneMuteAvailable]);
  async function configure() {
    setBusy(true); setError('');
    const apiKey = key.trim(); setKey('');
    try { account(await voiceApi({ method: 'connect', apiKey })); }
    catch (e) { setError(e instanceof Error ? e.message : '连接设置失败。'); }
    finally { setBusy(false); }
  }
  async function connectAction(method: 'login' | 'cancel-login' | 'test-model') {
    setBusy(true); setError('');
    if (method === 'test-model') setModelCheck({ state: 'testing' });
    try {
      const reply = await voiceApi({ method });
      account(reply);
      if (method === 'login' && reply.login?.state === 'pending' && reply.login.url && shouldAutoOpenLoginPage()) {
        try { await openLoginPage(reply.login.url); }
        catch { setError('官方登录地址已生成，但系统浏览器没有打开。请点击“打开官方登录页面”。'); }
      }
    }
    catch (e) { setError(e instanceof Error ? e.message : '本机连接未完成。'); if (method === 'test-model') setModelCheck({ state: 'failed' }); }
    finally { setBusy(false); }
  }
  /**
   * The one thing both switches do. Starting asks the connection to start — which refuses by itself
   * if a call is already up, so pressing twice cannot open a second stream — and ending asks it to
   * stop. It sends no question, opens no page, moves no focus and clears no draft.
   */
  function toggle() {
    if (active) { void connection.current?.stop(); return; }
    if (phase === 'stopping' || connectionBusy || turn) return;
    if (!configured) { onSetupRequired?.(); return; }
    setDiagnosing(false); setUsedDevices('');
    void connection.current?.start(session, { inputId, outputId });
  }
  const latest = useRef(toggle); latest.current = toggle;
  useImperativeHandle(ref, () => ({
    toggle: () => latest.current(),
    toggleMicrophoneMuted: () => connection.current?.toggleMicrophoneMuted(),
    currentCall: () => connection.current?.currentCall() ?? null,
    stopResearch: () => { void connection.current?.interrupt(); },
  }), []);

  const state = voiceSwitchState(phase, { configured, microphoneMuted, researchRunning: !active && Boolean(turn) });
  const newsText = voiceNewsText(newsView);
  const live = phase !== 'off' || Boolean(error) || Boolean(progress) || lines.length > 0;
  const deviceSettings = <div className="stack voice-devices">
    <small>只在这台 Mac 上交流 · 研究模型 {RESEARCH_MODEL_LABEL}</small>
    <label>麦克风<select value={inputId} disabled={active || phase === 'stopping'} onChange={e => setInputId(e.target.value)}><option value="">自动选择 Mac 内建麦克风</option>{audioChoices(devices, 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}</select></label>
    <label>扬声器<select value={outputId} disabled={active || phase === 'stopping'} onChange={e => setOutputId(e.target.value)}><option value="">自动选择 Mac 内建扬声器</option>{audioChoices(devices, 'audiooutput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}</select></label>
    <button className="btn" disabled={active || phase === 'stopping'} onClick={() => void refreshDevices()}>检测声音设备</button>
    {deviceError && <small role="status">{deviceError}</small>}
    {active && !diagnosing && usedDevices && <small role="status">{usedDevices}</small>}
    <small>通话中不能更换设备；结束后可以重新选择。当前只允许这台 Mac 的内建设备。</small>
    <small>语音由官方 realtime 提供，本产品没有音色或性别选项，也不在设置里试听模型声音。</small>
  </div>;
  const connectionSettings = <div className="stack voice-settings">
    <p>沿用 Vibe Research 的本机连接方式：登录 ChatGPT，由本机 Codex 调用模型。</p>
    <p role="status">{authMode === 'chatgpt' ? '本产品已登录 ChatGPT' : authMode === 'apiKey' ? '已设置本次 API 连接' : login?.state === 'pending' ? '等待浏览器完成登录' : login?.state === 'failed' ? '上次登录未完成，可以重新登录' : '本产品尚未登录'}</p>
    {!configured && <button className="btn primary" disabled={connectionBusy || active || phase === 'stopping' || login?.state === 'pending'} onClick={() => void connectAction('login')}>登录 ChatGPT</button>}
    {login?.state === 'pending' && <div className="button-group">{login.url && <button className="btn" type="button" onClick={() => { setError(''); void openLoginPage(login.url!).catch(() => setError('系统浏览器没有打开，请检查默认浏览器后重试。')); }}>打开官方登录页面</button>}<button className="btn ghost" disabled={busy} onClick={() => void connectAction('cancel-login')}>取消登录</button></div>}
    <small>登录由官方页面完成，授权保存在本产品的独立目录；重启后可以继续使用。登录成功后仍需验证模型和实际语音。</small>
    {configured && <button className="btn" disabled={connectionBusy || active || phase === 'stopping' || !!turn} onClick={() => { setDiagnosing(true); setDiagnostic(''); void connection.current?.start(session, { diagnostic: true }); }}>检查语音通道（不打开麦克风）</button>}
    {diagnostic && <p role="status">{diagnostic}</p>}
    {configured && <><button className="btn" disabled={connectionBusy || active || phase === 'stopping' || !!turn} onClick={() => void connectAction('test-model')}>{modelCheck?.state === 'testing' ? '正在验证模型回答…' : '验证模型连接'}</button>
      <p role="status">{modelCheck?.state === 'passed' ? `真实模型回答测试通过（${modelCheck.model}）。语音需要另外开始通话验证。` : modelCheck?.state === 'failed' ? '模型回答尚未验证通过。' : '验证会让模型实际回答一次；通过后也可以开始语音。'}</p></>}
    <details><summary>使用 OpenAI API 密钥</summary><form className="stack" onSubmit={e => { e.preventDefault(); void configure(); }}>
      <p>可选连接方式。密钥只保留在本次服务内存，重启后需重新填写。</p>
      <label>OpenAI API 密钥<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} minLength={20} maxLength={512} required disabled={connectionBusy || active || login?.state === 'pending'} /></label>
      <button className="btn" disabled={connectionBusy || active || phase === 'stopping' || !!turn || login?.state === 'pending' || key.trim().length < 20}>设置本次 API 连接</button>
    </form></details>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </div>;

  return <section className="voice-live" aria-label="语音状态">
    <audio ref={audio} autoPlay playsInline />
    <div className="voice-presence" hidden={!live}>
      <InputLevel ref={wave} calm={reducedMotion} />
      <span role="status">{diagnosing && phase === 'connecting' ? '正在检查语音通道，麦克风保持关闭…' : state.detail}</span>
      <meter ref={meter} min={0} max={1} value={0} aria-label="当前麦克风声音强度" aria-live="off" />
    </div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <VoiceNavigationNotice status={active ? navigationStatus : null}/>
    {/* The article's own status, apart from the audio error: a reference that did not land is not a
        dropped call, and it is never reported as the model having understood anything. */}
    {newsText && <div className="voice-news">
      <p role="status">{newsText}</p>
      {newsView.retry && <button className="btn small" onClick={() => connection.current?.retryNews()}>{newsView.title ? '重试送入' : '重试取消'}</button>}
      {newsView.state === 'delivered' && <small className="fine-print">送入的是这条资料本身，不代表模型已经阅读或理解它。</small>}
    </div>}
    {progress && <div className="voice-task"><p role="status">{progress}</p>{turn && <button className="btn small" onClick={() => void connection.current?.interrupt()}>停止这项研究</button>}</div>}
    {lines.length > 0 && <div className="voice-transcript" aria-label="本次语音字幕">
      {lines.map((line, index) => <p key={index}><small>{line.role === 'user' ? '我' : '研究伙伴'}</small>{line.text}</p>)}
      <small className="fine-print">{saveHistory ? '完整字幕与语音研究记录保存在本机，不保存录音。' : '语音文字保存已关闭；旧记录保留。'}</small>
    </div>}
    {deviceSlot && createPortal(deviceSettings, deviceSlot)}
    {connectionSlot && createPortal(connectionSettings, connectionSlot)}
  </section>;
}
