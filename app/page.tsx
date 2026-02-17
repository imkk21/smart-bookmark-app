"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

type Bookmark = {
  id: string;
  title: string;
  url: string;
  description?: string;
  tag?: string;
  favicon?: string;
  created_at: string;
};

const TAG_OPTIONS = ["Design", "Dev", "Reading", "Tools", "Research", "Misc"];

const TAG_COLORS: Record<string, string> = {
  Design:   "bg-rose-500/20 text-rose-300 border-rose-500/30",
  Dev:      "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Reading:  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Tools:    "bg-violet-500/20 text-violet-300 border-violet-500/30",
  Research: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Misc:     "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function getFavicon(url: string) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [filtered, setFiltered] = useState<Bookmark[]>([]);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState("");

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "alpha">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ✅ Click-to-toggle profile dropdown
  const [profileOpen, setProfileOpen] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const userIdRef = useRef<string | null>(null);
  // ✅ Ref to detect clicks outside the dropdown
  const profileRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ✅ Close dropdown when clicking anywhere outside it
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  const fetchBookmarks = useCallback(async () => {
    if (!userIdRef.current) return;
    const { data, error } = await supabase
      .from("bookmarks")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setBookmarks(data || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    userIdRef.current = user.id;
    fetchBookmarks();
    const channel = supabase
      .channel("realtime-bookmarks")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setBookmarks((prev) => [payload.new as Bookmark, ...prev]);
          } else if (payload.eventType === "DELETE") {
            setBookmarks((prev) => prev.filter((b) => b.id !== payload.old.id));
          } else if (payload.eventType === "UPDATE") {
            setBookmarks((prev) => prev.map((b) => (b.id === payload.new.id ? (payload.new as Bookmark) : b)));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchBookmarks]);

  useEffect(() => {
    let result = [...bookmarks];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q)
      );
    }
    if (activeTag !== "All") result = result.filter((b) => b.tag === activeTag);
    if (sortBy === "oldest") result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortBy === "alpha") result.sort((a, b) => a.title.localeCompare(b.title));
    setFiltered(result);
  }, [bookmarks, search, activeTag, sortBy]);

  useEffect(() => {
    if (panelOpen) setTimeout(() => titleRef.current?.focus(), 100);
  }, [panelOpen]);

  const resetForm = () => {
    setTitle(""); setUrl(""); setDescription(""); setTag(""); setEditId(null);
  };

  const openEdit = (bm: Bookmark) => {
    setTitle(bm.title); setUrl(bm.url);
    setDescription(bm.description || ""); setTag(bm.tag || "");
    setEditId(bm.id); setPanelOpen(true);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !url.trim()) return;
    setSubmitting(true);
    if (editId) {
      const { error } = await supabase.from("bookmarks").update({ title, url, description, tag }).eq("id", editId);
      if (!error) { toast("Bookmark updated ✦"); resetForm(); setPanelOpen(false); }
      else toast("Failed to update — try again");
    } else {
      const { error } = await supabase.from("bookmarks").insert({ title, url, description, tag, user_id: user.id });
      if (!error) { toast("Bookmark saved ✦"); resetForm(); setPanelOpen(false); }
      else toast("Failed to save — try again");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    setDeleteTarget(null);
    toast("Bookmark deleted");
    const { error } = await supabase.from("bookmarks").delete().eq("id", id);
    if (error) { toast("Delete failed — restoring..."); fetchBookmarks(); }
  };

  const allTags = ["All", ...TAG_OPTIONS.filter((t) => bookmarks.some((b) => b.tag === t))];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-t-amber-400 border-white/10 animate-spin" />
          <p className="text-white/30 text-sm tracking-widest uppercase font-mono">Loading</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDM0djJoLTJ2LTJoMnptMC00aDJ2MmgtMnYtMnptLTQgMHYyaC0ydi0yaDJ6bTIgMGgydjJoLTJ2LTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-40 pointer-events-none" />
        <div className="relative z-10 text-center px-6">
          <div className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-white/50 text-xs tracking-widest uppercase font-mono">Vault</span>
          </div>
          <h1 className="text-6xl font-black text-white tracking-tight mb-3" style={{ fontFamily: "'Georgia', serif" }}>
            Book<span className="text-amber-400">mark</span>
          </h1>
          <p className="text-white/40 text-lg mb-10 font-light">Your curated corner of the internet.</p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } })}
            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-black font-semibold rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-white/10 active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
            <span className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-amber-500/4 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-violet-500/4 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-cyan-500/3 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDM0djJoLTJ2LTJoMnptMC00aDJ2MmgtMnYtMnptLTQgMHYyaC0ydi0yaDJ6bTIgMGgydjJoLTJ2LTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 border-b border-white/5 backdrop-blur-xl bg-[#0a0a0f]/80 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">Vault</h1>
              <p className="text-xs text-white/30 font-mono">{bookmarks.length} saved</p>
            </div>
          </div>

          <div className="flex-1 max-w-sm hidden sm:block">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Search bookmarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-400/50 focus:bg-white/8 transition-all duration-200"
                style={{ fontFamily: "system-ui, sans-serif" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-white/5 border border-white/10 rounded-lg p-1 gap-1">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === "grid" ? "bg-white/15 text-white" : "text-white/30 hover:text-white/60"}`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3A1.5 1.5 0 0115 10.5v3A1.5 1.5 0 0113.5 15h-3A1.5 1.5 0 019 13.5v-3z"/>
                </svg>
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === "list" ? "bg-white/15 text-white" : "text-white/30 hover:text-white/60"}`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/>
                </svg>
              </button>
            </div>

            <button
              onClick={() => { resetForm(); setPanelOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-amber-400/25 active:scale-95"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
              </svg>
              <span className="hidden sm:inline">Add</span>
            </button>

            {/* ✅ Click-to-toggle avatar dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((prev) => !prev)}
                className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all duration-200 ${
                  profileOpen ? "border-amber-400/60 ring-2 ring-amber-400/20" : "border-white/10 hover:border-white/30"
                }`}
              >
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-bold">{user.email?.[0].toUpperCase()}</div>
                }
              </button>

              {/* Dropdown — only renders when open */}
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-[#141418] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50 animate-in slide-in-from-top-2 fade-in duration-150">
                  {/* User info */}
                  <div className="px-4 py-3.5 border-b border-white/5">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-white/10">
                        {user.user_metadata?.avatar_url
                          ? <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold">{user.email?.[0].toUpperCase()}</div>
                        }
                      </div>
                      <p className="text-xs text-white/70 font-medium truncate" style={{ fontFamily: "system-ui, sans-serif" }}>
                        {user.user_metadata?.full_name || "My Account"}
                      </p>
                    </div>
                    <p className="text-[11px] text-white/30 truncate pl-10" style={{ fontFamily: "system-ui, sans-serif" }}>{user.email}</p>
                  </div>

                  {/* Sign out */}
                  <button
                    onClick={async () => {
                      setProfileOpen(false);
                      await supabase.auth.signOut();
                      location.reload();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:hidden px-6 pb-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-400/50 transition-all"
              style={{ fontFamily: "system-ui, sans-serif" }}
            />
          </div>
        </div>
      </header>

      {/* ── Filter Bar ── */}
      <div className="relative z-10 border-b border-white/5 bg-[#0a0a0f]/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 shrink-0">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap border ${
                  activeTag === t
                    ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                    : "bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:bg-white/10"
                }`}
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="shrink-0 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/50 focus:outline-none focus:border-white/30 cursor-pointer"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <svg className="w-9 h-9 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3-7 3V5z"/>
              </svg>
            </div>
            <p className="text-white/40 text-lg mb-2">
              {search || activeTag !== "All" ? "No results found" : "Your vault is empty"}
            </p>
            <p className="text-white/20 text-sm mb-8" style={{ fontFamily: "system-ui, sans-serif" }}>
              {search || activeTag !== "All" ? "Try a different search or filter" : "Start saving links to build your collection"}
            </p>
            {!search && activeTag === "All" && (
              <button
                onClick={() => setPanelOpen(true)}
                className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-black font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-amber-400/20 active:scale-95"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                Add your first bookmark
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((bm) => (
              <BookmarkCard key={bm.id} bm={bm} onEdit={openEdit} onDelete={setDeleteTarget} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((bm) => (
              <BookmarkRow key={bm.id} bm={bm} onEdit={openEdit} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      {/* ── Add/Edit Panel ── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setPanelOpen(false); resetForm(); }} />
          <div className="relative z-10 w-full sm:max-w-lg bg-[#111116] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div>
                <h2 className="font-bold text-white text-lg">{editId ? "Edit Bookmark" : "New Bookmark"}</h2>
                <p className="text-white/30 text-xs mt-0.5" style={{ fontFamily: "system-ui, sans-serif" }}>
                  {editId ? "Update the details below" : "Save a link to your vault"}
                </p>
              </div>
              <button onClick={() => { setPanelOpen(false); resetForm(); }} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4" style={{ fontFamily: "system-ui, sans-serif" }}>
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-widest font-semibold">Title *</label>
                <input ref={titleRef} type="text" placeholder="My awesome link" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-amber-400/60 focus:bg-white/8 transition-all duration-200 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-widest font-semibold">URL *</label>
                <input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-amber-400/60 transition-all duration-200 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-widest font-semibold">Note <span className="text-white/20 normal-case tracking-normal">(optional)</span></label>
                <textarea placeholder="Add a quick note..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-amber-400/60 transition-all duration-200 text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-widest font-semibold">Tag</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((t) => (
                    <button key={t} onClick={() => setTag(tag === t ? "" : t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${tag === t ? TAG_COLORS[t] : "bg-white/5 text-white/30 border-white/10 hover:text-white/60 hover:bg-white/8"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSubmit} disabled={!title.trim() || !url.trim() || submitting}
                className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 disabled:bg-white/10 disabled:text-white/20 text-black font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-amber-400/25 active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={editId ? "M5 13l4 4L19 7" : "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"}/>
                    </svg>
                    {editId ? "Update Bookmark" : "Save to Vault"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 bg-[#111116] border border-white/10 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 mx-auto">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-center mb-1">Delete bookmark?</h3>
            <p className="text-white/40 text-sm text-center mb-6" style={{ fontFamily: "system-ui, sans-serif" }}>This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm font-medium transition-all"
                style={{ fontFamily: "system-ui, sans-serif" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-all hover:shadow-lg hover:shadow-red-500/20 active:scale-95"
                style={{ fontFamily: "system-ui, sans-serif" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 bg-[#1a1a22] border border-white/15 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <p className="text-white text-sm font-medium" style={{ fontFamily: "system-ui, sans-serif" }}>{toastMsg}</p>
        </div>
      )}
    </main>
  );
}

function BookmarkCard({ bm, onEdit, onDelete }: { bm: Bookmark; onEdit: (b: Bookmark) => void; onDelete: (id: string) => void }) {
  const favicon = getFavicon(bm.url);
  return (
    <div className="group relative bg-white/3 hover:bg-white/6 border border-white/8 hover:border-white/15 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 flex flex-col">
      {bm.tag && (
        <div className={`h-0.5 w-full ${bm.tag === "Design" ? "bg-rose-500" : bm.tag === "Dev" ? "bg-cyan-500" : bm.tag === "Reading" ? "bg-amber-500" : bm.tag === "Tools" ? "bg-violet-500" : bm.tag === "Research" ? "bg-emerald-500" : "bg-slate-500"}`} />
      )}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
            {favicon ? (
              <img src={favicon} alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <svg className="w-4 h-4 text-white/20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
            )}
          </div>
          {bm.tag && (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${TAG_COLORS[bm.tag]}`} style={{ fontFamily: "system-ui, sans-serif" }}>{bm.tag}</span>
          )}
        </div>
        <div className="flex-1">
          <a href={bm.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-white/90 hover:text-amber-300 transition-colors text-sm leading-snug line-clamp-2 block">{bm.title}</a>
          {bm.description && <p className="text-white/30 text-xs mt-1.5 line-clamp-2 leading-relaxed" style={{ fontFamily: "system-ui, sans-serif" }}>{bm.description}</p>}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-white/20 text-[10px] font-mono">{timeAgo(bm.created_at)}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button onClick={() => onEdit(bm)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/70 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <a href={bm.url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/70 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
            <button onClick={() => onDelete(bm.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/15 flex items-center justify-center text-white/30 hover:text-red-400 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookmarkRow({ bm, onEdit, onDelete }: { bm: Bookmark; onEdit: (b: Bookmark) => void; onDelete: (id: string) => void }) {
  const favicon = getFavicon(bm.url);
  let domain = "";
  try { domain = new URL(bm.url).hostname.replace("www.", ""); } catch {}
  return (
    <div className="group flex items-center gap-4 px-4 py-3.5 bg-white/3 hover:bg-white/6 border border-white/8 hover:border-white/15 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-black/30">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
        {favicon ? (
          <img src={favicon} alt="" className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <svg className="w-3.5 h-3.5 text-white/20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <a href={bm.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-white/90 hover:text-amber-300 text-sm truncate transition-colors">{bm.title}</a>
        <span className="text-white/20 text-xs font-mono truncate hidden sm:block">{domain}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {bm.tag && <span className={`hidden sm:inline px-2 py-0.5 rounded-md text-[10px] font-semibold border ${TAG_COLORS[bm.tag]}`} style={{ fontFamily: "system-ui, sans-serif" }}>{bm.tag}</span>}
        <span className="text-white/20 text-[10px] font-mono hidden sm:block">{timeAgo(bm.created_at)}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(bm)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/70 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onClick={() => onDelete(bm.id)} className="w-7 h-7 rounded-lg hover:bg-red-500/15 flex items-center justify-center text-white/30 hover:text-red-400 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
