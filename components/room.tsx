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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RoomProps {
  roomId:           string;
  username:         string;
  initialRoomState: any;
  onLeave:          () => void;
}

interface PlaylistItem {
  id:       string;
  title:    string;
  url:      string;
  type:     'youtube';
  addedBy:  string;
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
  id:          string;
  title:       string;
  channel:     string;
  thumbnail:   string;
  publishedAt: string;
  url:         string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

// ─── Component ────────────────────────────────────────────────────────────────
export default function Room({ roomId, username, initialRoomState, onLeave }: RoomProps) {
  const { socket, isConnected } = useSocket();

  // ── Room State ──
  const [playlist,     setPlaylist]     = useState<PlaylistItem[]>(initialRoomState?.playlist     || []);
  const [currentIndex, setCurrentIndex] = useState<number>       (initialRoomState?.currentIndex || 0);
  const [isPlaying,    setIsPlaying]    = useState<boolean>      (initialRoomState?.isPlaying    || false);
  const [seekTime,     setSeekTime]     = useState<number>       (initialRoomState?.seekTime     || 0);
  const [users,        setUsers]        = useState<User[]>       (initialRoomState?.users        || []);

  // ── Local UI State ──
  const [volume,          setVolume]          = useState(0.6);
  const [chatMessages,    setChatMessages]    = useState<ChatMessage[]>([]);
  const [chatInput,       setChatInput]       = useState('');
  const [copied,          setCopied]          = useState(false);

  // Search state
  const [searchQuery,     setSearchQuery]     = useState('');
  const [searchResults,   setSearchResults]   = useState<SearchResult[]>([]);
  const [isSearching,     setIsSearching]     = useState(false);
  const [searchError,     setSearchError]     = useState<string | null>(null);
  const [addingId,        setAddingId]        = useState<string | null>(null);

  // URL paste state
  const [pasteUrl,        setPasteUrl]        = useState('');
  const [isPasting,       setIsPasting]       = useState(false);

  const chatBottomRef  = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const stateRef       = useRef({ isPlaying, seekTime, currentIndex });
  useEffect(() => { stateRef.current = { isPlaying, seekTime, currentIndex }; }, [isPlaying, seekTime, currentIndex]);

  const currentSocketId = socket?.id;
  const isHost = users.find(u => u.id === currentSocketId)?.isHost ?? false;

  // ── Socket Listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('room:users-updated', (u: User[]) => setUsers(u));

    socket.on('host:changed', ({ hostId, username: hName }) => {
      setUsers(prev => prev.map(u => ({ ...u, isHost: u.id === hostId })));
      if (hostId === socket.id) toast.info('You are now the Host / DJ!', { duration: 5000 });
      else toast.info(`${hName} is now the Host.`, { duration: 4000 });
    });

    socket.on('playback:sync', ({ isPlaying: p, seekTime: s, currentIndex: i }) => {
      setCurrentIndex(i); setIsPlaying(p);
      if (s !== undefined) setSeekTime(s);
    });

    socket.on('playback:seek',          ({ seekTime: s })                       => setSeekTime(s));
    socket.on('playlist:updated',       ({ playlist: pl, currentIndex: i })     => { setPlaylist(pl); setCurrentIndex(i); });
    socket.on('playlist:index-changed', ({ currentIndex: i, isPlaying: p })    => { setCurrentIndex(i); setIsPlaying(p); setSeekTime(0); });
    socket.on('chat:message',           (msg: ChatMessage)                      => setChatMessages(prev => [...prev, msg]));

    socket.on('host:request-status', ({ requesterId }) => {
      const { isPlaying: p, seekTime: s } = stateRef.current;
      socket.emit('host:send-status', { roomId, requesterId, seekTime: s, isPlaying: p });
    });

    return () => {
      ['room:users-updated','host:changed','playback:sync','playback:seek',
       'playlist:updated','playlist:index-changed','chat:message','host:request-status']
        .forEach(e => socket.off(e));
    };
  }, [socket, roomId]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ── Playback Handlers ────────────────────────────────────────────────────
  const handlePlayToggle = (playing: boolean) => {
    if (!isHost) return;
    setIsPlaying(playing);
    socket?.emit('playback:state', { roomId, isPlaying: playing, seekTime });
  };
  const handleSeek    = (s: number) => { if (!isHost) return; setSeekTime(s); socket?.emit('playback:seek', { roomId, seekTime: s }); };
  const handleProgress = (t: number) => { if (!isHost) return; setSeekTime(t); };
  const handleEnded   = () => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex + 1) % playlist.length }); };
  const handleNext    = () => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex + 1) % playlist.length }); };
  const handlePrev    = () => { if (!isHost || !playlist.length) return; socket?.emit('playlist:select', { roomId, index: (currentIndex - 1 + playlist.length) % playlist.length }); };

  const selectTrack = (index: number) => {
    if (!isHost) { toast.error('Only the Host / DJ can switch videos.'); return; }
    socket?.emit('playlist:select', { roomId, index });
  };
  const removeTrack = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    socket?.emit('playlist:remove', { roomId, itemId: id });
  };
  const clearQueue = () => { if (!isHost) return; socket?.emit('playlist:clear', { roomId }); };

  // ── YouTube Search ────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(q)}&limit=12`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setSearchResults(data.results || []);
      if (!data.results?.length) setSearchError('No results found. Try a different search.');
    } catch (err: any) {
      setSearchError(err.message || 'Search failed. Check your API key.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Add from search result
  const addFromSearch = async (result: SearchResult) => {
    if (!socket) return;
    setAddingId(result.id);
    try {
      socket.emit('playlist:add', {
        roomId,
        item: {
          title:     result.title,
          url:       result.url,
          type:      'youtube',
          addedBy:   username,
          thumbnail: result.thumbnail,
        },
      });
      toast.success(`Added: ${result.title}`);
    } finally {
      setAddingId(null);
    }
  };

  // ── Paste URL ─────────────────────────────────────────────────────────────
  const handlePasteUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = pasteUrl.trim();
    if (!raw || !socket) return;
    if (!/youtube\.com|youtu\.be/i.test(raw)) {
      toast.error('Please enter a valid YouTube URL.');
      return;
    }
    setIsPasting(true);
    try {
      const info = await getYoutubeVideoInfo(raw);
      socket.emit('playlist:add', { roomId, item: { title: info.title, url: raw, type: 'youtube', addedBy: username } });
      setPasteUrl('');
      toast.success(`Added: ${info.title}`);
    } catch {
      toast.error('Could not fetch video info. Check the URL.');
    } finally {
      setIsPasting(false);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || !socket) return;
    socket.emit('chat:send', { roomId, username, message: msg });
    setChatInput('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    toast.success('Room code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTrack = playlist[currentIndex] ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-lg px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-700/30">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent leading-none">
              SoundSync
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium">Real-time Music Room</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Room</span>
            <span className="font-mono font-extrabold text-indigo-400 text-sm tracking-widest">{roomId}</span>
            <button onClick={copyRoomId} className="text-zinc-500 hover:text-zinc-200 transition-colors ml-1">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          <Button variant="destructive" size="sm" onClick={onLeave} className="gap-1.5 text-xs">
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* ── Main Grid ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left Column ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Player */}
          <CustomPlayer
            url={currentTrack?.url ?? null}
            isPlaying={isPlaying}
            seekTime={seekTime}
            isHost={isHost}
            volume={volume}
            onVolumeChange={setVolume}
            onProgress={handleProgress}
            onDuration={() => {}}
            onPlayToggle={handlePlayToggle}
            onSeek={handleSeek}
            onEnded={handleEnded}
            onNext={handleNext}
            onPrev={handlePrev}
            hasPrev={playlist.length > 1}
            hasNext={playlist.length > 1}
          />

          {/* Now Playing bar */}
          {currentTrack && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              {currentTrack.thumbnail ? (
                <img src={currentTrack.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4 text-red-500" />
                </div>
              )}
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-bold text-zinc-200 truncate">{currentTrack.title}</p>
                <p className="text-[10px] text-zinc-500">Added by {currentTrack.addedBy}</p>
              </div>
              {isPlaying && (
                <div className="flex items-end gap-0.5 h-4 shrink-0">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-1 bg-indigo-500 rounded-full animate-bounce"
                      style={{ height: `${40 + i * 20}%`, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Search / Add Panel ── */}
          <Card className="bg-zinc-900/60 border-zinc-800 shadow-xl overflow-hidden">
            <Tabs defaultValue="search">
              <div className="border-b border-zinc-800/70 px-4 pt-4 pb-0">
                <TabsList className="grid grid-cols-2 bg-zinc-950 border border-zinc-800 p-0.5 w-48">
                  <TabsTrigger value="search" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-indigo-400 gap-1.5 text-xs py-1.5">
                    <Search className="w-3 h-3" /> Search
                  </TabsTrigger>
                  <TabsTrigger value="url" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-indigo-400 gap-1.5 text-xs py-1.5">
                    <Link className="w-3 h-3" /> Paste URL
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── Search Tab ── */}
              <TabsContent value="search" className="m-0 p-4 space-y-3">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search YouTube — artists, songs, albums…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      disabled={isSearching}
                      className="pl-9 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-indigo-500 text-sm"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(null); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Button type="submit" disabled={isSearching || !searchQuery.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 min-w-[80px] gap-1.5">
                    {isSearching
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><Search className="w-4 h-4" />Search</>}
                  </Button>
                </form>

                {/* Error message */}
                {searchError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                    {searchError}
                  </div>
                )}

                {/* Results grid */}
                {searchResults.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                    {searchResults.map(result => (
                      <div key={result.id}
                        className="group flex gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
                        {/* Thumbnail */}
                        <div className="relative shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
                          {result.thumbnail
                            ? <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <Film className="absolute inset-0 m-auto w-5 h-5 text-zinc-600" />}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <p className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-snug">{result.title}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{result.channel}</p>
                        </div>
                        {/* Add button */}
                        <button
                          onClick={() => addFromSearch(result)}
                          disabled={addingId === result.id}
                          className="shrink-0 self-center w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-all disabled:opacity-60 active:scale-90"
                          title="Add to queue"
                        >
                          {addingId === result.id
                            ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                            : <Plus className="w-3.5 h-3.5 text-white" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state hint */}
                {!isSearching && !searchResults.length && !searchError && (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-zinc-600">
                    <Search className="w-8 h-8 opacity-30" />
                    <p className="text-xs text-center">Search for any song, artist, or album<br />and add it directly to the room queue</p>
                  </div>
                )}
              </TabsContent>

              {/* ── Paste URL Tab ── */}
              <TabsContent value="url" className="m-0 p-4">
                <CardDescription className="text-[11px] text-zinc-500 mb-3">
                  Paste a YouTube video URL directly. Useful when you have a specific link.
                </CardDescription>
                <form onSubmit={handlePasteUrl} className="flex gap-2">
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={pasteUrl}
                    onChange={e => setPasteUrl(e.target.value)}
                    disabled={isPasting}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-indigo-500 text-sm"
                  />
                  <Button type="submit" disabled={isPasting || !pasteUrl.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 gap-1.5 min-w-[90px]">
                    {isPasting
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <><Plus className="w-4 h-4" />Add</>}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* ── Right Column ── */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-[65px] lg:h-[calc(100vh-85px)]">

          {/* Active Users */}
          <Card className="bg-zinc-900/60 border-zinc-800 shrink-0">
            <CardHeader className="py-3 flex flex-row items-center space-y-0 gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <CardTitle className="text-sm font-bold text-zinc-200">Listeners ({users.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {users.map(u => (
                  <div key={u.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      u.isHost ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                               : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                    }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {u.username}
                    {u.isHost && <span className="text-[9px] text-amber-500 ml-0.5">DJ</span>}
                    {u.id === currentSocketId && <span className="text-[9px] opacity-50">(you)</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Queue + Chat */}
          <Card className="bg-zinc-900/60 border-zinc-800 flex flex-col flex-1 min-h-0 overflow-hidden">
            <Tabs defaultValue="queue" className="flex flex-col h-full">
              <div className="border-b border-zinc-800/70 px-3 pt-3 pb-0 shrink-0">
                <TabsList className="grid grid-cols-2 bg-zinc-950 border border-zinc-800 p-0.5 w-full">
                  <TabsTrigger value="queue" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-indigo-400 gap-1.5 text-xs py-1.5">
                    <ListMusic className="w-3.5 h-3.5" />Queue ({playlist.length})
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-indigo-400 gap-1.5 text-xs py-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />Chat
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Queue */}
              <TabsContent value="queue" className="flex-1 flex flex-col m-0 p-0 min-h-0 overflow-hidden outline-none">
                <div className="flex justify-between items-center px-3 py-2 border-b border-zinc-800/50 shrink-0">
                  <span className="text-[10px] text-zinc-600">{isHost ? 'Click a video to play' : 'DJ controls playback'}</span>
                  {isHost && playlist.length > 0 && (
                    <button onClick={clearQueue} className="text-[10px] text-red-400 hover:text-red-300 font-semibold">Clear All</button>
                  )}
                </div>
                <ScrollArea className="flex-1 p-3">
                  {playlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-600">
                      <Film className="w-6 h-6 opacity-40" />
                      <p className="text-xs">Queue is empty — search a song to add!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {playlist.map((track, idx) => {
                        const isCurrent = idx === currentIndex;
                        return (
                          <div key={track.id} onClick={() => selectTrack(idx)}
                            className={`group flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                              isCurrent
                                ? 'bg-indigo-600/10 border-indigo-500/50'
                                : 'bg-zinc-950/40 border-zinc-900 hover:bg-zinc-900/80 hover:border-zinc-800'
                            } ${isHost ? 'cursor-pointer' : 'cursor-default'}`}>

                            {/* Thumbnail or icon */}
                            <div className={`w-8 h-8 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ${
                              isCurrent ? 'ring-2 ring-indigo-500' : ''}`}>
                              {track.thumbnail
                                ? <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
                                : <div className={`w-full h-full flex items-center justify-center ${isCurrent ? 'bg-indigo-600' : 'bg-zinc-900 border border-zinc-800'}`}>
                                    {isCurrent && isPlaying
                                      ? <span className="flex gap-0.5 items-end h-3">
                                          {[1,2,3].map(i => <span key={i} className="w-0.5 bg-white rounded-full animate-bounce" style={{ height: `${30+i*25}%`, animationDelay: `${i*0.12}s` }} />)}
                                        </span>
                                      : <Film className="w-3.5 h-3.5 text-zinc-500" />}
                                  </div>}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className={`text-[11px] font-semibold truncate ${isCurrent ? 'text-indigo-400' : 'text-zinc-200'}`}>{track.title}</p>
                              <p className="text-[9px] text-zinc-600 truncate">by {track.addedBy}</p>
                            </div>

                            {(isHost || track.addedBy === username) && (
                              <button onClick={e => removeTrack(e, track.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 p-1 rounded transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Chat */}
              <TabsContent value="chat" className="flex-1 flex flex-col m-0 p-0 min-h-0 overflow-hidden outline-none">
                <ScrollArea className="flex-1 p-3">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-zinc-600">
                      <MessageSquare className="w-6 h-6 opacity-40" />
                      <p className="text-xs">No messages yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map(msg => {
                        const isMe = msg.sender === username;
                        return (
                          <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-1.5 mb-0.5 px-1">
                              <span className="text-[10px] font-bold text-zinc-400">{msg.sender}</span>
                              <span className="text-[9px] text-zinc-600 font-mono">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className={`px-3 py-1.5 rounded-2xl text-xs ${
                              isMe ? 'bg-indigo-600 text-white rounded-tr-sm'
                                   : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm'
                            }`}>{msg.message}</div>
                          </div>
                        );
                      })}
                      <div ref={chatBottomRef} />
                    </div>
                  )}
                </ScrollArea>
                <form onSubmit={handleSendChat} className="flex gap-2 p-3 border-t border-zinc-800 bg-zinc-950/30 shrink-0">
                  <Input
                    placeholder="Message room…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-indigo-500 h-8"
                  />
                  <Button type="submit" size="icon" disabled={!chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 h-8 w-8 rounded-lg shrink-0">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </main>
    </div>
  );
}
