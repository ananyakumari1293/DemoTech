/**
 * DemoTech Virtual Workplace Experience - Controller
 * Connects frontend views to FastAPI v1 backend.
 * Implements Light/Dark modes, onboarding flows, 3D card cursor tilt,
 * biometric enter gate scanner animations, simulated social feeds, and dim countdown checkout overlays.
 */

// ==========================================
// 1. GLOBAL STATE & BACKEND CONFIG
// ==========================================

let employees = [];
let logs = [];
let currentLoggedUser = null; 
let onboardingData = null; // Holds temporary Name, College, Course, Year during registration

// Dynamic API Base URL Selection
const RENDER_BACKEND_URL = 'https://demotech-backend.onrender.com/api/v1';
let API_BASE_URL = '/api/v1';

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  if (window.location.port && window.location.port !== '8000') {
    API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
  } else {
    API_BASE_URL = '/api/v1';
  }
} else if (window.location.protocol === 'file:') {
  API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
} else {
  API_BASE_URL = RENDER_BACKEND_URL;
}

// Extract base URL for assets like profile images
let DATA_BASE_URL = '/data';
if (API_BASE_URL.startsWith('http')) {
  try {
    const url = new URL(API_BASE_URL);
    DATA_BASE_URL = `${url.protocol}//${url.host}/data`;
  } catch (e) {
    console.error("Invalid API_BASE_URL format", e);
  }
}

// Video streams
let activeStream = null;
let activeCameraPage = null; // 'registration' or 'facelogin'
let animationFrameId = null;

// Enrollment details
let registrationSamplesCount = 0;
let registrationEmbeddings = [];

// Confetti Animation loop
let confettiAnimationId = null;

// Dual-mode backend config
let useBackendAPI = false;

async function checkBackendAvailability() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'online') {
        useBackendAPI = true;
        console.log("Connected to DemoTech FastAPI backend.");
        showToast("Connected to live biometric backend.", "success");
        return;
      }
    }
  } catch (err) {
    console.warn("FastAPI backend not reachable. Falling back to client-side localStorage mode.");
    showToast("Backend offline. Running in client-side mockup mode.", "info");
  }
  useBackendAPI = false;
}

// ==========================================
// 2. DATA SYNCHRONIZATION (DUAL MODE)
// ==========================================

async function loadDataFromBackend() {
  if (useBackendAPI) {
    try {
      const res = await fetch(`${API_BASE_URL}/employees`);
      if (res.ok) {
        employees = await res.json();
      } else {
        showToast(`Failed to sync directory (Status ${res.status}).`, 'error');
      }
      
      if (currentLoggedUser) {
        const updatedUser = employees.find(e => e.id === currentLoggedUser.id);
        if (updatedUser) {
          currentLoggedUser = updatedUser;
        }
        
        const logsRes = await fetch(`${API_BASE_URL}/attendance?employee_id=${currentLoggedUser.id}`);
        if (logsRes.ok) {
          logs = await logsRes.json();
        }
      }
    } catch (err) {
      console.error("Failed to sync data with FastAPI backend:", err);
      showToast("Data sync error: FastAPI backend is unreachable.", "error");
    }
  } else {
    // Client-side local storage fallback mode
    employees = JSON.parse(localStorage.getItem('dt_employees_clean')) || [];
    logs = JSON.parse(localStorage.getItem('dt_logs_clean')) || [];
    
    // Seed initial mock data: empty by default
    if (employees.length === 0) {
      employees = [];
      logs = [];
      localStorage.setItem('dt_employees_clean', JSON.stringify([]));
      localStorage.setItem('dt_logs_clean', JSON.stringify([]));
    }
    
    if (currentLoggedUser) {
      const updatedUser = employees.find(e => e.id === currentLoggedUser.id);
      if (updatedUser) {
        currentLoggedUser = updatedUser;
      }
    }
  }
}


// ==========================================
// 3. CLIENT-SIDE ROUTER
// ==========================================

const router = {
  currentPage: 'landing',
  
  navigate(pageId) {
    if (pageId === 'emp-dashboard' && !currentLoggedUser) {
      showToast('Biometric gate verification required.', 'error');
      this.navigate('facelogin');
      return;
    }
    stopAllCameras();
    
    // Hide all views
    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.remove('active');
    });
    
    // Show target view
    const targetView = document.getElementById(`view-${pageId}`);
    if (targetView) {
      targetView.classList.add('active');
    }
    
    // Update sidebar link highlights
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.classList.remove('active');
    });
    
    // Support navigation mappings
    let targetLinkId = `nav-${pageId}`;
    if (pageId === 'admin-dashboard') {
      targetLinkId = 'nav-nav-admin-dashboard';
    }
    const activeLink = document.getElementById(targetLinkId);
    if (activeLink) {
      activeLink.classList.add('active');
    }
    
    // Toggle layout margins
    const sidebar = document.getElementById('app-sidebar');
    const mainContent = document.getElementById('app-main-content');
    
    if (pageId === 'landing') {
      sidebar.style.display = 'none';
      mainContent.classList.remove('offset-active');
    } else {
      sidebar.style.display = 'flex';
      mainContent.classList.add('offset-active');
    }
    
    this.currentPage = pageId;
    window.scrollTo(0, 0);
    this.onViewChanged(pageId);
  },
  
  async onViewChanged(pageId) {
    await loadDataFromBackend();
    
    updateUserCardVisibility();
    checkEmptyStates();
    
    if (pageId === 'emp-dashboard') {
      renderEmployeeDashboard();
      initKeycardTiltEffect();
    } else if (pageId === 'admin-dashboard') {
      renderAdminDashboard();
    } else if (pageId === 'facelogin') {
      initFaceLoginView();
    } else if (pageId === 'register') {
      initRegistrationView();
    }
  }
};

// Toggle bottom user card with image error fallback
function updateUserCardVisibility() {
  const userCard = document.getElementById('sidebar-user-card');
  if (currentLoggedUser) {
    userCard.style.display = 'flex';
    const initials = currentLoggedUser.name.split(' ').map(n => n[0]).join('');
    const avatar = document.getElementById('sidebar-user-avatar');
    
    avatar.style.padding = '0';
    avatar.style.overflow = 'hidden';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    
    avatar.innerHTML = `
      <img src="${DATA_BASE_URL}/profile_images/${currentLoggedUser.id}.jpg?t=${new Date().getTime()}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; document.getElementById('sidebar-user-avatar-initials').style.display='flex';" />
      <span id="sidebar-user-avatar-initials" style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${initials}</span>
    `;
    
    const img = avatar.querySelector('img');
    img.onload = () => {
      img.style.display = 'block';
      document.getElementById('sidebar-user-avatar-initials').style.display = 'none';
    };
    img.onerror = () => {
      img.style.display = 'none';
      document.getElementById('sidebar-user-avatar-initials').style.display = 'flex';
    };
    
    document.getElementById('sidebar-user-name').innerHTML = `${currentLoggedUser.name} <span id="sidebar-user-role">${currentLoggedUser.role}</span>`;
  } else {
    userCard.style.display = 'none';
  }
}

// ==========================================
// 4. EMPTY STATE CHECKS
// ==========================================

function checkEmptyStates() {
  const logsCount = logs.length;
  const employeesCount = employees.length;
  
  // Self Service
  const empHistoryEmpty = document.getElementById('emp-history-empty');
  const empTableContainer = document.getElementById('emp-table-container');
  if (empHistoryEmpty && empTableContainer) {
    if (logsCount > 0 && currentLoggedUser) {
      empHistoryEmpty.style.display = 'none';
      empTableContainer.style.display = 'block';
    } else {
      empHistoryEmpty.style.display = 'flex';
      empTableContainer.style.display = 'none';
    }
  }
  
  // Admin Directory
  const adminEmployeesEmpty = document.getElementById('admin-employees-empty');
  const adminTableContainer = document.getElementById('admin-table-container');
  const searchInput = document.getElementById('admin-table-search');
  if (adminEmployeesEmpty && adminTableContainer) {
    if (employeesCount > 0) {
      adminEmployeesEmpty.style.display = 'none';
      adminTableContainer.style.display = 'block';
      searchInput.style.display = 'inline-block';
    } else {
      adminEmployeesEmpty.style.display = 'flex';
      adminTableContainer.style.display = 'none';
      searchInput.style.display = 'none';
    }
  }
}

// ==========================================
// 5. DATABASE CONSOLE OVERRIDES
// ==========================================

async function mockPopulateDatabase() {
  if (useBackendAPI) {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/populate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message, 'success');
        currentLoggedUser = null;
        await loadDataFromBackend();
        router.onViewChanged(router.currentPage);
      } else {
        showToast(`Failed to seed mock database (Status ${res.status}).`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error populating database. Backend may be offline.', 'error');
    }
  } else {
    // Offline mode: Clear localStorage database
    employees = [];
    logs = [];
    localStorage.setItem('dt_employees_clean', JSON.stringify([]));
    localStorage.setItem('dt_logs_clean', JSON.stringify([]));
    currentLoggedUser = null;
    showToast("Local storage data cleared.", "success");
    router.onViewChanged(router.currentPage);
  }
}

async function resetDefaultMockData() {
  if (confirm('Revert all registered records back to the clean empty state?')) {
    if (useBackendAPI) {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/reset`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          showToast(data.message, 'info');
          employees = [];
          logs = [];
          currentLoggedUser = null;
          router.onViewChanged(router.currentPage);
        } else {
          showToast(`Failed to clear database (Status ${res.status}).`, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Network error resetting database. Backend may be offline.', 'error');
      }
    } else {
      employees = [];
      logs = [];
      localStorage.setItem('dt_employees_clean', JSON.stringify([]));
      localStorage.setItem('dt_logs_clean', JSON.stringify([]));
      currentLoggedUser = null;
      showToast("Local storage registry cleared successfully.", "info");
      router.onViewChanged(router.currentPage);
    }
  }
}

// ==========================================
// 6. VIEW INITIALIZATIONS
// ==========================================

function initRegistrationView() {
  registrationSamplesCount = 0;
  registrationEmbeddings = [];
  onboardingData = null;
  
  document.getElementById('btn-register-employee').disabled = true;
  document.getElementById('capture-status-text').textContent = '0 of 5 Captured';
  
  // Re-enable form fields
  document.getElementById('onboard-name').disabled = false;
  document.getElementById('onboard-college').disabled = false;
  document.getElementById('onboard-course').disabled = false;
  document.getElementById('onboard-year').disabled = false;
  
  // Clear inputs
  document.getElementById('onboard-name').value = '';
  document.getElementById('onboard-college').value = '';
  document.getElementById('onboard-course').value = '';
  document.getElementById('onboard-year').value = '';
  
  const nodes = document.querySelectorAll('#capture-sample-dots .pose-node-cinema');
  nodes.forEach((node, idx) => {
    node.className = 'pose-node-cinema';
    if (idx === 0) node.classList.add('active');
    node.textContent = idx + 1;
  });
  
  document.getElementById('registration-logs').innerHTML = `
    <div class="terminal-entry"><span class="terminal-time">[${getCurrentTimestamp()}]</span> <span class="terminal-msg info">Ready. Face poses scan required for biometric profile.</span></div>
  `;
  
  document.getElementById('btn-capture-sample').disabled = true;
}

function setSimilarityProgress(percent) {
  const circle = document.getElementById('progress-ring-circle');
  if (circle) {
    const circumference = 289; // 2 * pi * 46
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }
}

function initFaceLoginView() {
  document.getElementById('login-auth-status').textContent = 'SYSTEM IDLE';
  document.getElementById('login-auth-status').style.color = 'var(--text-dim)';
  document.getElementById('btn-trigger-facelogin').disabled = true;
  
  const simVal = document.getElementById('login-similarity-val');
  const matchedAvatar = document.getElementById('login-matched-avatar');
  const matchedName = document.getElementById('login-matched-name');
  const matchedDept = document.getElementById('login-matched-dept');

  if (simVal) simVal.textContent = '--%';
  setSimilarityProgress(0);
  if (matchedAvatar) matchedAvatar.textContent = '--';
  if (matchedName) matchedName.textContent = 'No Face Detected';
  if (matchedDept) matchedDept.textContent = 'Ready for verification';

  document.getElementById('login-logs').innerHTML = `
    <div class="terminal-entry"><span class="terminal-time">[${getCurrentTimestamp()}]</span> <span class="terminal-msg info">Gate scanner online. Please enable camera stream.</span></div>
  `;
  
  // Populate profiles select dropdown
  const select = document.getElementById('login-profile-select');
  select.innerHTML = '';
  
  if (employees.length === 0) {
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = 'No Registered Employees Found';
    select.appendChild(optNone);
  } else {
    employees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.name;
      opt.textContent = `${emp.name} (ID: ${emp.id})`;
      select.appendChild(opt);
    });
    
    const optUnknown = document.createElement('option');
    optUnknown.value = 'Unknown';
    optUnknown.textContent = 'Unknown Face Template (Trigger Rejection)';
    select.appendChild(optUnknown);
  }
}

// ==========================================
// 7. WEBCAM & SCANNER SIMULATION
// ==========================================

async function toggleRegistrationCamera() {
  const video = document.getElementById('registration-video');
  const fallback = document.getElementById('registration-fallback');
  const btnText = document.getElementById('reg-cam-btn-text');
  const captureBtn = document.getElementById('btn-capture-sample');
  const alignmentGuide = document.getElementById('reg-alignment-guide');
  
  if (activeStream) {
    stopAllCameras();
    video.style.display = 'none';
    fallback.style.display = 'flex';
    btnText.textContent = 'Enable Camera';
    captureBtn.disabled = true;
    alignmentGuide.classList.remove('scanning');
    addLog('registration-logs', 'Webcam stream deactivated.', 'info');
  } else {
    try {
      addLog('registration-logs', 'Requesting camera stream access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      activeStream = stream;
      activeCameraPage = 'registration';
      video.srcObject = stream;
      video.style.display = 'block';
      fallback.style.display = 'none';
      btnText.textContent = 'Disable Camera';
      captureBtn.disabled = false;
      alignmentGuide.classList.add('scanning');
      
      addLog('registration-logs', 'Camera activated. Align face in the guide target.', 'success');
      startFaceTrackingSimulation('registration');
    } catch (err) {
      console.warn("Webcam access failed, initiating digital simulation fallback.", err);
      addLog('registration-logs', 'Webcam blocked. Launching alignment mockup canvas...', 'info');
      initDigitalSimulation('registration');
    }
  }
}

async function toggleLoginCamera() {
  const video = document.getElementById('login-video');
  const fallback = document.getElementById('login-fallback');
  const btnToggleActive = document.getElementById('btn-login-toggle-camera-active');
  const triggerBtn = document.getElementById('btn-trigger-facelogin');
  const alignmentGuide = document.getElementById('login-alignment-guide');
  
  if (activeStream) {
    stopAllCameras();
    video.style.display = 'none';
    fallback.style.display = 'flex';
    btnToggleActive.textContent = 'Enable Camera';
    triggerBtn.disabled = true;
    alignmentGuide.classList.remove('scanning');
    addLog('login-logs', 'Verification camera stream deactivated.', 'info');
  } else {
    try {
      addLog('login-logs', 'Requesting verification camera stream access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      activeStream = stream;
      activeCameraPage = 'facelogin';
      video.srcObject = stream;
      video.style.display = 'block';
      fallback.style.display = 'none';
      btnToggleActive.textContent = 'Disable Camera';
      
      if (employees.length > 0) {
        triggerBtn.disabled = false;
      }
      
      alignmentGuide.classList.add('scanning');
      
      addLog('login-logs', 'Biometric channel connected. Alignment guide active.', 'success');
      startFaceTrackingSimulation('facelogin');
    } catch (err) {
      console.warn("Webcam access failed, initiating digital simulation fallback.", err);
      addLog('login-logs', 'Camera blocked. Launching friendly simulation tracker...', 'info');
      initDigitalSimulation('facelogin');
    }
  }
}

function stopAllCameras() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
  activeCameraPage = null;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Hide face bounding boxes
  document.getElementById('reg-face-box').style.display = 'none';
  document.getElementById('login-face-box').style.display = 'none';
  
  // Clean up simulation canvas
  document.querySelectorAll('.cyber-simulation-canvas').forEach(canvas => canvas.remove());
}

function startFaceTrackingSimulation(pageType) {
  const box = document.getElementById(pageType === 'registration' ? 'reg-face-box' : 'login-face-box');
  if (!box) return;
  
  box.style.display = 'block';
  
  let frame = 0;
  function update() {
    if (activeCameraPage !== pageType) return;
    
    frame++;
    const w = 150 + Math.sin(frame * 0.05) * 5;
    const h = 180 + Math.cos(frame * 0.07) * 5;
    const left = 35 + Math.sin(frame * 0.02) * 3;
    const top = 26 + Math.cos(frame * 0.03) * 4;
    
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    box.style.left = `${left}%`;
    box.style.top = `${top}%`;
    
    animationFrameId = requestAnimationFrame(update);
  }
  update();
}

function initDigitalSimulation(pageType) {
  const container = document.querySelector(`#view-${pageType === 'registration' ? 'register' : pageType} .face-scanner-viewport`);
  const fallback = document.getElementById(pageType === 'registration' ? 'registration-fallback' : 'login-fallback');
  const btnToggleActive = document.getElementById(pageType === 'registration' ? 'reg-cam-btn-text' : 'btn-login-toggle-camera-active');
  const captureBtn = document.getElementById(pageType === 'registration' ? 'btn-capture-sample' : 'btn-trigger-facelogin');
  const alignmentGuide = document.getElementById(pageType === 'registration' ? 'reg-alignment-guide' : 'login-alignment-guide');
  
  fallback.style.display = 'none';
  if (pageType === 'registration') {
    btnToggleActive.textContent = 'Disable Simulation';
  } else {
    btnToggleActive.textContent = 'Disable Camera';
  }
  
  if (pageType === 'registration' || employees.length > 0) {
    captureBtn.disabled = false;
  }
  
  alignmentGuide.classList.add('scanning');
  activeCameraPage = pageType;
  
  const canvas = document.createElement('canvas');
  canvas.className = 'cyber-simulation-canvas';
  canvas.width = 640;
  canvas.height = 480;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '2';
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  startFaceTrackingSimulation(pageType);
  
  let frame = 0;
  function draw() {
    if (activeCameraPage !== pageType) return;
    frame++;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height + 150, 200, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.ellipse(canvas.width/2, canvas.height/2 - 20, 90, 110, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(99, 102, 241, 0.7)';
    ctx.beginPath();
    ctx.arc(canvas.width/2 - 30, canvas.height/2 - 35, 6, 0, Math.PI * 2);
    ctx.arc(canvas.width/2 + 30, canvas.height/2 - 35, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2 + 20, 20, 0, Math.PI);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2 - 20, 120 + Math.sin(frame * 0.05) * 4, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(113, 113, 122, 0.8)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('CAMERA MOCKUP STREAM', 20, 30);
    
    requestAnimationFrame(draw);
  }
  draw();
}

async function captureRegistrationSample() {
  if (!onboardingData) {
    const name = document.getElementById('onboard-name').value.trim();
    const college = document.getElementById('onboard-college').value.trim();
    const course = document.getElementById('onboard-course').value.trim();
    const year = document.getElementById('onboard-year').value;
    
    if (!name || !college || !course || !year) {
      showToast("Please fill out all identity request fields first.", "error");
      return;
    }
    
    // Disable inputs to prevent changes during scanning
    document.getElementById('onboard-name').disabled = true;
    document.getElementById('onboard-college').disabled = true;
    document.getElementById('onboard-course').disabled = true;
    document.getElementById('onboard-year').disabled = true;
    
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const employeeId = `DT-${randomId}`;
    
    onboardingData = {
      name,
      college,
      course,
      year,
      employeeId
    };
    
    document.getElementById('registration-logs').innerHTML = '';
    addLog('registration-logs', `Keycard profile initialized: ${name} (${employeeId})`, 'success');
    addLog('registration-logs', `Mapped institution: ${college}`, 'info');
    addLog('registration-logs', `Course track: ${course} | Year: ${year}`, 'info');
    addLog('registration-logs', `Please align face in camera guide to capture 5 templates...`, 'info');
  }
  
  if (registrationSamplesCount >= 5) return;
  
  const captureBtn = document.getElementById('btn-capture-sample');
  captureBtn.disabled = true;
  
  // Grab base64 image data
  let base64Frame = null;
  if (activeStream) {
    const video = document.getElementById('registration-video');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    base64Frame = canvas.toDataURL('image/jpeg');
  } else {
    const simCanvas = document.querySelector('.cyber-simulation-canvas');
    if (simCanvas) {
      base64Frame = simCanvas.toDataURL('image/jpeg');
    }
  }
  
  if (!base64Frame) {
    showToast('Could not access camera frame.', 'error');
    captureBtn.disabled = false;
    return;
  }
  
  addLog('registration-logs', `Extracting keypoints for sample ${registrationSamplesCount + 1}...`, 'info');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_BASE_URL}/register/sample`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: base64Frame,
        sample_index: registrationSamplesCount + 1,
        employee_id: onboardingData.employeeId
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      let errData = {};
      try {
        errData = await res.json();
      } catch (e) {
        errData = { detail: { message: `HTTP Error ${res.status}` } };
      }
      const detail = errData.detail || {};
      const status = detail.status || 'error';
      const message = detail.message || 'Validation error.';
      
      if (status === 'no_face') {
        showToast('No face detected. Adjust frame and try again.', 'error');
        addLog('registration-logs', 'VALIDATION FAILED: No face in frame.', 'error');
      } else if (status === 'multiple_faces') {
        showToast('Multiple faces detected. Ensure only one face is visible.', 'error');
        addLog('registration-logs', 'VALIDATION FAILED: Multiple faces detected.', 'error');
      } else {
        showToast(message, 'error');
        addLog('registration-logs', `API Error: ${message}`, 'error');
      }
      captureBtn.disabled = false;
      return;
    }
    
    const result = await res.json();
    registrationEmbeddings.push(result.embedding);
    
    registrationSamplesCount++;
    
    // Capture visual flash animation
    const container = document.querySelector('#view-register .face-scanner-viewport');
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'white';
    flash.style.zIndex = '100';
    flash.style.opacity = '0.6';
    flash.style.transition = 'opacity 0.2s ease';
    container.appendChild(flash);
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 200);
    }, 40);
    
    document.getElementById('capture-status-text').textContent = `${registrationSamplesCount} of 5 Poses Enrolled`;
    
    const nodes = document.querySelectorAll('#capture-sample-dots .pose-node-cinema');
    if (nodes[registrationSamplesCount - 1]) {
      nodes[registrationSamplesCount - 1].classList.remove('active');
      nodes[registrationSamplesCount - 1].classList.add('complete');
      nodes[registrationSamplesCount - 1].innerHTML = '<i class="lucide-check" style="width:12px; height:12px; vertical-align: middle;"></i>';
    }
    
    if (nodes[registrationSamplesCount] && registrationSamplesCount < 5) {
      nodes[registrationSamplesCount].classList.add('active');
    }
    
    const poses = ['Front Pose', 'Left Pose', 'Right Pose', 'Up Pose', 'Natural Pose'];
    addLog('registration-logs', `Pose Captured: ${poses[registrationSamplesCount - 1]} (Sample ${registrationSamplesCount}/5).`, 'success');
    
    if (registrationSamplesCount >= 5) {
      captureBtn.disabled = true;
      document.getElementById('btn-register-employee').disabled = false;
      document.getElementById('capture-status-text').textContent = 'Webcam samples collected!';
      addLog('registration-logs', 'Face profile enrollment done. Click Complete Registration to generate digital keycard.', 'success');
      showToast('All 5 face samples captured successfully!', 'success');
    } else {
      captureBtn.disabled = false;
      showToast(`Pose ${registrationSamplesCount}/5 captured. Next pose: ${poses[registrationSamplesCount]}`, 'info');
    }
    lucide.createIcons();
    
  } catch (err) {
    console.error(err);
    if (err.name === 'AbortError') {
      showToast('Capture request timed out. Render backend may be sleeping.', 'error');
      addLog('registration-logs', 'Network timeout. Retrying request is recommended.', 'error');
    } else {
      showToast('Failed to connect to registration API.', 'error');
      addLog('registration-logs', 'Network error during validation.', 'error');
    }
    captureBtn.disabled = false;
  }
}

async function triggerEmployeeRegistration() {
  if (!onboardingData) return;
  
  const name = onboardingData.name;
  const id = onboardingData.employeeId;
  const college = onboardingData.college;
  const course = onboardingData.course;
  const year = onboardingData.year;
  
  addLog('registration-logs', `Compiling secure keycard token credentials...`, 'info');
  document.getElementById('btn-register-employee').disabled = true;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        employee_id: id,
        full_name: name,
        email: `${year.toLowerCase().replace(/\s+/g, '')}@demotech.com`,
        department: course,
        role: college,
        embeddings: registrationEmbeddings
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      let err;
      try {
        err = await res.json();
      } catch (e) {
        err = { detail: `HTTP Error ${res.status}` };
      }
      showToast(err.detail || 'Registration failed.', 'error');
      addLog('registration-logs', `SAVE FAILED: ${err.detail || 'API error'}`, 'error');
      document.getElementById('btn-register-employee').disabled = false;
      return;
    }
    
    addLog('registration-logs', `Biometrics compiled: data/encodings/${id}.pkl`, 'success');
    addLog('registration-logs', `SUCCESS: Keycard profile ${id} activated.`, 'success');
    
    openModal(
      '🎉 Digital Keycard Issued',
      `Welcome, ${name}! Your employee keycard (${id}) has been created with active workspace clearance.`,
      'success'
    );
    
    await loadDataFromBackend();
    currentLoggedUser = null; // Do not auto-login
    onboardingData = null;
    initRegistrationView();
    router.navigate('facelogin');
    
  } catch (err) {
    console.error(err);
    if (err.name === 'AbortError') {
      showToast('Registration timed out. Render backend may be warming up.', 'error');
      addLog('registration-logs', 'Network timeout while saving registration.', 'error');
    } else {
      showToast('Failed to save employee registration.', 'error');
      addLog('registration-logs', 'Network error while saving registration.', 'error');
    }
    document.getElementById('btn-register-employee').disabled = false;
  }
}

// ==========================================
// 9. FACE VERIFICATION PROCESS
// ==========================================

async function startFaceLoginVerification() {
  const authStatus = document.getElementById('login-auth-status');
  const triggerBtn = document.getElementById('btn-trigger-facelogin');
  
  const matchedAvatar = document.getElementById('login-matched-avatar');
  const matchedName = document.getElementById('login-matched-name');
  const matchedDept = document.getElementById('login-matched-dept');
  const simVal = document.getElementById('login-similarity-val');
  
  // Phase 1: Camera Ready / Aligning
  authStatus.textContent = 'CAMERA READY';
  authStatus.style.color = 'var(--secondary)';
  triggerBtn.disabled = true;
  
  if (matchedName) matchedName.textContent = 'Aligning Face...';
  if (matchedDept) matchedDept.textContent = 'Hold position in camera guide';
  if (matchedAvatar) matchedAvatar.textContent = '--';
  if (simVal) simVal.textContent = '0%';
  setSimilarityProgress(0);
  
  const faceBox = document.getElementById('login-face-box');
  const faceLabel = document.getElementById('login-face-box-label');
  const guide = document.getElementById('login-alignment-guide');
  
  faceLabel.textContent = 'CHECKING FACE IN FRAME...';
  faceLabel.style.backgroundColor = 'var(--warning)';
  
  addLog('login-logs', `Accessing sensor channel...`, 'info');
  
  // Grab base64 image data
  let base64Frame = null;
  if (activeStream) {
    const video = document.getElementById('login-video');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    base64Frame = canvas.toDataURL('image/jpeg');
  } else {
    const simCanvas = document.querySelector('.cyber-simulation-canvas');
    if (simCanvas) {
      base64Frame = simCanvas.toDataURL('image/jpeg');
    }
  }
  
  if (!base64Frame) {
    showToast('Failed to capture frame.', 'error');
    authStatus.textContent = 'SYSTEM IDLE';
    triggerBtn.disabled = false;
    return;
  }
  
  // Start parallel API request with AbortController timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  let apiPromise = fetch(`${API_BASE_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Frame }),
    signal: controller.signal
  }).then(async res => {
    clearTimeout(timeoutId);
    if (!res.ok) {
      let err;
      try {
        err = await res.json();
      } catch (e) {
        err = { detail: { message: `HTTP Error ${res.status}` } };
      }
      throw err;
    }
    return res.json();
  }).catch(err => {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw { detail: { message: 'Biometric verification timed out. Render backend may be waking up. Please retry in a moment.' } };
    }
    throw err;
  });
  
  try {
    // Phase 2: Face Detected (sequential visual timing)
    await new Promise(r => setTimeout(r, 700));
    authStatus.textContent = 'FACE DETECTED';
    authStatus.style.color = 'var(--warning)';
    faceLabel.textContent = 'EXTRACTING TEMPLATE...';
    faceLabel.style.backgroundColor = 'var(--secondary)';
    guide.classList.add('active-detection');
    
    if (matchedName) matchedName.textContent = 'Face Detected ✓';
    if (matchedDept) matchedDept.textContent = 'Analyzing face keypoints';
    if (simVal) simVal.textContent = '35%';
    setSimilarityProgress(35);
    addLog('login-logs', `Face keypoint template extracted successfully.`, 'success');
    
    // Phase 3: Matching Identity
    await new Promise(r => setTimeout(r, 700));
    authStatus.textContent = 'MATCHING IDENTITY';
    authStatus.style.color = 'var(--primary)';
    faceLabel.textContent = 'MATCHING PROFILE...';
    faceLabel.style.backgroundColor = 'var(--primary)';
    
    if (matchedName) matchedName.textContent = 'Matching Identity...';
    if (matchedDept) matchedDept.textContent = 'Comparing template file index';
    if (simVal) simVal.textContent = '70%';
    setSimilarityProgress(70);
    addLog('login-logs', `Searching profile match for template index...`, 'info');
    
    // Await API result
    const result = await apiPromise;
    
    // Phase 4: Verification Result
    await new Promise(r => setTimeout(r, 600));
    
    if (result.status === 'verified' || result.status === 'already_marked') {
      const matchScore = result.similarity;
      const scorePct = Math.round(matchScore * 100);
      const confLabel = result.confidence;
      
      authStatus.textContent = result.status === 'already_marked' ? 'ALREADY MARKED TODAY' : 'WORKSPACE GRANTED';
      authStatus.style.color = 'var(--success)';
      faceLabel.textContent = `${result.full_name} (${matchScore.toFixed(2)})`;
      faceLabel.style.backgroundColor = 'var(--success)';
      
      if (matchedName) matchedName.textContent = result.full_name;
      if (matchedDept) matchedDept.textContent = `${result.department} (${confLabel} confidence)`;
      
      const initials = result.full_name.split(' ').map(n => n[0]).join('');
      if (matchedAvatar) {
        matchedAvatar.style.padding = '0';
        matchedAvatar.style.overflow = 'hidden';
        matchedAvatar.style.display = 'flex';
        matchedAvatar.style.alignItems = 'center';
        matchedAvatar.style.justifyContent = 'center';
        matchedAvatar.innerHTML = `
          <img src="${DATA_BASE_URL}/profile_images/${result.employee_id}.jpg?t=${new Date().getTime()}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; document.getElementById('login-matched-avatar-initials').style.display='flex';" />
          <span id="login-matched-avatar-initials" style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${initials}</span>
        `;
        const matchImg = matchedAvatar.querySelector('img');
        matchImg.onload = () => {
          matchImg.style.display = 'block';
          document.getElementById('login-matched-avatar-initials').style.display = 'none';
        };
        matchImg.onerror = () => {
          matchImg.style.display = 'none';
          document.getElementById('login-matched-avatar-initials').style.display = 'flex';
        };
      }
      
      if (simVal) simVal.textContent = scorePct + '%';
      setSimilarityProgress(scorePct);
      
      addLog('login-logs', `Identity Match verified: ${result.full_name} (Confidence: ${confLabel}, Score: ${scorePct}%)`, 'success');
      
      const checkInTime = result.check_in_time;
      addLog('login-logs', `Attendance Check-In: logged at ${checkInTime}.`, 'success');
      
      setTimeout(async () => {
        await loadDataFromBackend();
        currentLoggedUser = employees.find(e => e.id === result.employee_id);
        
        if (result.status === 'already_marked') {
          openModal(
            '✨ Attendance Already Logged',
            `Hello ${result.full_name}. Your attendance check-in for today was already recorded at ${checkInTime}.`,
            'success'
          );
        } else {
          openModal(
            '✨ Attendance Verified Successfully',
            `Welcome back, ${result.full_name}. Today's presence check-in has been successfully validated at ${checkInTime}.`,
            'success'
          );
        }
        
        router.navigate('emp-dashboard');
        triggerBtn.disabled = false;
      }, 900);
      
    } else {
      // Unknown
      authStatus.textContent = 'VERIFICATION FAILED';
      authStatus.style.color = 'var(--danger)';
      faceLabel.textContent = 'UNKNOWN FACE';
      faceLabel.style.backgroundColor = 'var(--danger)';
      guide.classList.remove('active-detection');
      
      if (matchedName) matchedName.textContent = 'Unknown Face';
      if (matchedDept) matchedDept.textContent = 'Biometric match rejected';
      if (matchedAvatar) matchedAvatar.textContent = '?';
      if (simVal) simVal.textContent = '0%';
      setSimilarityProgress(0);
      
      const score = result.similarity || 0.0;
      addLog('login-logs', `Identity match score: ${score.toFixed(2)} (Match threshold: 0.65). Match failed.`, 'error');
      showToast('Face verification failed.', 'error');
      triggerBtn.disabled = false;
      
      openModal(
        'Verification Failed',
        'Biometric face verification failed. The profile is not registered in DemoTech directory databases.',
        'error'
      );
    }
    
  } catch (err) {
    console.error("Verification error:", err);
    let detail = err.detail || {};
    let status = detail.status || 'error';
    let message = detail.message || 'API error during verification.';
    
    authStatus.textContent = 'VERIFICATION FAILED';
    authStatus.style.color = 'var(--danger)';
    faceLabel.textContent = 'SCAN ERROR';
    faceLabel.style.backgroundColor = 'var(--danger)';
    guide.classList.remove('active-detection');
    
    if (matchedName) matchedName.textContent = 'Scan Error';
    if (matchedDept) matchedDept.textContent = message;
    if (matchedAvatar) matchedAvatar.textContent = '!';
    if (simVal) simVal.textContent = '0%';
    setSimilarityProgress(0);
    
    if (status === 'no_face') {
      showToast('No face detected in frame.', 'error');
      addLog('login-logs', 'VALIDATION FAILED: No face in frame.', 'error');
    } else if (status === 'multiple_faces') {
      showToast('Multiple faces detected.', 'error');
      addLog('login-logs', 'VALIDATION FAILED: Multiple faces detected.', 'error');
    } else {
      showToast(message, 'error');
      addLog('login-logs', `Error: ${message}`, 'error');
    }
    
    triggerBtn.disabled = false;
    openModal(
      'Verification Error',
      message,
      'error'
    );
  }
}

// ==========================================
// 10. EMPLOYEE SELF-SERVICE PORTAL
// ==========================================

function renderEmployeeDashboard() {
  if (!currentLoggedUser) return;
  
  document.getElementById('emp-card-name').textContent = currentLoggedUser.name;
  document.getElementById('emp-card-role').textContent = currentLoggedUser.role;
  document.getElementById('emp-card-id').textContent = currentLoggedUser.id;
  document.getElementById('emp-card-dept').textContent = currentLoggedUser.dept;
  
  // Format year from email variable
  let yearStr = "Active";
  if (currentLoggedUser.email) {
    if (currentLoggedUser.email.includes("year1")) yearStr = "1st Year";
    else if (currentLoggedUser.email.includes("year2")) yearStr = "2nd Year";
    else if (currentLoggedUser.email.includes("year3")) yearStr = "3rd Year";
    else if (currentLoggedUser.email.includes("year4")) yearStr = "4th Year";
  }
  document.getElementById('emp-card-email').textContent = yearStr;
  
  const initials = currentLoggedUser.name.split(' ').map(n => n[0]).join('');
  const empAvatar = document.getElementById('emp-card-avatar');
  
  empAvatar.style.padding = '0';
  empAvatar.style.overflow = 'hidden';
  empAvatar.style.display = 'flex';
  empAvatar.style.alignItems = 'center';
  empAvatar.style.justifyContent = 'center';
  
  empAvatar.innerHTML = `
    <img src="${DATA_BASE_URL}/profile_images/${currentLoggedUser.id}.jpg?t=${new Date().getTime()}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; document.getElementById('emp-card-avatar-initials').style.display='flex';" />
    <span id="emp-card-avatar-initials" style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${initials}</span>
  `;
  
  const empImg = empAvatar.querySelector('img');
  empImg.onload = () => {
    empImg.style.display = 'block';
    document.getElementById('emp-card-avatar-initials').style.display = 'none';
  };
  empImg.onerror = () => {
    empImg.style.display = 'none';
    document.getElementById('emp-card-avatar-initials').style.display = 'flex';
  };
  
  const tableBody = document.getElementById('emp-attendance-history-body');
  tableBody.innerHTML = '';
  
  logs.forEach(l => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td style="padding: 0.5rem 0; font-family: var(--font-brand); font-weight: 500;">${l.date}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${l.checkIn || '--'}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${l.checkOut || '--'}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${l.hours ? l.hours + ' hrs' : '--'}</td>
    `;
    tableBody.appendChild(row);
  });
  
  const loggedToday = employees.find(e => e.id === currentLoggedUser.id);
  const checkoutBtn = document.getElementById('btn-dashboard-checkout');
  const statusBanner = document.getElementById('today-presence-status');
  const badgeClearance = document.getElementById('badge-clearance-status');
  
  if (loggedToday && loggedToday.status === 'Present') {
    checkoutBtn.disabled = false;
    statusBanner.textContent = `CHECKED IN AT ${loggedToday.checkIn}`;
    statusBanner.style.color = 'var(--success)';
    
    badgeClearance.className = 'keycard-clearance';
    badgeClearance.innerHTML = '<i class="lucide-shield-check" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 3px;"></i> Active Clearance';
  } else {
    checkoutBtn.disabled = true;
    statusBanner.textContent = 'NOT CHECKED IN';
    statusBanner.style.color = 'var(--text-dim)';
    
    badgeClearance.className = 'keycard-clearance revoked';
    badgeClearance.innerHTML = '<i class="lucide-shield-alert" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 3px;"></i> Access Revoked';
  }
}

async function simulateDashboardPresence(type) {
  if (!currentLoggedUser) return;
  
  if (type === 'checkin') {
    router.navigate('facelogin');
    showToast('Redirecting to biometric office gate...', 'info');
  } else if (type === 'checkout') {
    // Perform leaving countdown transition
    triggerLeavingSequence();
  }
}

// ==========================================
// 10B. MEMORABLE LEAVING TRANSITION COUNTDOWN
// ==========================================

let leavingTimer = null;

async function triggerLeavingSequence(event) {
  if (event) event.stopPropagation();
  if (!currentLoggedUser) return;
  
  const employeeId = currentLoggedUser.id;
  const fullName = currentLoggedUser.name;
  
  stopAllCameras();
  
  // Show checkout dimming screen
  const farewellMsg = document.getElementById('leaving-farewell-message');
  farewellMsg.textContent = `Heading home, ${fullName}. Thanks for spending time in DemoTech today.`;
  
  const leavingOverlay = document.getElementById('view-leaving');
  leavingOverlay.classList.add('active');
  
  let secondsLeft = 4;
  const secText = document.getElementById('leaving-countdown-sec');
  const circle = document.getElementById('leaving-countdown-circle');
  
  secText.textContent = secondsLeft;
  if (circle) {
    circle.style.strokeDashoffset = 0;
  }
  
  // Call checkout endpoint in background
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  let checkoutPromise = fetch(`${API_BASE_URL}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id: employeeId }),
    signal: controller.signal
  });
  
  if (leavingTimer) clearInterval(leavingTimer);
  
  leavingTimer = setInterval(() => {
    secondsLeft--;
    secText.textContent = secondsLeft;
    
    if (circle) {
      const circumference = 213; // 2 * pi * 34
      const offset = circumference - ((4 - secondsLeft) / 4) * circumference;
      circle.style.strokeDashoffset = offset;
    }
    
    if (secondsLeft <= 0) {
      clearInterval(leavingTimer);
      leavingTimer = null;
      completeCheckoutAndExit();
    }
  }, 1000);
  
  async function completeCheckoutAndExit() {
    try {
      const res = await checkoutPromise;
      clearTimeout(timeoutId);
      if (res.ok) {
        showToast("Access logs synced. Have a great evening!", "info");
      } else {
        showToast("Leaving virtual workplace. Local status updated.", "info");
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Error executing checkout API:", err);
      showToast("Leaving virtual workplace. Local status updated.", "info");
    }
    
    currentLoggedUser = null;
    leavingOverlay.classList.remove('active');
    
    await loadDataFromBackend();
    router.navigate('landing');
  }
}

function resetLeavingStateAndVerify() {
  if (leavingTimer) {
    clearInterval(leavingTimer);
    leavingTimer = null;
  }
  const leavingOverlay = document.getElementById('view-leaving');
  leavingOverlay.classList.remove('active');
  
  router.navigate('facelogin');
  showToast("Align face to enter workspace again.", "info");
}

// ==========================================
// 11. VIRTUAL OFFICE LOBBY
// ==========================================

const LOBBY_SIMULATED_EVENTS = [
  "brewed a cup of virtual coffee in the lounge.",
  "joined the Engineering design critique meeting.",
  "pushed workspace UI layout code updates to git.",
  "activated their keycard at Lobby Gate B.",
  "started a collaborative design review in Room 4A.",
  "logged into My Workspace workstation."
];

const SIMULATED_TEAM_NAMES = ["Arjun Sharma", "Jane Cooper", "Sarah Jenkins", "Michael Chang", "Priya Nair", "Rohan Verma"];

function generateSimulatedLobbyTimeline(realLogs) {
  const timeline = document.getElementById('admin-global-activity-feed');
  if (!timeline) return;
  
  timeline.innerHTML = '';
  
  // Real check-in logs rendered first
  realLogs.slice(0, 10).forEach((l, idx) => {
    const timeStr = l.check_in_time;
    
    const entryIn = document.createElement('div');
    entryIn.className = 'lobby-timeline-entry';
    entryIn.innerHTML = `
      <div class="lobby-badge-active"></div>
      <div class="lobby-entry-msg">
        <strong>${l.full_name}</strong> verified identity at Biometric Gate and activated keycard <code>${l.employee_id}</code>.
      </div>
      <div class="lobby-entry-time">${timeStr}</div>
    `;
    timeline.appendChild(entryIn);
    
    if (l.check_out_time) {
      const entryOut = document.createElement('div');
      entryOut.className = 'lobby-timeline-entry';
      entryOut.innerHTML = `
        <div class="lobby-badge-active" style="background-color: var(--text-dim); box-shadow: none;"></div>
        <div class="lobby-entry-msg">
          <strong>${l.full_name}</strong> signed off and left the workspace.
        </div>
        <div class="lobby-entry-time">${l.check_out_time}</div>
      `;
      timeline.appendChild(entryOut);
    }
  });
  
  // Seeding background virtual office actions
  for (let i = 0; i < 4; i++) {
    const name = SIMULATED_TEAM_NAMES[(i + realLogs.length) % SIMULATED_TEAM_NAMES.length];
    const event = LOBBY_SIMULATED_EVENTS[(i * 3) % LOBBY_SIMULATED_EVENTS.length];
    
    const entrySim = document.createElement('div');
    entrySim.className = 'lobby-timeline-entry';
    
    const hour = 9 + Math.floor(i / 2);
    const min = (15 + i * 12) % 60;
    const timeSim = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')} AM`;
    
    entrySim.innerHTML = `
      <div class="lobby-badge-active" style="background-color: var(--purple); box-shadow: 0 0 8px var(--purple);"></div>
      <div class="lobby-entry-msg">
        <strong>${name}</strong> ${event}
      </div>
      <div class="lobby-entry-time">${timeSim}</div>
    `;
    timeline.appendChild(entrySim);
  }
}

async function renderAdminDashboard() {
  let total = 0;
  let present = 0;
  let absent = 0;
  
  try {
    const statsRes = await fetch(`${API_BASE_URL}/stats`);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      total = stats.total;
      present = stats.present;
      absent = stats.absent;
    } else {
      showToast("Failed to load attendance statistics.", "error");
    }
  } catch (err) {
    console.error("Failed to load admin stats:", err);
    showToast("Network error loading dashboard statistics.", "error");
  }
  
  document.getElementById('admin-stats-total').textContent = total;
  document.getElementById('admin-stats-present').textContent = present;
  document.getElementById('admin-stats-present-sub').textContent = `${total > 0 ? ((present/total)*100).toFixed(0) : 0}% present today`;
  document.getElementById('admin-stats-absent').textContent = absent;
  document.getElementById('admin-stats-absent-sub').textContent = `${total > 0 ? ((absent/total)*100).toFixed(0) : 0}% absent today`;
  
  const searchQuery = document.getElementById('admin-table-search').value.toLowerCase();
  const tableBody = document.getElementById('admin-employee-table-body');
  tableBody.innerHTML = '';
  
  const filtered = employees.filter(e => {
    return e.id.toLowerCase().includes(searchQuery) ||
           e.name.toLowerCase().includes(searchQuery) ||
           e.dept.toLowerCase().includes(searchQuery);
  });
  
  if (filtered.length === 0) {
    document.getElementById('admin-employees-empty').style.display = 'flex';
    document.getElementById('admin-table-container').style.display = 'none';
  } else {
    document.getElementById('admin-employees-empty').style.display = 'none';
    document.getElementById('admin-table-container').style.display = 'block';
    
    filtered.forEach(e => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--border-color)';
      const badge = e.status === 'Present' ? '<span class="recorded-status-pill" style="padding: 0.2rem 0.6rem; font-size: 0.72rem; box-shadow: none;">In Office</span>' : '<span style="color: var(--text-dim); font-size: 0.78rem; font-weight: 500;">Remote</span>';
      
      const college = e.role || '--';
      const course = e.dept || '--';
      
      row.innerHTML = `
        <td style="padding: 0.75rem 0; font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600;">${e.id}</td>
        <td style="font-weight: 600; color: var(--text-main);">${e.name}</td>
        <td>${course}</td>
        <td>${college}</td>
        <td style="text-align: center;">${badge}</td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem; text-align: center;">${e.checkIn || '--'}</td>
        <td style="text-align: right;">
          <button class="btn-outline" onclick="toggleAdminEmpPresence('${e.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; border-radius: 8px;">
            Toggle Status
          </button>
          <button class="btn-outline" onclick="deleteEmployeeRecord('${e.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; border-radius: 8px; color: var(--danger); border-color: rgba(239, 68, 68, 0.15);" title="Revoke keycard">
            Revoke
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });
    lucide.createIcons();
  }
  
  let realLogs = [];
  try {
    const logsRes = await fetch(`${API_BASE_URL}/attendance`);
    if (logsRes.ok) {
      realLogs = await logsRes.json();
    } else {
      showToast("Failed to fetch global access logs.", "error");
    }
  } catch (err) {
    console.error("Failed to load global activity logs:", err);
    showToast("Network error loading activity feeds.", "error");
  }
  
  generateSimulatedLobbyTimeline(realLogs);
}

// Search bar input listener
document.getElementById('admin-table-search').addEventListener('input', renderAdminDashboard);

async function toggleAdminEmpPresence(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/employees/${id}/toggle`, { method: 'POST' });
    if (!res.ok) {
      let err;
      try {
        err = await res.json();
      } catch (e) {
        err = { detail: `HTTP Error ${res.status}` };
      }
      showToast(err.detail || 'Toggle presence failed.', 'error');
      return;
    }
    const result = await res.json();
    showToast(result.message, result.employee_status === 'Present' ? 'success' : 'info');
    await loadDataFromBackend();
    renderAdminDashboard();
  } catch (err) {
    console.error(err);
    showToast('Network error toggling presence.', 'error');
  }
}

async function deleteEmployeeRecord(id) {
  if (confirm(`Are you sure you want to remove employee ID ${id} from registry?`)) {
    try {
      const res = await fetch(`${API_BASE_URL}/employees/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        let err;
        try {
          err = await res.json();
        } catch (e) {
          err = { detail: `HTTP Error ${res.status}` };
        }
        showToast(err.detail || 'Delete profile failed.', 'error');
        return;
      }
      showToast('Employee credential profile deleted.', 'error');
      
      if (currentLoggedUser && currentLoggedUser.id === id) {
        currentLoggedUser = null;
      }
      
      await loadDataFromBackend();
      router.onViewChanged(router.currentPage);
    } catch (err) {
      console.error(err);
      showToast('Network error deleting employee.', 'error');
    }
  }
}

// ==========================================
// 12. 3D KEYCARD INTERACTIVE TILT
// ==========================================

function initKeycardTiltEffect() {
  const card = document.getElementById('employee-badge-card');
  if (!card) return;
  
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    
    const angleX = (yc - y) / 10;
    const angleY = (x - xc) / 10;
    
    card.style.transform = `rotateX(${angleX}deg) rotateY(${angleY}deg) scale(1.02)`;
    
    const pctX = (x / rect.width) * 100;
    const pctY = (y / rect.height) * 100;
    card.style.setProperty('--mx', `${pctX}%`);
    card.style.setProperty('--my', `${pctY}%`);
  });
  
  card.addEventListener('mouseleave', () => {
    card.style.transform = `rotateX(0deg) rotateY(0deg) scale(1)`;
    card.style.setProperty('--mx', `50%`);
    card.style.setProperty('--my', `50%`);
  });
}

// ==========================================
// 13. CONFETTI ANIMATION ENGINE
// ==========================================

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
  }
  
  let particles = [];
  const colors = ['#FFB6D9', '#CDB4FF', '#A8D8FF', '#B8F2E6', '#FFD6A5'];
  
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 40,
      vx: (Math.random() * 2 - 1) * 6,
      vy: (Math.random() * 2 - 2.2) * 6,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 12 - 6
    });
  }
  
  function updateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.vx *= 0.98;
      p.rotation += p.rotationSpeed;
      
      if (p.y < canvas.height && p.x > 0 && p.x < canvas.width) {
        active = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      }
    });
    
    if (active) {
      confettiAnimationId = requestAnimationFrame(updateConfetti);
    }
  }
  
  updateConfetti();
}

function stopConfetti() {
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
  }
}

// ==========================================
// 14. DIALOGS, TOASTS & LOGS
// ==========================================

function getCurrentTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

function addLog(containerId, message, type = 'info') {
  const container = document.getElementById(containerId);
  if (container) {
    const entry = document.createElement('div');
    entry.className = 'terminal-entry';
    entry.innerHTML = `
      <span class="terminal-time">[${getCurrentTimestamp()}]</span> 
      <span class="terminal-msg ${type}">${message}</span>
    `;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }
}

function openModal(title, description, status = 'success') {
  const overlay = document.getElementById('app-modal');
  const iconContainer = document.getElementById('modal-icon-container');
  const icon = document.getElementById('modal-icon');
  
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-desc').textContent = description;
  
  if (status === 'success') {
    iconContainer.className = 'modal-status-avatar success';
    icon.setAttribute('data-lucide', 'check');
  } else {
    iconContainer.className = 'modal-status-avatar error';
    icon.setAttribute('data-lucide', 'alert-triangle');
  }
  
  lucide.createIcons();
  overlay.style.display = 'block';
  
  if (status === 'success') {
    setTimeout(() => {
      triggerConfetti();
    }, 100);
  }
}

function closeModal() {
  stopConfetti();
  document.getElementById('app-modal').style.display = 'none';
}

let toastTimeout = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('app-toast');
  const msgText = document.getElementById('toast-message');
  
  msgText.textContent = message;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';
  
  const icon = toast.querySelector('.friendly-toast-icon');
  let iconName = 'info';
  if (type === 'success') iconName = 'check';
  if (type === 'error') iconName = 'alert-circle';
  icon.setAttribute('data-lucide', iconName);
  lucide.createIcons();
  
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
  }, 3000);
}

// Global Theme Manager
function toggleTheme() {
  const body = document.body;
  const currentTheme = body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  body.setAttribute('data-theme', newTheme);
  localStorage.setItem('dt_theme', newTheme);
  
  // Re-load lucide icons in case theme swap updates toggles
  lucide.createIcons();
}

function initLiveClock() {
  setInterval(() => {
    const clock = document.getElementById('dashboard-clock');
    const dateElement = document.getElementById('dashboard-date');
    if (clock && dateElement) {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour12: false });
      
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateElement.textContent = now.toLocaleDateString('en-US', options);
    }
  }, 1000);
}

// ==========================================
// 15. STARTUP LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Restore theme
  const savedTheme = localStorage.getItem('dt_theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  
  lucide.createIcons();
  await checkBackendAvailability();
  await loadDataFromBackend();
  router.navigate('landing');
  initLiveClock();
});
