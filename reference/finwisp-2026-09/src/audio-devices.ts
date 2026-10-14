import { confirmedMacDevice, macAudioRuntime, monitorMacOutput, type MacAudioRuntime } from './mac-audio.ts';
export type AudioDevice = Pick<MediaDeviceInfo, 'deviceId' | 'label' | 'kind'>;
export type AudioOutput = string | { label: string; monitor: (failed: (message: string) => void) => () => void };
type Media = Pick<MediaDevices, 'enumerateDevices' | 'getUserMedia'>;
const builtIn = /MacBook|iMac|Mac mini|Mac Studio|Mac Pro|built[- ]?in|内建|内置/i;
const phone = /iPhone|iPad|continuity|连续互通|接续互通/i;

export function audioChoices(devices: AudioDevice[], kind: MediaDeviceKind) {
  return devices.filter(d => d.kind === kind && d.label && d.deviceId && !['default', 'communications'].includes(d.deviceId) && builtIn.test(d.label) && !phone.test(d.label));
}
export function preferredDevice(devices: AudioDevice[], kind: MediaDeviceKind) {
  return audioChoices(devices, kind).find(d => builtIn.test(d.label) && !phone.test(d.label))?.deviceId ?? '';
}
function selectDevice(devices: AudioDevice[], kind: MediaDeviceKind, selected?: string) {
  const id = selected || preferredDevice(devices, kind);
  const device = audioChoices(devices, kind).find(d => d.deviceId === id);
  if (!device) throw new Error(kind === 'audioinput'
    ? '尚未确认 Mac 麦克风。请在浏览器网站权限中允许麦克风，再检测并选择这台 Mac 的设备。'
    : '所选扬声器不可用。请检测声音设备并选择这台 Mac 的扬声器。');
  return device;
}

/** Browsers require an exact device. A label-hidden Mac WebView first verifies CoreAudio's default. */
export async function localMicrophone(selected?: string, media: Media = navigator.mediaDevices, runtime = macAudioRuntime()) {
  const devices = await media.enumerateDevices();
  if (runtime.desktop && !selected && !audioChoices(devices, 'audioinput').length) {
    const id = await confirmedMacDevice('input', runtime);
    const stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    try {
      const tracks = stream.getAudioTracks();
      if (tracks.length !== 1 || !builtIn.test(tracks[0].label) || phone.test(tracks[0].label)
        || await confirmedMacDevice('input', runtime) !== id) throw new Error('麦克风与 Mac 内建设备不一致，已关闭声音采集。');
      return stream;
    } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  }
  const device = selectDevice(devices, 'audioinput', selected);
  const stream = await media.getUserMedia({ audio: { deviceId: { exact: device.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  const tracks = stream.getAudioTracks();
  if (tracks.length !== 1 || tracks[0].getSettings().deviceId !== device.deviceId) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('麦克风与所选设备不一致，已关闭声音采集，请重新选择 Mac 麦克风。');
  }
  return stream;
}
export async function localOutput(audio: HTMLAudioElement, selected?: string, media: Pick<MediaDevices, 'enumerateDevices'> = navigator.mediaDevices, runtime: MacAudioRuntime = macAudioRuntime()): Promise<AudioOutput> {
  const devices = await media.enumerateDevices();
  if (runtime.desktop && (typeof audio.setSinkId !== 'function' || !audioChoices(devices, 'audiooutput').length)) {
    if (selected) throw new Error('所选扬声器不可用，请重新选择自动使用 Mac 内建扬声器。');
    const id = await confirmedMacDevice('output', runtime);
    return { label: 'Mac 内建扬声器', monitor: failed => monitorMacOutput(runtime, id, failed) };
  }
  const device = selectDevice(devices, 'audiooutput', selected);
  if (typeof audio.setSinkId !== 'function') throw new Error('当前浏览器不能指定扬声器，请用此 Mac 上的 Chrome 打开本机网页。');
  try { await audio.setSinkId(device.deviceId); }
  catch { throw new Error('无法使用所选扬声器，请检查浏览器声音权限并重新选择。'); }
  return device.label;
}
