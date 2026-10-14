import { useEffect, useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';
import { PresenceCloud } from './visual/presence-cloud.js';

export type SphereHandle = { setLevel: (value: number) => void };

export function Sphere({ skin, reducedMotion, state = 'idle', ref }: { skin: number; reducedMotion: boolean; state?: 'idle' | 'listening' | 'speaking' | 'thinking'; ref?: Ref<SphereHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<PresenceCloud | null>(null);
  // Imperative so the microphone level can drive the existing renderer without a render per sample.
  useImperativeHandle(ref, () => ({ setLevel: value => renderer.current?.setLevel(value) }), []);
  useEffect(() => {
    if (!host.current) return;
    const cloud = new PresenceCloud(host.current, { renderer: 'particles' }); renderer.current = cloud;
    return () => { cloud.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => { renderer.current?.setSkin(skin); }, [skin]);
  useEffect(() => { renderer.current?.setState(state); }, [state]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => renderer.current?.setLow(reducedMotion || media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [reducedMotion]);
  return <div ref={host} className="orb" role="img" aria-label={`${{ idle: '静候', listening: '聆听', speaking: '回应', thinking: '连接' }[state]}中的神经元球体`} />;
}
