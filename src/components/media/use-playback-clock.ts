"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A real-time clock that advances while "playing". Drives simulated playback
 * for demo fixtures (which have no video file) and sequence previews.
 */
export function usePlaybackClock(durationMs: number, { loop = false } = {}) {
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  const durationRef = useRef(durationMs);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current, ms));
    timeRef.current = clamped;
    setTimeMs(clamped);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + (now - last);
      last = now;
      if (next >= durationRef.current) {
        if (loop) {
          timeRef.current = 0;
          setTimeMs(0);
        } else {
          timeRef.current = durationRef.current;
          setTimeMs(durationRef.current);
          setPlaying(false);
          return;
        }
      } else {
        timeRef.current = next;
        setTimeMs(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop]);

  const play = useCallback(() => {
    if (timeRef.current >= durationRef.current) seek(0);
    setPlaying(true);
  }, [seek]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  // Keep the playhead inside the timeline when its length shrinks.
  useEffect(() => {
    if (timeRef.current > durationMs) seek(durationMs);
  }, [durationMs, seek]);

  return { timeMs, playing, play, pause, toggle, seek };
}
