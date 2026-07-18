'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './socket-provider';
import CustomPlayer from './custom-player';
import { getYoutubeVideoInfo } from '@/lib/youtube';
import {
  Users, Copy, Check, Send, Plus, Trash2,
  Film, MessageSquare, ListMusic, LogOut,
  Search, Link, X, Loader2, Music2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface RoomProps {
  roomId:           string;
  username:         string;
  initialRoomState: any;
  onLeave:          () => void;
}

interface PlaylistItem {
  id:        string;
  title:     string;
  url:       string;
  type:      'youtube';
  addedBy:   string;
  thumbnail?: string;
}

interface User {
  id:       string;
  username: string;
  isHost:   boolean;
}

interface ChatMessage {
  id:        string;
  sender:    string;
  message:   string;
  timestamp: number;
}

interface SearchResult {
  id:        string;
  title:     string;
  channel:   string;
  thumbnail: string;
  url:       string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function Room({ roomId, username, initialRoomState, onLeave }: RoomProps) {
  const { socket, isConnected } = useSocket();

  const [playlist,     setPlaylist]     = useState<PlaylistItem[]>(initialRoomState?.playlist     || []);
  const [currentIndex, setCurrentIndex] = useState<number>       (initialRoomState?.currentIndex || 0);
  const [isPlaying,    setIsPlaying]    = useState<boolean>      (initialRoomState?.isPlaying    || false);
  const [seekTime,     setSeekTime]     = useState<number>       (initialRoomState?.seekTime     || 0);
  const [users,        setUsers]        = useState<User[]>       (initialRoomState?.users        || []);

  const [volume,        setVolume]        = useState(0.6);
  const [chatMessages,  setChatMessages]  = useState<ChatMessage[]>([]);
  const [chatInput,     setChatInput]     = useState('');
  const [copied,        setCopied]        = useState(false);

  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);
  const [addingId,      setAddingId]      = useState<string | null>(null);

  const [pasteUrl,      setPasteUrl]      = useState('');
  const [isPasting,     setIsPasting]     = useState(false);

  // Mobile view panel selector: 'player' | 'add' | 'queue' | 'chat'
  const [mobilePanel,   setMobilePanel]   = useState<'player' | 'add' | 'queue' | 'chat'>('player');

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const stateRef      = useRef({ isPlaying, seekTime, currentIndex });

  useEffect(() => {
    stateRef.current = { isPlaying, seekTime, currentIndex };
  }, [isPlaying, seekTime, currentIndex]);

  const currentSocketId = socket?.id;
  const isHost = users.find(u => u.id === currentSocketId)?.isHost ?? false;

  // ── Socket event handling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    socket.on('room:users-updated', (u: User[]) => setUsers(u));
    socket.on('host:changed', ({ hostId, username: hName }) => {
      setUsers(prev => prev.map(u => ({ ...u, isHost: u.id === hostId })));
      if (hostId === socket.id) toast.info('You are now the Host.');
      else toast.info(`${hName} is now the Host.`);
    });
    socket.on('playback:sync',        ({ isPlaying: p, seekTime: s, currentIndex: i }) => { setCurrentIndex(i); setIsPlaying(p); if (s !== undefined) setSeekTime(s); });
    socket.on('playback:seek',        ({ seekTime: s })                                 => setSeekTime(s));
    socket.on('playlist:updated',     ({ playlist: pl, currentIndex: i })              => { setPlaylist(pl); setCurrentIndex(i); });
    socket.on('playlist:index-changed',({ currentIndex: i, isPlaying: p })            => { setCurrentIndex(i); setIsPlaying(p); setSeekTime(0); });
    socket.on('chat:message',         (msg: ChatMessage)                               => setChatMessages(prev => [...prev, msg]));
    socket.on('host:request-status',  ({ requesterId }) => {
      const { isPlaying: p, seekTime: s } = stateRef.current;
      socket.emit('host:send-status', { roomId, requesterId, seekTime: s, isPlaying: p });
    });
    return () => {
      ['room:users-updated','host:changed','playback:sync','playback:seek',
       'playlist:updated','playlist:index-changed','chat:message','host:request-status']
        .forEach(e => socket.off(e));
    };
  }, [socket, roomId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Playback control handlers ─────────────────────────────────────────────
  const handlePlayToggle = (p: boolean) => { if (!isHost) return; setIsPlaying(p); socket?.emit('playback:state', { roomId, isPlaying: p, seekTime }); };
  const handleSeek       = (s: number)  => { if (!isHost) return; setSeekTime(s); socket?.emit('playback:seek', { roomId, seekTime: s }); };
  const handleProgress   = (t: number)  => { if (!isHost) return; setSeekTime(t); };
  const handleEnded      = ()           => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex + 1) % playlist.length }); };
  const handleNext       = ()           => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex + 1) % playlist.length }); };
  const handlePrev       = ()           => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex - 1 + playlist.length) % playlist.length }); };
  const selectTrack      = (i: number)  => { if (!isHost) { toast.error('Only the Host can switch videos.'); return; } socket?.emit('playlist:select', { roomId, index: i }); };
  const removeTrack      = (e: React.MouseEvent, id: string) => { e.stopPropagation(); socket?.emit('playlist:remove', { roomId, itemId: id }); };
  const clearQueue       = ()           => { if (!isHost) return; socket?.emit('playlist:clear', { roomId }); };

  // ── YouTube Search API call ───────────────────────────────────────────────
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true); setSearchError(null); setSearchResults([]);
    try {
      const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(q)}&limit=12`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setSearchResults(data.results || []);
      if (!data.results?.length) setSearchError('No results found. Try a different search.');
    } catch (err: any) {
      setSearchError(err.message || 'Search failed. Check your API key in backend/.env');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const addFromSearch = async (result: SearchResult) => {
    if (!socket) return;
    setAddingId(result.id);
    socket.emit('playlist:add', {
      roomId,
      item: {
        title: result.title,
        url: result.url,
        type: 'youtube',
        addedBy: username,
        thumbnail: result.thumbnail
      }
    });
    toast.success('Added to queue');
    setAddingId(null);
  };

  const handlePasteUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = pasteUrl.trim();
    if (!raw || !socket) return;
    if (!/youtube\.com|youtu\.be/i.test(raw)) { toast.error('Please enter a valid YouTube URL.'); return; }
    setIsPasting(true);
    try {
      const info = await getYoutubeVideoInfo(raw);
      socket.emit('playlist:add', { roomId, item: { title: info.title, url: raw, type: 'youtube', addedBy: username } });
      setPasteUrl(''); toast.success('Added to queue');
    } catch { toast.error('Could not fetch video info. Check the URL.'); }
    finally { setIsPasting(false); }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || !socket) return;
    socket.emit('chat:send', { roomId, username, message: msg });
    setChatInput('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true); toast.success('Room code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTrack = playlist[currentIndex] ?? null;

  // ── Render Helpers (safely inlined during render to prevent component unmounting focus loss) ──
  const renderAddPanel = () => (
    <div className="ss-card overflow-hidden bg-card border-border">
      <Tabs defaultValue="search">
        <div className="border-b border-border px-4 pt-4 pb-0">
          <TabsList className="grid grid-cols-2 bg-secondary p-0.5 w-44">
            <TabsTrigger value="search" className="data-[state=active]:bg-card data-[state=active]:text-primary gap-1.5 text-xs py-1.5 font-semibold">
              <Search className="w-3.5 h-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="url" className="data-[state=active]:bg-card data-[state=active]:text-primary gap-1.5 text-xs py-1.5 font-semibold">
              <Link className="w-3.5 h-3.5" /> URL
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Search View */}
        <TabsContent value="search" className="m-0 p-4 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search YouTube videos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={isSearching}
                className="ss-input pl-9 h-10 w-full"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button type="submit" disabled={isSearching || !searchQuery.trim()}
              className="bg-primary hover:bg-blue-500 text-white h-10 px-4 shrink-0 rounded-lg">
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          {searchError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{searchError}</div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {searchResults.map(result => (
                <div key={result.id} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-[#131620] hover:bg-secondary transition-colors">
                  <div className="w-16 h-10 rounded overflow-hidden bg-secondary shrink-0">
                    {result.thumbnail && <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground line-clamp-1 leading-normal">{result.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{result.channel}</p>
                  </div>
                  <button
                    onClick={() => addFromSearch(result)}
                    disabled={addingId === result.id}
                    className="shrink-0 w-8 h-8 rounded-lg bg-primary hover:bg-blue-500 flex items-center justify-center active:scale-90 transition-all disabled:opacity-60 text-white"
                  >
                    {addingId === result.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {!isSearching && !searchResults.length && !searchError && (
            <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
              <Search className="w-6 h-6 opacity-30" />
              <p className="text-xs text-center leading-relaxed">Search for any song or video on YouTube<br />to add it to the shared list</p>
            </div>
          )}
        </TabsContent>

        {/* URL Paste View */}
        <TabsContent value="url" className="m-0 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Paste a direct YouTube link to add it to the room.</p>
          <form onSubmit={handlePasteUrl} className="flex gap-2">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              disabled={isPasting}
              className="ss-input h-10 flex-1"
            />
            <Button type="submit" disabled={isPasting || !pasteUrl.trim()}
              className="bg-primary hover:bg-blue-500 text-white h-10 px-4 shrink-0 rounded-lg">
              {isPasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );

  const renderQueuePanel = () => (
    <div className="ss-card flex flex-col overflow-hidden bg-card border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground flex items-center gap-2">
          <ListMusic className="w-3.5 h-3.5 text-primary" /> Queue ({playlist.length})
        </span>
        {isHost && playlist.length > 0 && (
          <button onClick={clearQueue} className="text-[10px] text-red-400 hover:text-red-300 font-semibold transition-colors">Clear All</button>
        )}
      </div>
      <ScrollArea className="flex-1 p-3 max-h-[360px] overflow-y-auto">
        {playlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-28 gap-2 text-muted-foreground">
            <Film className="w-5 h-5 opacity-30" />
            <p className="text-xs">No songs in the queue</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {playlist.map((track, idx) => {
              const isCurrent = idx === currentIndex;
              return (
                <div key={track.id} onClick={() => selectTrack(idx)}
                  className={`group flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                    isCurrent ? 'bg-primary/10 border-primary/30' : 'border-border hover:bg-secondary'
                  } ${isHost ? 'cursor-pointer' : 'cursor-default'}`}>

                  <div className={`w-8 h-8 rounded shrink-0 overflow-hidden flex items-center justify-center border ${isCurrent ? 'border-primary/40' : 'border-border'}`}>
                    {track.thumbnail
                      ? <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
                      : <Film className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-semibold truncate ${isCurrent ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                    <p className="text-[9px] text-muted-foreground">by {track.addedBy}</p>
                  </div>

                  {isCurrent && isPlaying && (
                    <div className="flex items-end gap-0.5 h-3.5 shrink-0 pr-1">
                      {[1,2,3].map(i => (
                        <span key={i} className="w-0.5 bg-primary rounded-full audio-bar"
                          style={{ height: `${30 + i * 25}%`, animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  )}

                  {(isHost || track.addedBy === username) && (
                    <button onClick={e => removeTrack(e, track.id)}
                      className="opacity-0 group-hover:opacity-100 md:opacity-0 text-muted-foreground hover:text-red-400 p-1 rounded transition-all shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderChatPanel = () => (
    <div className="ss-card flex flex-col overflow-hidden bg-card border-border">
      <div className="flex items-center px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-primary" /> Chat
        </span>
      </div>
      <ScrollArea className="flex-1 p-3 max-h-[280px] overflow-y-auto">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
            <MessageSquare className="w-5 h-5 opacity-30" />
            <p className="text-xs">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chatMessages.map(msg => {
              const isMe = msg.sender === username;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${isMe ? 'ml-auto' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    <span className="text-[10px] font-bold text-muted-foreground">{msg.sender}</span>
                    <span className="text-[9px] text-muted-foreground/50 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-2xl text-xs leading-relaxed ${
                    isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-secondary border border-border text-foreground rounded-tl-sm'
                  }`}>{msg.message}</div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
        )}
      </ScrollArea>
      <form onSubmit={handleSendChat} className="flex gap-2 p-3 border-t border-border bg-card shrink-0">
        <Input
          placeholder="Send a message…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          className="ss-input flex-1 h-9 text-xs"
        />
        <Button type="submit" size="icon" disabled={!chatInput.trim()}
          className="bg-primary hover:bg-blue-500 text-white h-9 w-9 shrink-0 flex items-center justify-center rounded-lg">
          <Send className="w-3.5 h-3.5" />
        </Button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-bold text-foreground tracking-tight">SoundSync</p>
            <p className="text-[10px] text-muted-foreground">Real-time room</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Room Code (desktop) */}
          <button onClick={copyRoomId}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:bg-accent transition-colors">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Room</span>
            <span className="font-mono font-bold text-primary text-sm tracking-wider">{roomId}</span>
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </button>

          {/* Connection Indicator */}
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />

          <button onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* ── Desktop Layout (MD and up) ── */}
      <main className="hidden md:grid md:grid-cols-3 gap-4 p-4 max-w-7xl w-full mx-auto flex-1">
        {/* Left: Player + Add */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <CustomPlayer
            url={currentTrack?.url ?? null}
            isPlaying={isPlaying} seekTime={seekTime} isHost={isHost}
            volume={volume} onVolumeChange={setVolume}
            onProgress={handleProgress} onDuration={() => {}}
            onPlayToggle={handlePlayToggle} onSeek={handleSeek}
            onEnded={handleEnded} onNext={handleNext} onPrev={handlePrev}
            hasPrev={playlist.length > 1} hasNext={playlist.length > 1}
          />
          {currentTrack && (
            <div className="ss-card flex items-center gap-3 px-4 py-3">
              {currentTrack.thumbnail
                ? <img src={currentTrack.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0"><Film className="w-4 h-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{currentTrack.title}</p>
                <p className="text-[10px] text-muted-foreground">Added by {currentTrack.addedBy}</p>
              </div>
              {isPlaying && (
                <div className="ml-auto flex items-end gap-0.5 h-4 shrink-0">
                  {[1,2,3].map(i => <span key={i} className="w-0.5 bg-primary rounded-full audio-bar" style={{ height: `${30+i*25}%`, animationDelay: `${i*0.15}s` }} />)}
                </div>
              )}
            </div>
          )}
          {renderAddPanel()}
        </div>

        {/* Right: Users + Queue + Chat */}
        <div className="flex flex-col gap-4">
          {/* Listeners list */}
          <div className="ss-card px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-primary" /> Listeners ({users.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {users.map(u => (
                <div key={u.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                    u.isHost ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary border-border text-muted-foreground'
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {u.username}
                  {u.isHost && <span className="text-[9px] font-bold">DJ</span>}
                  {u.id === currentSocketId && <span className="opacity-40">(you)</span>}
                </div>
              ))}
            </div>
          </div>
          {renderQueuePanel()}
          {renderChatPanel()}
        </div>
      </main>

      {/* ── Mobile Layout (Below MD) ── */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden">
        {/* Mobile active panel display */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {mobilePanel === 'player' && (
            <div className="space-y-3">
              <CustomPlayer
                url={currentTrack?.url ?? null}
                isPlaying={isPlaying} seekTime={seekTime} isHost={isHost}
                volume={volume} onVolumeChange={setVolume}
                onProgress={handleProgress} onDuration={() => {}}
                onPlayToggle={handlePlayToggle} onSeek={handleSeek}
                onEnded={handleEnded} onNext={handleNext} onPrev={handlePrev}
                hasPrev={playlist.length > 1} hasNext={playlist.length > 1}
              />
              {currentTrack && (
                <div className="ss-card flex items-center gap-3 px-4 py-3 bg-card border-border">
                  {currentTrack.thumbnail
                    ? <img src={currentTrack.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    : <div className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0"><Film className="w-4 h-4 text-muted-foreground" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">{currentTrack.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">by {currentTrack.addedBy}</p>
                  </div>
                </div>
              )}
              {/* Room Code on mobile */}
              <button onClick={copyRoomId} className="ss-card w-full flex items-center justify-between px-4 py-3 bg-card border-border">
                <span className="text-xs text-muted-foreground font-semibold">Room Code</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary tracking-widest">{roomId}</span>
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </button>
              {/* Listeners list */}
              <div className="ss-card px-4 py-3 bg-card border-border">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-primary" /> Listeners
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {users.map(u => (
                    <div key={u.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      u.isHost ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary border-border text-muted-foreground'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {u.username}
                      {u.isHost && <span className="text-[9px] font-bold">DJ</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {mobilePanel === 'add'    && renderAddPanel()}
          {mobilePanel === 'queue'  && renderQueuePanel()}
          {mobilePanel === 'chat'   && renderChatPanel()}
        </div>

        {/* Mobile Navigation bar */}
        <div className="shrink-0 border-t border-border bg-card">
          <div className="grid grid-cols-4 divide-x divide-border">
            {([
              { id: 'player', icon: Music2,        label: 'Player' },
              { id: 'add',    icon: Search,        label: 'Search' },
              { id: 'queue',  icon: ListMusic,     label: 'Queue'  },
              { id: 'chat',   icon: MessageSquare, label: 'Chat'   },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMobilePanel(id)}
                className={`flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors ${
                  mobilePanel === id ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {mobilePanel === id && <span className="w-1 h-1 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
