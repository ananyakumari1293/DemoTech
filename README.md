<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:0B1220,60:1E293B,100:F4D03F&text=DemoTech&fontColor=ffffff&fontSize=55&fontAlignY=38&desc=AI-Powered%20Virtual%20Office&descAlignY=60"/>

# 🌙 DemoTech Virtual Office

### AI-Powered Biometric Workplace Experience

Create a digital identity, verify with facial recognition, enter a virtual workspace, and manage attendance through an immersive enterprise-grade platform.

![Python](https://img.shields.io/badge/Python-3.10+-F4D03F?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-F4D03F?style=for-the-badge)
![InsightFace](https://img.shields.io/badge/InsightFace-Facial%20Recognition-F4D03F?style=for-the-badge)

</div>

---

# ⚠️ Deployment Notice

The full biometric pipeline (InsightFace + ONNX Runtime) is implemented and works correctly in local environments.

The public deployment currently runs on free-tier infrastructure, which has strict memory limits. As a result:

* ✅ Frontend is fully deployed and accessible
* ✅ FastAPI backend is deployed
* ✅ SQLite integration is functional
* ✅ Employee management and attendance workflows are implemented
* ✅ Face recognition works locally
* ⚠️ Public biometric registration/verification may be limited by free-tier memory constraints

For a complete demonstration of facial recognition, please run the backend locally or view the demo screenshots below.

---

# ✨ Overview

DemoTech is a futuristic virtual workplace that combines facial recognition, workforce management, and immersive UI design into a single platform.

Instead of using a traditional attendance system, users:

* Create a digital identity
* Register biometric face templates
* Generate a virtual employee keycard
* Verify identity through facial recognition
* Enter a virtual workspace
* Track attendance and activity

The project demonstrates how AI-powered authentication can be integrated into a modern enterprise experience.

---

# 🚀 Key Features

## 🧬 Biometric Identity System

* Face Registration
* Face Verification
* Multi-Pose Enrollment
* InsightFace Recognition Engine
* Confidence-Based Matching
* Secure Identity Validation

---

## 🏢 Virtual Office Experience

* Digital Employee Keycards
* Workspace Access Control
* Interactive Office Lobby
* Immersive Onboarding Flow
* Personalized User Profiles
* Futuristic SaaS Interface

---

## 📊 Workforce Management

* Employee Management
* Attendance Tracking
* Check-In / Check-Out
* Daily Activity Logs
* Dashboard Analytics
* Statistics Monitoring

---

## 🎨 Modern UI

* Dark Theme Design
* Glassmorphism Components
* Neon Accent Effects
* Responsive Layout
* Mobile-Friendly Experience
* Smooth Animations

---

# 📸 Landing Page

> DemoTech landing experience

<br>

<p align="center">
  <!-- Landing Page Screenshot -->
</p>

<br>

---

# 📸 Identity Creation & Face Registration

> Employee onboarding and biometric enrollment

<br>

<p align="center">
  <!-- Registration Screenshot -->
</p>

<br>

---

# 📸 Biometric Login

> Face verification and secure workspace access

<br>

<p align="center">
  <!-- Login Screenshot -->
</p>

<br>

---

# 📸 Virtual Office Lobby

> Interactive workplace dashboard

<br>

<p align="center">
  <!-- Lobby Screenshot -->
</p>

<br>

---

# ⚡ System Architecture

```text
Frontend (Vercel)
        │
        ▼
FastAPI Backend (Render)
        │
        ▼
InsightFace Recognition Engine
        │
        ▼
SQLite Database
```

---

# 🛠️ Tech Stack

| Category        | Technology            |
| --------------- | --------------------- |
| Frontend        | HTML, CSS, JavaScript |
| Backend         | FastAPI               |
| AI Engine       | InsightFace           |
| Database        | SQLite                |
| Computer Vision | OpenCV                |
| Runtime         | ONNX Runtime          |
| Deployment      | Vercel + Render       |

---

# 📂 Project Structure

```bash
demotech/
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── attendance.py
│   ├── register.py
│   ├── config.py
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── data/
│   ├── encodings/
│   └── profile_images/
│
├── logs/
│
└── attendance.db
```

---

# 🔐 Authentication Flow

```text
Create Identity
       │
       ▼
Register Face
       │
       ▼
Generate Embedding
       │
       ▼
Store Template
       │
       ▼
Face Verification
       │
       ▼
Attendance Logged
       │
       ▼
Workspace Access Granted
```

---

# 🌐 Deployment

### Frontend

https://demo-tech-five.vercel.app

### Backend

https://demotech.onrender.com

---

# 🎯 Future Enhancements

* Cloud Database Migration
* Multi-Admin Roles
* AI Attendance Insights
* Team Collaboration Modules
* Smart Notifications
* QR Access Control
* Analytics Export
* Real-Time Presence Monitoring

---

# 👩‍💻 Author

### Ananya Prakash

Passionate about AI, Computer Vision, Full-Stack Development, and building immersive software experiences.

---

<div align="center">

### 🌙 Enter the Office. Verify Identity. Unlock the Workspace.

⭐ If you found this project interesting, consider starring the repository.

</div>
