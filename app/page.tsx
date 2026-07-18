'use client';

import React, { useState } from 'react';
import { useSocket } from '@/components/socket-provider';
import Room from '@/components/room';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Music2, Radio, Plus, ArrowRight, WifiOff, Loader2, Users, PlayCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const { socket, isConnected, error } = useSocket();

  const [username,     setUsername]     = useState('');
  const [roomInput,    setRoomInput]    = useState('');
  const [mode,         setMode]         = useState<'create' | 'join' | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomState,    setRoomState]    = useState<any>(null);

  const handleCreateRoom = () => {
    if (!username.trim()) { toast.error('Enter a nickname to continue.'); return; }
    if (!isConnected || !socket) { toast.error('Server is offline. Start the backend first.'); return; }
    setIsLoading(true);
    socket.emit('room:create', { username: username.trim() }, (res: any) => {
      setIsLoading(false);
      if (res?.success) { setRoomState(res.roomState); setActiveRoomId(res.roomId); }
      else toast.error('Failed to create room. Try again.');
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { toast.error('Enter a nickname.'); return; }
    if (!roomInput.trim()) { toast.error('Enter a room code.'); return; }
    if (!isConnected || !socket) { toast.error('Server is offline.'); return; }
    setIsLoading(true);
    socket.emit('room:join', { roomId: roomInput.trim().toUpperCase(), username: username.trim() }, (res: any) => {
      setIsLoading(false);
      if (res?.success) { setRoomState(res.roomState); setActiveRoomId(res.roomId); }
      else toast.error(res?.error || 'Room not found. Check the code.');
    });
  };

  const handleLeaveRoom = () => { setActiveRoomId(null); setRoomState(null); setMode(null); };

  if (activeRoomId && roomState) {
    return <Room roomId={activeRoomId} username={username.trim()} initialRoomState={roomState} onLeave={handleLeaveRoom} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">

      {/* ── Logo & Title ── */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
          <Music2 className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">SoundSync</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Listen to YouTube videos together in real time. Create a room or join one with a code.
        </p>
      </div>

      {/* ── Server offline banner ── */}
      {!isConnected && (
        <div className="w-full max-w-sm mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Sync server offline</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error || 'Make sure backend is running on port 5000.'}</p>
          </div>
        </div>
      )}

      {/* ── Main Card ── */}
      <div className="w-full max-w-sm ss-card p-6 space-y-5">

        {/* Step label */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
            {mode === 'create' ? 'Create Room' : mode === 'join' ? 'Join Room' : 'Get Started'}
          </p>
          <p className="text-foreground font-semibold">
            {mode === 'create' ? 'Set your nickname and host a new room.'
              : mode === 'join' ? 'Enter your nickname and room code.'
              : 'Choose how you want to connect.'}
          </p>
        </div>

        {/* Nickname input — shown once a mode is selected */}
        {mode !== null && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Nickname</label>
            <Input
              placeholder="Your name (e.g. Alex)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={18}
              className="ss-input w-full h-11"
              autoFocus
            />
          </div>
        )}

        {/* ── Mode: none → show two big buttons ── */}
        {mode === null && (
          <div className="space-y-3 pt-1">
            <button
              onClick={() => setMode('create')}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-blue-500 active:scale-95 transition-all"
            >
              <span className="flex items-center gap-2.5">
                <Plus className="w-4 h-4" />
                Create a Room
              </span>
              <ArrowRight className="w-4 h-4 opacity-70" />
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-secondary active:scale-95 transition-all"
            >
              <span className="flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-primary" />
                Join a Room
              </span>
              <ArrowRight className="w-4 h-4 opacity-40" />
            </button>
          </div>
        )}

        {/* ── Mode: create ── */}
        {mode === 'create' && (
          <div className="space-y-3">
            <Button
              onClick={handleCreateRoom}
              disabled={isLoading || !username.trim() || !isConnected}
              className="w-full h-11 bg-primary hover:bg-blue-500 text-white font-semibold text-sm"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Room'}
            </Button>
            <button onClick={() => setMode(null)} className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
              Back
            </button>
          </div>
        )}

        {/* ── Mode: join ── */}
        {mode === 'join' && (
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Room Code</label>
              <Input
                placeholder="6-character code"
                value={roomInput}
                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                maxLength={6}
                className="ss-input w-full h-11 font-mono text-center tracking-[0.3em] font-bold uppercase text-lg"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading || !username.trim() || !roomInput.trim() || !isConnected}
              className="w-full h-11 bg-primary hover:bg-blue-500 text-white font-semibold text-sm"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join Room'}
            </Button>
            <button type="button" onClick={() => setMode(null)} className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
              Back
            </button>
          </form>
        )}
      </div>

      {/* ── Feature hints ── */}
      <div className="w-full max-w-sm grid grid-cols-3 gap-2 mt-5">
        {[
          { icon: PlayCircle,     label: 'YouTube Sync',   desc: 'Play videos together' },
          { icon: Users,          label: 'Group Rooms',    desc: 'Invite with a code'   },
          { icon: MessageSquare,  label: 'Live Chat',      desc: 'Chat while listening' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="ss-card flex flex-col items-center gap-1.5 p-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-[11px] font-semibold text-foreground leading-tight">{label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
