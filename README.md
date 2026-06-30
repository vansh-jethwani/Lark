# 🚀 Lark

> A full-stack real-time chat application with a **WhatsApp-like messaging experience** built using the MERN stack, Socket.IO, Clerk Authentication, and ImageKit.

👨‍💻 **Author:** **Vansh Jethwani**

---

## 🔗 Links

* **GitHub:** https://github.com/vansh-jethwani/Lark
* **🌐 Live Demo:** https://lark-rxey.onrender.com/

---

## ✨ Features

* 🔐 Clerk-based authentication with protected API routes
* ⚡ Real-time messaging powered by Socket.IO
* 💬 One-to-one conversations
* 📌 Latest conversations automatically move to the top
* 🔴 WhatsApp-style unread message badges
* ✅ Delivered & read receipts
* 🔄 Real-time chat list updates without refreshing
* 🖼️ Image, 🎥 video, and 📄 document sharing
* ☁️ ImageKit-backed media storage and delivery
* 🟢 Online/offline user presence
* 🔍 Searchable users and conversations
* 📱 Fully responsive mobile-friendly UI
* 🌙 Light/Dark mode with customizable accent themes
* 🐳 Docker support for production-ready deployment

---

# 🛠️ Tech Stack

## 🎨 Frontend

* React 19
* Vite
* React Router
* Zustand
* Axios
* Socket.IO Client
* Clerk React
* HeroUI
* Tailwind CSS
* Lucide React
* React Hot Toast

## ⚙️ Backend

* Node.js
* Express 5
* MongoDB + Mongoose
* Socket.IO
* Clerk Express
* Multer
* ImageKit Node SDK
* CORS
* Dotenv
* Cron

## ☁️ Infrastructure

* Docker (Multi-stage Build)
* Express Static Hosting
* MongoDB
* ImageKit
* Clerk Authentication & Webhooks

---

# 📂 Project Structure

```txt
Lark/
  backend/
    src/
      controllers/      API route handlers
      lib/              Database, sockets, ImageKit, cron
      middlewares/      Authentication & upload middleware
      models/           Mongoose models
      routes/           Express routes
      webhooks/         Clerk webhook handling
      index.js          Express entry point
    package.json

  frontend/
    public/             Static assets
    src/
      components/       UI components
      context/          Theme providers
      data/             Theme data
      hooks/            Reusable hooks
      lib/              Axios, ImageKit helpers, utilities
      pages/            Authentication & chat pages
      store/            Zustand stores
    package.json

  Dockerfile
  README.md
```

---

# 🔄 Application Flow

1. 👤 User signs in through Clerk.
2. 🔑 Frontend calls `GET /api/auth/check`.
3. ✅ Backend verifies the Clerk session and loads the MongoDB user.
4. 🔌 Frontend establishes a Socket.IO connection.
5. 📋 Chat page loads users and conversations.
6. 💬 Opening a chat calls `GET /api/messages/:id`.
7. 📖 Backend returns messages and marks unread ones as read.
8. ✉️ Sending a message calls `POST /api/messages/send/:id`.
9. 📎 Media uploads are validated by Multer and stored in ImageKit.
10. 💾 Message is saved in MongoDB and broadcast via Socket.IO.
11. ⚡ Receiver instantly receives the message, unread count updates, and the conversation moves to the top.
12. ✅ Opening the chat clears unread messages and synchronizes read receipts.

---

# 📡 API Overview

## 🔐 Authentication

| Method | Endpoint          | Description                    |
| ------ | ----------------- | ------------------------------ |
| GET    | `/api/auth/check` | Returns the authenticated user |

### 💬 Messages

| Method | Endpoint                      | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/messages/users`         | List users                           |
| GET    | `/api/messages/conversations` | Get conversations with unread counts |
| GET    | `/api/messages/:id`           | Get conversation messages            |
| PATCH  | `/api/messages/:id/read`      | Mark conversation as read            |
| POST   | `/api/messages/send/:id`      | Send text or media                   |

### 🔗 Webhooks

| Method | Endpoint              | Description                   |
| ------ | --------------------- | ----------------------------- |
| POST   | `/api/webhooks/clerk` | Sync Clerk users with MongoDB |

---

# ⚡ Realtime Events

| Event              | Description                           |
| ------------------ | ------------------------------------- |
| `getOnlineUsers`   | Broadcast online users                |
| `newMessage`       | Send new messages instantly           |
| `messagesRead`     | Notify sender that messages were read |
| `conversationRead` | Clear unread count for the reader     |

---

# 💻 Local Development

## 📋 Prerequisites

* Node.js **22+**
* MongoDB
* Clerk Account
* ImageKit Account

---

## ⚙️ Backend Setup

```bash
cd backend
npm install
npm run dev
```

Create `backend/.env`

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SIGNING_SECRET=your_clerk_webhook_secret
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

---

## 🎨 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env`

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Frontend runs at:

```
http://localhost:5173
```

Backend runs at:

```
http://localhost:3000
```

---

# 📦 Production Build

### Build Frontend

```bash
cd frontend
npm run build
```

### Build Backend

```bash
cd backend
npm run build
```

### Run Production

```bash
cd backend
npm start
```

---

# 🐳 Docker

### Build Image

```bash
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key \
  -t lark .
```

### Run Container

```bash
docker run -p 3001:3001 --env-file backend/.env lark
```

---

# 📝 Environment Notes

* 🔒 Never commit `.env` files or secrets.
* 🌐 `FRONTEND_URL` must match your frontend origin for CORS and Socket.IO.
* ☁️ `IMAGEKIT_PRIVATE_KEY` is required for media uploads.
* 🔗 Configure Clerk webhooks to point to:

```
/api/webhooks/clerk
```

---

# 📜 Available Scripts

## Frontend

| Command           | Description                   |
| ----------------- | ----------------------------- |
| `npm run dev`     | Start Vite development server |
| `npm run build`   | Build production assets       |
| `npm run lint`    | Run ESLint                    |
| `npm run preview` | Preview production build      |

## Backend

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run dev`        | Start backend with Nodemon |
| `npm run build`      | Build backend              |
| `npm start`          | Start production server    |

---

# 📄 License

This project is licensed under the **ISC License**.

---

## 👨‍💻 Author

**Vansh Jethwani**

If you found this project helpful, consider giving it a ⭐ on GitHub!
