'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, SkipForward, SkipBack,
  Music2, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface CustomPlayerProps {
  url:          string | null;
  isPlaying:    boolean;
  seekTime:     number;
  isHost:       boolean;
  volume:       number;
  onVolumeChange: (v: number) => void;
  onProgress:   (t: number) => void;
  onDuration:   (d: number) => void;
  onPlayToggle: (p: boolean) => void;
  onSeek:       (s: number) => void;
  onEnded:      () => void;
  onNext:       () => void;
  onPrev:       () => void;
  hasPrev:      boolean;
  hasNext:      boolean;
}

// ── YouTube IFrame API singleton loader ──────────────────────────────────────
let _ytReady = false;
let _ytLoading = false;
const _ytCbs: (() => void)[] = [];

function loadYT(cb: () => void) {
  if (_ytReady) { cb(); return; }
  _ytCbs.push(cb);
  if (_ytLoading) return;
  _ytLoading = true;
  (window as any).onYouTubeIframeAPIReady = () => {
    _ytReady = true;
    _ytCbs.forEach(f => f());
    _ytCbs.length = 0;
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

function extractId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v');
  } catch { return null; }
}

function fmtTime(s: number) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function CustomPlayer({
  url, isPlaying, seekTime, isHost, volume,
  onVolumeChange, onProgress, onDuration,
  onPlayToggle, onSeek, onEnded,
  onNext, onPrev, hasPrev, hasNext,
}: CustomPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<any>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUrlRef   = useRef<string | null>(null);
  const seekGuard    = useRef(false);

  const [apiReady,    setApiReady]    = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [current,     setCurrent]     = useState(0);
  const [dur,         setDur]         = useState(0);
  const [dragging,    setDragging]    = useState(false);
  const [dragVal,     setDragVal]     = useState(0);

  useEffect(() => { loadYT(() => setApiReady(true)); }, []);

  useEffect(() => {
    if (!apiReady || !containerRef.current) return;
    if (!url) { destroy(); return; }
    const vid = extractId(url);
    if (!vid) return;
    if (lastUrlRef.current === url && playerRef.current) return;
    lastUrlRef.current = url;
    destroy();

    const div = document.createElement('div');
    containerRef.current.appendChild(div);

    playerRef.current = new (window as any).YT.Player(div, {
      videoId: vid,
      width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: (e: any) => {
          setPlayerReady(true);
          e.target.setVolume(volume * 100);
          if (seekTime > 0) e.target.seekTo(seekTime, true);
          const d = e.target.getDuration();
          if (d) { setDur(d); onDuration(d); }
        },
        onStateChange: (e: any) => {
          const YT = (window as any).YT.PlayerState;
          if (e.data === YT.ENDED)   { stopTimer(); onEnded(); }
          if (e.data === YT.PLAYING) { const d = e.target.getDuration(); setDur(d); onDuration(d); startTimer(); }
          if (e.data === YT.PAUSED)  { stopTimer(); }
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, url]);

  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    const YT = (window as any).YT?.PlayerState;
    if (!YT) return;
    const st = playerRef.current.getPlayerState?.();
    if (isPlaying && st !== YT.PLAYING)  playerRef.current.playVideo();
    if (!isPlaying && st === YT.PLAYING) playerRef.current.pauseVideo();
  }, [isPlaying, playerReady]);

  useEffect(() => {
    if (!playerRef.current || !playerReady || isHost || seekGuard.current) return;
    const c = playerRef.current.getCurrentTime?.() ?? 0;
    if (Math.abs(c - seekTime) > 2.5) { playerRef.current.seekTo(seekTime, true); setCurrent(seekTime); setDragVal(seekTime); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTime]);

  useEffect(() => {
    if (!playerRef.current || !playerReady) return;
    playerRef.current.setVolume(muted ? 0 : volume * 100);
  }, [volume, muted, playerReady]);

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      if (!playerRef.current || dragging) return;
      const t = playerRef.current.getCurrentTime?.() ?? 0;
      setCurrent(t); setDragVal(t);
      if (isHost) onProgress(t);
    }, 500);
  }
  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }

  function destroy() {
    stopTimer();
    try { playerRef.current?.destroy(); } catch (_) {}
    playerRef.current = null;
    setPlayerReady(false); setCurrent(0); setDragVal(0); setDur(0);
    if (containerRef.current) containerRef.current.innerHTML = '';
  }

  const onDragSeek = useCallback((v: number | readonly number[]) => {
    if (!isHost) return;
    const val = Array.isArray(v) ? (v as number[])[0] : (v as number);
    setDragVal(val); setDragging(true);
  }, [isHost]);

  const onCommitSeek = useCallback((v: number | readonly number[]) => {
    if (!isHost) return;
    const val = Array.isArray(v) ? (v as number[])[0] : (v as number);
    setDragging(false); seekGuard.current = true;
    setCurrent(val); playerRef.current?.seekTo(val, true); onSeek(val);
    setTimeout(() => { seekGuard.current = false; }, 800);
  }, [isHost, onSeek]);

  const hasVideo = !!url && !!extractId(url);

  return (
    <div className="w-full rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Video area ─────────────────────────────────────────── */}
      <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />

        {/* Empty state */}
        {!url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0d14]">
            <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center">
              <Music2 className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No video selected</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-[200px]">
              Search for a YouTube video and add it to the queue
            </p>
          </div>
        )}

        {/* Loading */}
        {url && !playerReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0d14]/95 z-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Loading video…</p>
          </div>
        )}

        {/* Guest block */}
        {url && playerReady && !isHost && (
          <div className="absolute inset-0 z-10 cursor-default" />
        )}

        {/* Role badge */}
        {url && playerReady && (
          <div className="absolute top-2.5 right-2.5 z-20">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
              isHost
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-secondary border-border text-muted-foreground'
            }`}>
              {isHost ? 'Host' : 'Guest'}
            </span>
          </div>
        )}
      </div>

      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="p-4 space-y-4">

        {/* Progress */}
        <div className="space-y-1">
          <Slider
            value={[dragging ? dragVal : current]}
            min={0} max={dur || 100} step={0.5}
            disabled={!isHost || !hasVideo}
            onValueChange={onDragSeek}
            onValueCommitted={onCommitSeek}
            className={!isHost ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          />
          <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
            <span>{fmtTime(dragging ? dragVal : current)}</span>
            <span>{fmtTime(dur)}</span>
          </div>
        </div>

        {/* Transport row */}
        <div className="flex items-center justify-between">

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMuted(m => !m)}
              disabled={!hasVideo}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <Slider
              value={[muted ? 0 : volume]}
              min={0} max={1} step={0.02}
              disabled={!hasVideo}
              onValueChange={v => onVolumeChange(Array.isArray(v) ? v[0] : v as number)}
              className="w-20 cursor-pointer"
            />
          </div>

          {/* Prev / Play / Next */}
          <div className="flex items-center gap-3">
            <button
              onClick={onPrev}
              disabled={!isHost || !hasPrev || !hasVideo}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => { if (isHost) onPlayToggle(!isPlaying); }}
              disabled={!isHost || !hasVideo || !playerReady}
              className="w-12 h-12 rounded-full bg-primary flex items-center justify-center hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {isPlaying
                ? <Pause className="w-5 h-5 fill-white text-white" />
                : <Play  className="w-5 h-5 fill-white text-white translate-x-0.5" />}
            </button>

            <button
              onClick={onNext}
              disabled={!isHost || !hasNext || !hasVideo}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Spacer to balance volume side */}
          <div className="w-[88px]" />
        </div>

        {!isHost && hasVideo && (
          <p className="text-center text-[10px] text-muted-foreground">Host controls playback</p>
        )}
      </div>
    </div>
  );
}
