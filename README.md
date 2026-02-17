# Smart Bookmark App

A simple, secure, real-time bookmark manager.

Live demo supports **Google OAuth Login**, private bookmarks per user, and real-time updates across tabs.

---

## 🔗 Live Demo

👉 **Vercel URL:** _<https://smart-bookmark-app-olive-two.vercel.app/>_

---

## 📦 GitHub Repository

👉 **Repo:** _<https://github.com/imkk21/smart-bookmark-app>_

---

## ✨ Features

- Google OAuth authentication (no email/password)
- Add bookmarks with title and URL
- Bookmarks are **private to each user**
- Real-time updates using Supabase Realtime
- Delete your own bookmarks
- Fully deployed on Vercel

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript
- **Backend:** Supabase (Auth, PostgreSQL, Realtime)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

---

## 🗂️ Project Structure

```
smart-bookmark-app/
├── app/
│   ├── auth/callback/route.ts   # OAuth callback handler
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main app (login + bookmarks)
├── lib/
│   └── supabaseClient.ts        # Supabase client
├── public/
├── .env.local                   # Environment variables
├── README.md
```

---

## 🔐 Authentication Flow

1. User clicks **Sign in with Google**
2. Google OAuth flow is triggered via Supabase
3. Supabase redirects to `/auth/callback`
4. Auth code is exchanged for a session
5. Session is stored securely using cookies
6. User is redirected back to the app

---

## 🧠 Database & Security

### Bookmarks Table
- `id` (uuid)
- `user_id` (linked to auth.users)
- `title`
- `url`
- `description`
- `tag`
- `created_at`

### Row Level Security (RLS)
- Users can only **read, insert, and delete their own bookmarks**
- Enforced using `auth.uid()` policies

This guarantees that **User A can never see User B’s data**.

---

## 🔄 Realtime Updates

Supabase Realtime listens for changes on the `bookmarks` table filtered by `user_id`.

If you:
- Open two tabs
- Add a bookmark in one tab

➡️ It appears instantly in the other tab without refresh.

---

## 🚧 Problems Faced & Solutions

### 1. Google OAuth callback errors
**Problem:** Redirect and cookie issues with Next.js App Router  
**Solution:** Implemented a custom OAuth callback using Supabase SSR helpers and explicit cookie handlers.

---

### 2. Next.js 16 cookie API breaking changes
**Problem:** `cookies()` became async and removed `getAll()`  
**Solution:** Switched to supported `get / set / remove` cookie methods as recommended by Supabase.

---

### 3. Realtime triggering for all users
**Problem:** Realtime events firing globally  
**Solution:** Added `user_id` filter to Realtime subscription.

---

### 4. RLS blocking inserts
**Problem:** Inserts silently failing  
**Solution:** Fixed RLS `WITH CHECK` policy to match `auth.uid()`.

---

## 🚀 Deployment

1. Push code to GitHub
2. Import repo into Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Update Google OAuth redirect URLs for production
5. Deploy 🎉

---

## ✅ Final Notes

- No test users required (Google OAuth works for any account)
- App is intentionally simple and production-focused
- Emphasis was placed on correctness, security, and clarity

---

**Built with ❤️ using Next.js & Supabase**
