import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler, Legend } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler, Legend)

// ─── GLOBAL STATE ───
const GlobalContext = React.createContext()

function GlobalProvider({ children }) {
  const [currentUser, setCurrentUser] = React.useState(null)
  const [toast, setToast] = React.useState(null)
  const [surveyData, setSurveyData] = React.useState(null)

  React.useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`sanjeevni_survey_${currentUser.email}`)
      setSurveyData(saved ? JSON.parse(saved) : null)
    } else {
      setSurveyData(null)
      setRoadmap(null)
    }
  }, [currentUser])

  const completeSurvey = (data) => {
    if (currentUser) {
      localStorage.setItem(`sanjeevni_survey_${currentUser.email}`, JSON.stringify(data))
      setSurveyData(data)
      triggerToast("Onboarding Completed", "Your health goals and diet are synchronized with AI.", "success")
    }
  }

  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null)
      }, 4500)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const triggerToast = React.useCallback((title, message, type = 'success') => {
    setToast({ title, message, type })
  }, [])

  const login = (method, email, password = '') => {
    const finalEmail = email || 'johndoe@gmail.com'
    fetch('http://localhost:8000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, email: finalEmail, password })
    })
    .then(r => {
      if (!r.ok) {
        if (r.status === 401) throw new Error('Invalid password. Please try again.')
        throw new Error('Login failed')
      }
      return r.json()
    })
    .then(user => {
      if (user.isNewUser) {
        localStorage.removeItem(`sanjeevni_survey_${user.email}`)
        setSurveyData(null)
      }
      setCurrentUser(user)
    })
    .catch(err => {
      console.error("Backend login failed:", err)
      alert(err.message || 'Login failed')
    })
  }
  const logout = () => setCurrentUser(null)

  const [roadmap, setRoadmap] = React.useState(null)
  const [healthData, setHealthData] = React.useState({
    water: 0, steps: 0, sleep: 0.0, calories: 0,
    protein: 0, carbs: 0, fat: 0,
    bloodSugar: 0, bloodPressureSys: 0, bloodPressureDia: 0,
    cholesterol: 0, heartRate: 0,
  })
  const [bsHistory, setBsHistory] = React.useState([])
  const [bpSysHistory, setBpSysHistory] = React.useState([])
  const [bpDiaHistory, setBpDiaHistory] = React.useState([])
  const [readings, setReadings] = React.useState([])

  // Dynamic appointments state with localStorage persistence
  const [appointments, setAppointments] = React.useState(() => {
    try {
      const saved = localStorage.getItem('sanjeevni_appointments')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Dynamic alert read states with localStorage persistence
  const [readIds, setReadIds] = React.useState(() => {
    try {
      const saved = localStorage.getItem('sanjeevni_read_alerts')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Predictions states
  const [predictionsData, setPredictionsData] = React.useState(null)
  const [predictionsLoading, setPredictionsLoading] = React.useState(true)
  const [predictionsError, setPredictionsError] = React.useState(null)

  // Global predictions fetcher (POST request)
  const fetchPredictionsGlobal = React.useCallback((force = false, customAppts = null) => {
    const email = currentUser?.email || 'default@sanjeevni.app'
    const savedSurvey = localStorage.getItem(`sanjeevni_survey_${email}`)
    const parsedSurvey = savedSurvey ? JSON.parse(savedSurvey) : null

    setPredictionsLoading(true)
    const apptsToSend = customAppts !== null ? customAppts : appointments
    fetch('http://localhost:8000/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: email, force, appointments: apptsToSend, surveyData: parsedSurvey, apiKey: import.meta.env.VITE_GEMINI_API_KEY })
    })
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch predictions')
        return r.json()
      })
      .then(res => {
        setPredictionsData(res)
        setPredictionsError(null)
        setPredictionsLoading(false)
      })
      .catch(err => {
        console.error("Failed to load Gemini predictions:", err)
        setPredictionsError(err)
        setPredictionsLoading(false)
      })
  }, [currentUser, appointments])

  const bookAppointment = (doctorName, specialty, clinic, timeStr = 'Tomorrow at 10:30 AM', mode = 'Offline', isUrgent = false) => {
    const newAppt = {
      id: 'appt_' + Date.now(),
      doctorName,
      specialty,
      clinic,
      time: timeStr,
      mode,
      isUrgent,
      dateBooked: 'Just now',
      isNew: true
    }
    const updated = [newAppt, ...appointments]
    setAppointments(updated)
    localStorage.setItem('sanjeevni_appointments', JSON.stringify(updated))
    // Instantly refresh AI predictions with the new doctor appointment
    fetchPredictionsGlobal(false, updated)
  }

  const markAlertAsRead = (id) => {
    const next = new Set(readIds)
    next.add(id)
    setReadIds(next)
    localStorage.setItem('sanjeevni_read_alerts', JSON.stringify(Array.from(next)))
  }

  const markAllAlertsRead = (ids) => {
    const next = new Set(readIds)
    ids.forEach(id => next.add(id))
    setReadIds(next)
    localStorage.setItem('sanjeevni_read_alerts', JSON.stringify(Array.from(next)))
  }

  React.useEffect(() => {
    const email = currentUser?.email || 'default@sanjeevni.app'
    fetch(`http://localhost:8000/api/health-data?user=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        if(data.healthData) setHealthData(data.healthData)
        if(data.bsHistory) setBsHistory(data.bsHistory)
        if(data.bpSysHistory) setBpSysHistory(data.bpSysHistory)
        if(data.bpDiaHistory) setBpDiaHistory(data.bpDiaHistory)
        if(data.readings) setReadings(data.readings)
        if(data.roadmap) setRoadmap(data.roadmap)
      })
      .catch(err => console.error("Backend not running, using mock data", err))
  }, [currentUser])

  const logData = (form) => {
    const email = currentUser?.email || 'default@sanjeevni.app'
    fetch('http://localhost:8000/api/log-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, userEmail: email })
    })
    .then(r => r.json())
    .then(data => {
      if(data.healthData) setHealthData(data.healthData)
      if(data.bsHistory) setBsHistory(data.bsHistory)
      if(data.bpSysHistory) setBpSysHistory(data.bpSysHistory)
      if(data.bpDiaHistory) setBpDiaHistory(data.bpDiaHistory)
      if(data.readings) setReadings(data.readings)
      
      triggerToast('Metrics Updated Successfully', 'Your health metrics and manual logs have been updated.', 'success')
      // Auto-trigger predictions AI scan immediately using the updated metrics
      fetchPredictionsGlobal(false)
    })
    .catch(err => {
      console.error("Backend not running, failed to log:", err)
      // Fallback for demo if backend is dead
      const newData = { ...healthData }
      for(let k in form) { if(form[k]) newData[k] = Number(form[k]) }
      setHealthData(newData)
      triggerToast('Metrics Saved Locally', 'Backend offline; updated values locally.', 'warning')
    })
  }

  // Load predictions globally on user change
  React.useEffect(() => {
    if (currentUser) {
      fetchPredictionsGlobal(false)
    }
  }, [currentUser, fetchPredictionsGlobal])

  // Setup interval to fetch predictions globally every 15 minutes automatically
  React.useEffect(() => {
    if (!currentUser) return
    const timer = setInterval(() => {
      fetchPredictionsGlobal(false)
    }, 900000) // 15 mins
    return () => clearInterval(timer)
  }, [currentUser, fetchPredictionsGlobal])

  // Derive Alerts globally
  const alerts = React.useMemo(() => {
    const list = []
    
    // Dynamic alerts from user-booked doctor appointments
    appointments.forEach(appt => {
      list.push({
        id: appt.id,
        icon: '📅',
        title: 'Upcoming Appointment',
        desc: `${appt.doctorName} (${appt.specialty}) — ${appt.time} · ${appt.clinic}`,
        time: appt.dateBooked,
        color: 'rgba(0, 212, 255, 0.05)',
        border: 'rgba(0, 212, 255, 0.15)',
        isNew: appt.isNew
      })
    })

    if (healthData.bloodPressureSys >= 130)
      list.push({ id: 'bp', icon: '🚨', title: 'High Blood Pressure Detected', desc: `Current reading ${healthData.bloodPressureSys}/${healthData.bloodPressureDia} mmHg. ${healthData.bloodPressureSys >= 140 ? 'Stage 2 — see a doctor urgently!' : 'Stage 1 — monitor closely.'}`, time: 'Just now', color: 'rgba(255,77,109,0.08)', border: 'rgba(255,77,109,0.2)', isNew: true })
    if (healthData.bloodSugar > 100)
      list.push({ id: 'bs', icon: '⚠️', title: 'Blood Sugar Above Normal', desc: `Blood sugar of ${healthData.bloodSugar} mg/dL is ${healthData.bloodSugar > 125 ? 'in diabetic range' : 'in pre-diabetic range'}. Consider dietary changes.`, time: 'Just now', color: 'rgba(255,140,66,0.08)', border: 'rgba(255,140,66,0.2)', isNew: true })
    if (healthData.cholesterol >= 170)
      list.push({ id: 'chol', icon: '🩸', title: 'Elevated Cholesterol', desc: `Cholesterol at ${healthData.cholesterol} mg/dL is ${healthData.cholesterol >= 200 ? 'high' : 'borderline high'}. Reduce saturated fats.`, time: 'Just now', color: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.15)', isNew: false })
    if (healthData.steps < 5000)
      list.push({ id: 'steps', icon: '🏃', title: 'Low Step Count', desc: `Only ${healthData.steps.toLocaleString()} steps today. Need ${(10000 - healthData.steps).toLocaleString()} more to reach 10,000 goal.`, time: 'Today', color: 'rgba(167,139,250,0.05)', border: 'rgba(167,139,250,0.15)', isNew: false })
    if (healthData.water < 6)
      list.push({ id: 'water', icon: '💧', title: 'Low Hydration', desc: `Only ${healthData.water} glasses today. Aim for 8 glasses (2L) daily.`, time: 'Today', color: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.15)', isNew: false })
    list.push({ id: 'med',  icon: '💊', title: 'Medication Reminder',  desc: 'Your Vitamin D supplement is due. Take 1 tablet with breakfast.', time: 'Today 8:00 AM', color: 'rgba(255,140,66,0.05)', border: 'rgba(255,140,66,0.1)', isNew: false })
    
    // Add default mock appointment if no custom appointments exist
    if (appointments.length === 0) {
      list.push({ id: 'appt_default', icon: '📅', title: 'Upcoming Appointment', desc: 'Dr. Johny Paji (Cardiologist) — Tomorrow at 10:30 AM · City Health Clinic, Mohali', time: 'Yesterday 5:00 PM', color: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.1)', isNew: false })
    }
    return list
  }, [healthData, appointments])

  const unreadCount = React.useMemo(() => {
    return alerts.filter(a => a.isNew && !readIds.has(a.id)).length
  }, [alerts, readIds])

  return (
    <GlobalContext.Provider value={{ currentUser, login, logout, healthData, bsHistory, bpSysHistory, bpDiaHistory, readings, logData, appointments, bookAppointment, alerts, unreadCount, readIds, markAlertAsRead, markAllAlertsRead, predictionsData, predictionsLoading, predictionsError, fetchPredictionsGlobal, toast, setToast, triggerToast, surveyData, completeSurvey, roadmap }}>
      {children}
    </GlobalContext.Provider>
  )
}

// ─── HELPERS ───
const card = {
  background: 'rgba(19, 29, 46, 0.65)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '20px',
  padding: '24px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
}
const btn = {
  borderRadius: '12px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: '700',
  fontSize: '13.5px',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
}
const btnPrimary = {
  ...btn,
  background: 'linear-gradient(135deg, #00f0ff 0%, #0072ff 100%)',
  color: '#070b13',
  padding: '10px 22px',
  boxShadow: '0 4px 15px rgba(0, 212, 255, 0.25)',
}
const btnOutline = {
  ...btn,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: 'white',
  padding: '10px 22px',
}
const input = {
  width: '100%',
  background: 'rgba(7, 11, 20, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '12px',
  padding: '12px 16px',
  color: 'white',
  fontSize: '13.5px',
  outline: 'none',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  transition: 'all 0.2s'
}

function getStatus(type, val) {
  if (type === 'bs') {
    if (val < 70)   return { text: '⚠️ Low',          color: '#ff8c42' }
    if (val <= 100) return { text: '✅ Normal',         color: '#00e5a0' }
    if (val <= 125) return { text: '⚠️ Pre-diabetic',  color: '#ff8c42' }
    return             { text: '🚨 High',          color: '#ff4d6d' }
  }
  if (type === 'bpSys') {
    if (val < 120)  return { text: '✅ Normal',    color: '#00e5a0' }
    if (val < 130)  return { text: '⚠️ Elevated',  color: '#ff8c42' }
    if (val < 140)  return { text: '⚠️ Stage 1',   color: '#ff8c42' }
    return             { text: '🚨 Stage 2',   color: '#ff4d6d' }
  }
  if (type === 'chol') {
    if (val < 170)  return { text: '✅ Normal',     color: '#00e5a0' }
    if (val < 200)  return { text: 'ℹ️ Borderline', color: '#00d4ff' }
    return             { text: '🚨 High',       color: '#ff4d6d' }
  }
  if (type === 'hr') {
    if (val >= 60 && val <= 100) return { text: '✅ Normal',   color: '#00e5a0' }
    return { text: '⚠️ Abnormal', color: '#ff8c42' }
  }
  return { text: '→ OK', color: '#00e5a0' }
}

function getHealthScore(d) {
  let score = 100
  if (d.bloodSugar < 70)         score -= 15
  else if (d.bloodSugar > 125)   score -= 20
  else if (d.bloodSugar > 100)   score -= 10
  
  if (d.bloodPressureSys >= 140) score -= 15
  else if (d.bloodPressureSys >= 130) score -= 10
  if (d.bloodPressureDia >= 90)  score -= 10
  else if (d.bloodPressureDia >= 80) score -= 5

  if (d.cholesterol >= 240)      score -= 20
  else if (d.cholesterol >= 200) score -= 10

  if (d.heartRate < 60 || d.heartRate > 100) score -= 10

  if (d.steps < 5000)            score -= 10
  else if (d.steps < 8000)       score -= 5
  if (d.sleep < 6)               score -= 10
  if (d.water < 6)               score -= 5
  return Math.max(score, 0)
}

// ─── LOG MODAL ───
function LogModal({ onClose }) {
  const { logData } = React.useContext(GlobalContext)
  const [form, setForm] = React.useState({
    water: '', steps: '', sleep: '', calories: '',
    bloodSugar: '', bpSys: '', bpDia: '', cholesterol: '', heartRate: ''
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const fields = [
    { label: '💧 Glasses of Water',    key: 'water',       placeholder: 'e.g. 7' },
    { label: '👟 Steps Today',         key: 'steps',       placeholder: 'e.g. 8500' },
    { label: '😴 Sleep Hours',         key: 'sleep',       placeholder: 'e.g. 7.5' },
    { label: '🔥 Calories Burned',     key: 'calories',    placeholder: 'e.g. 2000' },
    { label: '🍬 Blood Sugar (mg/dL)', key: 'bloodSugar',  placeholder: 'e.g. 98' },
    { label: '❤️ BP Systolic',         key: 'bpSys',       placeholder: 'e.g. 128' },
    { label: '❤️ BP Diastolic',        key: 'bpDia',       placeholder: 'e.g. 84' },
    { label: '🩸 Cholesterol (mg/dL)', key: 'cholesterol', placeholder: 'e.g. 182' },
    { label: '💓 Heart Rate (bpm)',    key: 'heartRate',   placeholder: 'e.g. 74' },
  ]

  const handleSave = () => {
    logData(form)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto' }}>
      <div style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '28px', width: '480px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>📋 Log Health Data</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>Only fill what you want to update — empty fields keep their current value</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '5px', fontWeight: '500' }}>{f.label}</div>
              <input
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                type="number"
                style={input}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1, padding: '11px' }}>Cancel</button>
          <button onClick={handleSave} style={{ ...btnPrimary, flex: 1, padding: '11px' }}>✓ Save All Data</button>
        </div>
      </div>
    </div>
  )
}

// ─── SIDEBAR ───
function Sidebar() {
  const { currentUser, logout, unreadCount } = React.useContext(GlobalContext)
  const location = useLocation()
  const navigate = useNavigate()
  const navItems = [
    { path: '/dashboard',   icon: '📊', label: 'Dashboard' },
    { path: '/lifestyle',   icon: '🏃', label: 'Lifestyle Tracking' },
    { path: '/medical',     icon: '🩺', label: 'Medical Monitoring' },
    { path: '/predictions', icon: '🧠', label: 'AI Predictions' },
    { path: '/doctors',     icon: '👨‍⚕️', label: 'Find Doctors' },
    { path: '/chatbot',     icon: '💬', label: 'AI Chatbot' },
    { path: '/alerts',      icon: '🔔', label: 'Alerts' },
  ]
  return (
    <aside className="sidebar-container">
      <div className="sidebar-logo-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px 28px' }}>
        <div className="sidebar-logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', animation: 'logoFloat 3s ease-in-out infinite' }}>
          <svg width="48" height="48" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="50" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#00f0ff" />
              </linearGradient>
              <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {/* Hexagonal capsule outline */}
            <path d="M25 3 L45 14.5 V35.5 L25 47 L5 35.5 V14.5 L25 3 Z" stroke="url(#logoGrad)" strokeWidth="1.5" strokeOpacity="0.25" fill="rgba(0, 212, 255, 0.02)" />
            {/* Heart outline silhouette in center */}
            <path d="M25 36.5C24.2 36 16.5 29.5 16.5 22.5C16.5 18.5 19.5 15.5 23.5 15.5C25 15.5 25.5 16.2 25 16.2C25 16.2 25.5 15.5 27 15.5C31 15.5 34 18.5 34 22.5C34 29.5 25.8 36 25 36.5Z" 
              stroke="url(#logoGrad)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" fill="none" />
            {/* The pulsing dynamic ECG wave */}
            <path d="M12 25 H18.5 L22 15 L25.5 35 L28.5 21 L31.5 29 L33 25 H38" 
              className="logo-pulse-path" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#logoGlow)" />
          </svg>
        </div>
        <div className="sidebar-brand-name" style={{ fontSize: '26px', letterSpacing: '2.5px' }}>SANJEEVNI</div>
        <div className="sidebar-subtitle" style={{ fontSize: '10px', opacity: 0.5 }}>v2.0 · Smart AI Health Platform</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => {
          const active = location.pathname === item.path
          return (
            <div key={item.path} onClick={() => navigate(item.path)}
              className={`nav-item ${active ? 'active' : ''}`}>
              {active && <div className="nav-active-bar" />}
              <span className="nav-icon-wrapper">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.path === '/alerts' && unreadCount > 0 && <span className="badge-dot"></span>}
              {item.path === '/doctors' && <span className="badge-new">NEW</span>}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-profile">
        <div className="profile-avatar-wrapper">
          <img src={currentUser?.avatar} alt="Avatar" className="profile-avatar" />
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div className="profile-name">{currentUser?.name}</div>
          <div className="profile-role">Pro Member</div>
        </div>
        <button onClick={logout} className="logout-button" title="Sign Out">🚪</button>
      </div>
    </aside>
  )
}

// ─── SINGLE METRIC LOG MODAL ───
function SingleLogModal({ fields, title, icon, onClose }) {
  const { logData } = React.useContext(GlobalContext)
  const [form, setForm] = React.useState({})

  const handleSave = () => {
    const dataToLog = {}
    Object.keys(form).forEach(k => {
      if (form[k] && form[k] !== '') dataToLog[k] = form[k]
    })
    if (Object.keys(dataToLog).length > 0) logData(dataToLog)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '28px', width: '350px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>
          {icon} Log {title}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
          Enter your new reading to update your dashboard instantly.
        </div>
        
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: '12px' }}>
            {fields.length > 1 && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>{f.label}</div>}
            <input 
              type="number" 
              value={form[f.key] || ''} 
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} 
              placeholder={`Current: ${f.val}`} 
              style={{ width: '100%', background: '#0a0f1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px', color: 'white', fontSize: '16px', outline: 'none', fontFamily: 'sans-serif' }} 
            />
          </div>
        ))}
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1, padding: '12px' }}>Cancel</button>
          <button onClick={handleSave} style={{ ...btnPrimary, flex: 2, padding: '12px' }}>✓ Update</button>
        </div>
      </div>
    </div>
  )
}

// ─── DASHBOARD ───
function Dashboard() {
  // ✅ FIX: Destructure directly from context — always fresh
  const { healthData, bsHistory, bpSysHistory, bpDiaHistory, predictionsData, fetchPredictionsGlobal, roadmap } = React.useContext(GlobalContext)
  const [period, setPeriod] = React.useState('1W')
  const [showModal, setShowModal] = React.useState(false)
  const [selectedSingleLog, setSelectedSingleLog] = React.useState(null)

  const score = getHealthScore(healthData)
  const scoreOffset = 364 - (364 * score / 100)

  const labels = {
    '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    '1M': ['W1', 'W2', 'W3', 'W4'],
    '3M': ['Jan', 'Feb', 'Mar']
  }
  const bsLabels   = labels[period]
  const bsVals     = period === '1W' ? bsHistory     : period === '1M' ? [100, 97, 103, bsHistory[bsHistory.length - 1]]         : [104, 100, bsHistory[bsHistory.length - 1]]
  const bpSysVals  = period === '1W' ? bpSysHistory  : period === '1M' ? [130, 128, 132, bpSysHistory[bpSysHistory.length - 1]]  : [133, 130, bpSysHistory[bpSysHistory.length - 1]]
  const bpDiaVals  = period === '1W' ? bpDiaHistory  : period === '1M' ? [85, 84, 86, bpDiaHistory[bpDiaHistory.length - 1]]     : [87, 85, bpDiaHistory[bpDiaHistory.length - 1]]

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a2640', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,212,255,0.2)', borderWidth: 1 } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } } }
    },
  }

  return (
    <div style={{ color: 'white' }}>
      {showModal && <LogModal onClose={() => setShowModal(false)} />}
      {selectedSingleLog && (
        <SingleLogModal 
          fields={selectedSingleLog.fields || [{ key: selectedSingleLog.key, label: selectedSingleLog.label || selectedSingleLog.title, val: selectedSingleLog.val }]}
          title={selectedSingleLog.label || selectedSingleLog.title} 
          icon={selectedSingleLog.icon} 
          onClose={() => setSelectedSingleLog(null)} 
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Health Dashboard <span style={{ WebkitTextFillColor: 'initial', filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))' }}>📊</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>
            Today, {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          {predictionsData?.cachedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(0, 212, 255, 0.8)', marginTop: '8px', background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '20px', padding: '4px 12px', width: 'fit-content' }}>
              <span className="pulsing-cache-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px #00d4ff' }} />
              <span>
                AI Diagnostics: {predictionsData.isCached ? 'Cached' : 'Live Check Done'} ({new Date(predictionsData.cachedAt * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})})
              </span>
              <style>{`
                .pulsing-cache-dot {
                  animation: cachePulse 2s infinite ease-in-out;
                }
                @keyframes cachePulse {
                  0% { opacity: 0.4; }
                  50% { opacity: 1; }
                  100% { opacity: 0.4; }
                }
              `}</style>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnOutline}>📋 Export Report</button>
          <button onClick={() => setShowModal(true)} style={btnPrimary}>+ Log Health Data</button>
        </div>
      </div>

      {/* ✅ Stat Cards — read directly from healthData */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { icon: '💧', val: healthData.water,                    label: 'Glasses of Water', color: '#00d4ff', bg: 'rgba(0,212,255,0.1)',   unit: '', key: 'water' },
          { icon: '👟', val: healthData.steps.toLocaleString(),   label: 'Steps Today',      color: '#00e5a0', bg: 'rgba(0,229,160,0.1)',   unit: '', key: 'steps' },
          { icon: '😴', val: healthData.sleep,                    label: 'Sleep Duration',   color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', unit: 'h', key: 'sleep' },
          { icon: '🔥', val: healthData.calories.toLocaleString(),label: 'Calories Burned',  color: '#ff8c42', bg: 'rgba(255,140,66,0.1)',  unit: '', key: 'calories' },
        ].map((s, i) => (
          <div key={i} className={`metric-card metric-card-${s.key}`} style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => setSelectedSingleLog(s)}>
            <div className="icon-container-wrapper" style={{ width: '42px', height: '42px', borderRadius: '12px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, boxShadow: `0 0 10px ${s.bg}` }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: s.color, fontFamily: "'Outfit', sans-serif" }}>{s.val}{s.unit}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
        {/* Health Score Ring */}
        <div className="chart-card" style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '16px', fontWeight: '600' }}>Overall Health Score</div>
          <div style={{ position: 'relative', width: '140px', height: '140px', marginBottom: '14px' }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
              <circle cx="70" cy="70" r="58" fill="none"
                stroke={score >= 80 ? 'url(#gradG)' : score >= 60 ? 'url(#gradY)' : 'url(#gradR)'}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray="364" strokeDashoffset={scoreOffset}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
              <defs>
                <linearGradient id="gradG" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#00d4ff" /><stop offset="100%" stopColor="#00e5a0" /></linearGradient>
                <linearGradient id="gradY" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#ff8c42" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient>
                <linearGradient id="gradR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#ff4d6d" /><stop offset="100%" stopColor="#ff8c42" /></linearGradient>
              </defs>
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '42px', fontWeight: '900', color: score >= 80 ? '#00d4ff' : score >= 60 ? '#ff8c42' : '#ff4d6d', transition: 'all 0.5s', fontFamily: "'Outfit', sans-serif", letterSpacing: '-1px' }}>{score}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>/100</div>
            </div>
          </div>
          <div style={{ marginBottom: '6px' }}>
            <span className="status-pill" style={{
              color: score >= 80 ? '#00e5a0' : score >= 60 ? '#ff8c42' : '#ff4d6d',
              background: score >= 80 ? '#00e5a015' : score >= 60 ? '#ff8c4215' : '#ff4d6d15',
              border: `1px solid ${score >= 80 ? '#00e5a025' : score >= 60 ? '#ff8c4225' : '#ff4d6d25'}`
            }}>
              {score >= 80 ? 'Good Health' : score >= 60 ? 'Needs Attention' : 'Action Required'}
            </span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Updates when you log data</div>
        </div>

        {roadmap && (
          <div style={card}>
            <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '16px' }}>Your AI Roadmap</h3>
            <p style={{ margin: '4px 0', color: '#00d4ff' }}>{roadmap.calorieGoal} ({roadmap.calorieVal} kcal)</p>
            <p style={{ margin: '4px 0', color: '#00d4ff' }}>{roadmap.hydrationTarget} ({roadmap.hydrationVal} glasses)</p>
            <p style={{ margin: '4px 0', color: '#00d4ff' }}>{roadmap.movementGoal} ({roadmap.movementVal} steps)</p>
            <p style={{ margin: '4px 0', color: '#fff' }}>{roadmap.clinicalContext}</p>
          </div>
        )}

        {/* ✅ Vital Cards — read from healthData every render */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[
            { title: 'Blood Sugar',    icon: '🍬', val: healthData.bloodSugar,                                          unit: 'mg/dL', stat: getStatus('bs',    healthData.bloodSugar), key: 'bloodSugar' },
            { title: 'Blood Pressure', icon: '❤️', val: `${healthData.bloodPressureSys}/${healthData.bloodPressureDia}`, unit: '',      stat: getStatus('bpSys', healthData.bloodPressureSys), fields: [{key: 'bpSys', label: 'Systolic', val: healthData.bloodPressureSys}, {key: 'bpDia', label: 'Diastolic', val: healthData.bloodPressureDia}] },
            { title: 'Cholesterol',    icon: '🩸', val: healthData.cholesterol,                                         unit: 'mg/dL', stat: getStatus('chol',  healthData.cholesterol), key: 'cholesterol' },
            { title: 'Heart Rate',     icon: '💓', val: healthData.heartRate,                                           unit: 'bpm',   stat: getStatus('hr',    healthData.heartRate), key: 'heartRate' },
          ].map((v, i) => (
            <div key={i} className={`vital-card vital-card-${v.key || 'bp'}`} style={{ ...card, cursor: 'pointer' }} onClick={() => setSelectedSingleLog(v)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>{v.title}</span>
                <span className="icon-container-wrapper" style={{ fontSize: '16px', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{v.icon}</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'white', marginBottom: '4px', transition: 'all 0.3s', fontFamily: "'Outfit', sans-serif" }}>
                {v.val}<span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px', fontWeight: '400', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{v.unit}</span>
              </div>
              <div style={{ marginTop: '6px' }}>
                <span className="status-pill" style={{ color: v.stat.color, background: `${v.stat.color}15`, border: `1px solid ${v.stat.color}25` }}>{v.stat.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        {[
          {
            title: 'Blood Sugar Trend', sub: 'mg/dL',
            data: { labels: bsLabels, datasets: [{ label: 'Blood Sugar', data: bsVals, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#00d4ff', pointRadius: 4 }] }
          },
          {
            title: 'Blood Pressure', sub: 'Systolic vs Diastolic',
            data: { labels: bsLabels, datasets: [{ label: 'Systolic', data: bpSysVals, borderColor: '#ff8c42', backgroundColor: 'transparent', tension: 0.4, pointBackgroundColor: '#ff8c42', pointRadius: 3 }, { label: 'Diastolic', data: bpDiaVals, borderColor: '#a78bfa', backgroundColor: 'transparent', tension: 0.4, pointBackgroundColor: '#a78bfa', pointRadius: 3 }] }
          },
        ].map((c, i) => (
          <div key={i} className="chart-card" style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', fontFamily: "'Outfit', sans-serif" }}>{c.title}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{c.sub}</div>
              </div>
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '2px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {['1W', '1M', '3M'].map(t => (
                  <button key={t} onClick={() => setPeriod(t)}
                    style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '20px', border: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", background: period === t ? 'rgba(0,212,255,0.15)' : 'transparent', color: period === t ? '#00d4ff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: '130px' }}>
              <Line data={c.data} options={chartOpts} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── LIFESTYLE LOG MODAL ───
function LifestyleLogModal({ onClose }) {
  const { logData } = React.useContext(GlobalContext)
  const [form, setForm] = React.useState({
    water: '', steps: '', sleep: '', calories: '',
    bloodSugar: '', bpSys: '', bpDia: '', cholesterol: '', heartRate: ''
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const fields = [
    { label: '🔥 Calories Intake/Burned', key: 'calories', placeholder: 'e.g. 2000' },
    { label: '💧 Glasses of Water',       key: 'water',    placeholder: 'e.g. 7' },
    { label: '👟 Steps Today',            key: 'steps',    placeholder: 'e.g. 8500' },
    { label: '😴 Sleep Hours',            key: 'sleep',    placeholder: 'e.g. 7.5' },
  ]

  const handleSave = () => {
    logData(form)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto' }}>
      <div style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '28px', width: '400px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>🏃 Log Lifestyle Data</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>Only fill what you want to update — empty fields keep their current value</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {fields.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '5px', fontWeight: '500' }}>{f.label}</div>
              <input
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                type="number"
                style={input}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1, padding: '11px' }}>Cancel</button>
          <button onClick={handleSave} style={{ ...btnPrimary, flex: 1, padding: '11px' }}>✓ Save Data</button>
        </div>
      </div>
    </div>
  )
}

// ─── FOOD INTAKE SCREEN ───
const foodDb = [
  { name: 'Paneer (100g)', cal: 265, pro: 18, carbs: 1.2, fat: 20 },
  { name: 'Roti (1 piece)', cal: 120, pro: 3.5, carbs: 22, fat: 1.5 },
  { name: 'Chicken Breast (100g)', cal: 165, pro: 31, carbs: 0, fat: 3.6 },
  { name: 'Rice (1 bowl)', cal: 130, pro: 2.7, carbs: 28, fat: 0.3 },
  { name: 'Dal (1 bowl)', cal: 116, pro: 9, carbs: 20, fat: 4 },
  { name: 'Boiled Egg (1)', cal: 78, pro: 6, carbs: 0.6, fat: 5 },
  { name: 'Milk (1 glass)', cal: 103, pro: 8, carbs: 12, fat: 2.4 },
  { name: 'Banana Shake (1 glass)', cal: 210, pro: 5, carbs: 35, fat: 3 },
  { name: 'Oats (1 bowl)', cal: 150, pro: 5, carbs: 27, fat: 2.5 },
  { name: 'Mixed Nuts (30g)', cal: 170, pro: 6, carbs: 6, fat: 15 },
]

function FoodIntakeScreen({ onClose }) {
  const { healthData, logData } = React.useContext(GlobalContext)
  
  const [isCustom, setIsCustom] = React.useState(false)
  const [customFoodName, setCustomFoodName] = React.useState('')
  const [selectedFoodIdx, setSelectedFoodIdx] = React.useState(0)
  const [quantity, setQuantity] = React.useState(1)
  const [mealItems, setMealItems] = React.useState([])
  const [adding, setAdding] = React.useState(false)

  // Weight Gain Goals
  const goals = { cal: 2500, pro: 130, carbs: 300, fat: 80 }

  const handleAddItem = () => {
    let foodName = ''
    if (isCustom) {
      foodName = customFoodName.trim()
    } else {
      foodName = foodDb[selectedFoodIdx].name
    }
    if (!foodName) return

    setAdding(true)
    fetch('http://localhost:8000/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foodName, quantity: Number(quantity) })
    })
    .then(r => {
      if (!r.ok) throw new Error('API error')
      return r.json()
    })
    .then(res => {
      setMealItems(prev => [...prev, {
        name: res.name || foodName,
        cal: Number(res.cal) || 0,
        pro: Number(res.pro) || 0,
        carbs: Number(res.carbs) || 0,
        fat: Number(res.fat) || 0,
        qty: 1
      }])
      setCustomFoodName('')
      setQuantity(1)
      setAdding(false)
    })
    .catch(err => {
      console.error("AI Food analysis failed:", err)
      // Fallback: if we were using standard food, use the local DB values
      if (!isCustom) {
        const localFood = foodDb[selectedFoodIdx]
        setMealItems(prev => [...prev, {
          name: localFood.name,
          cal: localFood.cal * Number(quantity),
          pro: localFood.pro * Number(quantity),
          carbs: localFood.carbs * Number(quantity),
          fat: localFood.fat * Number(quantity),
          qty: 1
        }])
      } else {
        // Fallback for custom food when API fails completely (using some basic default estimation)
        setMealItems(prev => [...prev, {
          name: foodName,
          cal: 150 * Number(quantity),
          pro: 5 * Number(quantity),
          carbs: 20 * Number(quantity),
          fat: 5 * Number(quantity),
          qty: 1
        }])
      }
      setCustomFoodName('')
      setQuantity(1)
      setAdding(false)
    })
  }

  const mealTotals = mealItems.reduce((acc, item) => {
    acc.cal += item.cal * item.qty
    acc.pro += item.pro * item.qty
    acc.carbs += item.carbs * item.qty
    acc.fat += item.fat * item.qty
    return acc
  }, { cal: 0, pro: 0, carbs: 0, fat: 0 })

  const handleSave = () => {
    if (mealItems.length === 0) return onClose()
    logData({
      calories: healthData.calories + mealTotals.cal,
      protein: healthData.protein + mealTotals.pro,
      carbs: healthData.carbs + mealTotals.carbs,
      fat: healthData.fat + mealTotals.fat
    })
    onClose()
  }

  // Insights Logic
  const totalPro = healthData.protein + mealTotals.pro
  const proRemaining = Math.max(0, goals.pro - totalPro)
  
  let insightText = ''
  if (proRemaining === 0) {
    insightText = '🔥 Goal crushed! You hit your protein target for the day.'
  } else if (totalPro > goals.pro * 0.8) {
    insightText = `💪 Almost there! You only need ${Math.round(proRemaining)}g more protein to hit your weight gain goal.`
  } else if (mealItems.length > 0) {
    insightText = `📈 Keep going! This meal bumps you to ${Math.round(totalPro)}g protein today (Goal: ${goals.pro}g).`
  } else {
    insightText = `📈 Your weight gain goal is ${goals.pro}g of protein daily. You currently have ${Math.round(healthData.protein)}g.`
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto' }}>
      <div style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '28px', width: '450px', margin: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>🍽️ Smart Food Log</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>Build your meal by adding foods. We'll track your macros automatically.</div>
        
        {/* Toggle between standard list and custom input */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px', marginBottom: '14px' }}>
          <button 
            type="button"
            onClick={() => { setIsCustom(false); setCustomFoodName(''); }} 
            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s',
              background: !isCustom ? 'rgba(0,212,255,0.15)' : 'transparent',
              color: !isCustom ? '#00d4ff' : 'rgba(255,255,255,0.5)' }}
          >
            📋 Standard List
          </button>
          <button 
            type="button"
            onClick={() => setIsCustom(true)} 
            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s',
              background: isCustom ? 'rgba(0,212,255,0.15)' : 'transparent',
              color: isCustom ? '#00d4ff' : 'rgba(255,255,255,0.5)' }}
          >
            ✍️ Custom Meal
          </button>
        </div>

        {/* Input Section */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div style={{ flex: 2 }}>
            {isCustom ? (
              <>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', fontWeight: '500' }}>Custom Food Name</div>
                <input
                  type="text"
                  placeholder="e.g. 2 paranthas, 1 cup butter chicken"
                  value={customFoodName}
                  onChange={e => setCustomFoodName(e.target.value)}
                  style={input}
                  disabled={adding}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', fontWeight: '500' }}>Select Food</div>
                <select 
                  style={{ ...input, cursor: 'pointer', appearance: 'menulist' }} 
                  value={selectedFoodIdx} 
                  onChange={e => setSelectedFoodIdx(Number(e.target.value))}
                  disabled={adding}
                >
                  {foodDb.map((f, i) => <option key={i} value={i} style={{ background: '#0a0f1e' }}>{f.name}</option>)}
                </select>
              </>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', fontWeight: '500' }}>Qty (Servings)</div>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              style={input}
              disabled={adding}
            />
          </div>
          <button 
            onClick={handleAddItem} 
            style={{ ...btnPrimary, padding: '10px 16px', flexShrink: 0 }}
            disabled={adding || (isCustom && !customFoodName.trim())}
          >
            {adding ? 'Analyzing...' : '+ Add'}
          </button>
        </div>

        {/* Meal List */}
        {mealItems.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'white', marginBottom: '10px' }}>Current Meal Items:</div>
            {mealItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'white', fontWeight: '500' }}>
                  <span>• {item.name}</span>
                  <span style={{ color: '#00d4ff' }}>{Math.round(item.cal)} kcal</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', paddingLeft: '8px', marginTop: '2px' }}>
                  <span style={{ color: '#00e5a0' }}>🧪 Pro: {item.pro}g</span>
                  <span style={{ color: '#ff8c42' }}>🌾 Carbs: {item.carbs}g</span>
                  <span style={{ color: '#ff4d6d' }}>🥑 Fat: {item.fat}g</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#00e5a0' }}>
              <span>Total Added:</span>
              <span style={{ fontWeight: 'bold' }}>{Math.round(mealTotals.cal)} kcal | {Math.round(mealTotals.pro)}g Pro</span>
            </div>
          </div>
        )}

        {/* AI Insights Section */}
        <div style={{ background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px' }}>✨</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#00d4ff' }}>Goal Insight (Weight Gain)</span>
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.5' }}>
            {insightText}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnOutline, flex: 1, padding: '12px' }}>Cancel</button>
          <button onClick={handleSave} style={{ ...btnPrimary, flex: 2, padding: '12px' }} disabled={mealItems.length === 0}>
            ✓ Save Meal
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── LIFESTYLE ───
function Lifestyle() {
  // ✅ FIX: Read healthData from context directly — no local copy
  const { healthData, logData, predictionsData, fetchPredictionsGlobal } = React.useContext(GlobalContext)
  const [showModal, setShowModal] = React.useState(false)
  const [showFoodModal, setShowFoodModal] = React.useState(false)
  const [localWater, setLocalWater] = React.useState(null)

  // ✅ FIX: localWater overrides context only when user taps circles on this page
  const water = localWater !== null ? localWater : healthData.water

  // Reset local override when context updates
  React.useEffect(() => { setLocalWater(null) }, [healthData.water])

  const stepPct  = Math.min(healthData.steps    / 10000 * 100, 100)
  const sleepPct = Math.min(healthData.sleep    / 8     * 100, 100)
  const calPct   = Math.min(healthData.calories / 2200  * 100, 100)

  return (
    <div style={{ color: 'white' }}>
      {showModal && <LifestyleLogModal onClose={() => setShowModal(false)} />}
      {showFoodModal && <FoodIntakeScreen onClose={() => setShowFoodModal(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800' }}>Lifestyle Tracking 🏃</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Monitor your daily habits and wellness routines</p>
          {predictionsData?.cachedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(0, 212, 255, 0.8)', marginTop: '8px', background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '20px', padding: '4px 12px', width: 'fit-content' }}>
              <span className="pulsing-cache-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px #00d4ff' }} />
              <span>
                AI Diagnostics: {predictionsData.isCached ? 'Cached' : 'Live Check Done'} ({new Date(predictionsData.cachedAt * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})})
              </span>
              <style>{`
                .pulsing-cache-dot {
                  animation: cachePulse 2s infinite ease-in-out;
                }
                @keyframes cachePulse {
                  0% { opacity: 0.4; }
                  50% { opacity: 1; }
                  100% { opacity: 0.4; }
                }
              `}</style>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowModal(true)} style={btnPrimary}>+ Log Activity</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        {/* Sleep */}
        <div style={card}>
          <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Sleep Tracker 😴</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>Goal: 8 hours</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{ position: 'relative', width: '90px', height: '90px' }}>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(167,139,250,0.1)" strokeWidth="9" />
                <circle cx="45" cy="45" r="38" fill="none" stroke="#a78bfa" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray="239" strokeDashoffset={239 - (239 * sleepPct / 100)}
                  transform="rotate(-90 45 45)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#a78bfa' }}>{healthData.sleep}h</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '10px' }}>{Math.round(sleepPct)}% of goal achieved</div>
          <div style={{ height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${sleepPct}%`, height: '100%', background: 'linear-gradient(90deg,#a78bfa,#00d4ff)', borderRadius: '3px', transition: 'width 0.8s ease' }}></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>Sleep Quality</span>
            <span style={{ color: sleepPct >= 87 ? '#00e5a0' : sleepPct >= 75 ? '#ff8c42' : '#ff4d6d', fontWeight: '600' }}>
              {sleepPct >= 87 ? 'Good' : sleepPct >= 75 ? 'Fair' : 'Poor'}
            </span>
          </div>
        </div>

        {/* Food */}
        <div style={card}>
          <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Food Intake 🍽️</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px' }}>Daily nutrition</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#00e5a0' }}>{healthData.calories.toLocaleString()}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Burned</div>
            </div>
            <div style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#00d4ff' }}>2,200</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Goal</div>
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
              <span>Calories vs Goal</span><span>{Math.round(calPct)}%</span>
            </div>
            <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${calPct}%`, height: '100%', background: '#00e5a0', borderRadius: '3px', transition: 'width 0.8s ease' }}></div>
            </div>
          </div>
          <button onClick={() => setShowFoodModal(true)} style={{ ...btnPrimary, width: '100%', padding: '8px', marginTop: '8px', fontSize: '12px' }}>+ Log Calories</button>
        </div>

        {/* Activity */}
        <div style={card}>
          <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>Daily Activity 🏃</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>Steps & calories</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '90px', height: '90px' }}>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(0,229,160,0.1)" strokeWidth="9" />
                <circle cx="45" cy="45" r="38" fill="none" stroke="#00e5a0" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray="239" strokeDashoffset={239 - (239 * stepPct / 100)}
                  transform="rotate(-90 45 45)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#00e5a0' }}>{healthData.steps.toLocaleString()}</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>steps</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '8px 0 12px' }}>Goal: 10,000 · {Math.round(stepPct)}% achieved</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'rgba(0,212,255,0.07)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#00d4ff' }}>{Math.round(healthData.steps / 350)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Active min</div>
            </div>
            <div style={{ background: 'rgba(255,140,66,0.07)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#ff8c42' }}>{Math.round(healthData.steps * 0.05)}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Cal burned</div>
            </div>
          </div>
        </div>
      </div>

      {/* Hydration */}
      <div style={{ ...card, maxWidth: '520px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '3px' }}>Hydration 💧</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>{water} of 8 glasses today — click to update</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} onClick={() => { setLocalWater(i); logData({ water: i }); }}
              style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', cursor: 'pointer', transition: 'all 0.3s',
                background: i <= water ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                border: i <= water ? '2px solid #00d4ff' : '2px solid rgba(255,255,255,0.1)',
                transform: i === water ? 'scale(1.15)' : 'scale(1)' }}>
              💧
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: '800', color: '#00d4ff' }}>{(water * 0.25).toFixed(1)}L / 2.0L</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{Math.round(water / 8 * 100)}% of daily goal</div>
        </div>
      </div>
    </div>
  )
}

// ─── MEDICAL METRIC DETAIL MODAL ───
function MetricDetailModal({ metric, onClose }) {
  const details = {
    'Blood Sugar': {
      why: 'Your current blood sugar is influenced by your recent carbohydrate intake and activity level. Stress and sleep quality also play a role.',
      control: 'To maintain or lower blood sugar: \n1. Reduce refined carbs and sugary drinks.\n2. Increase daily fiber.\n3. Go for a 15-minute walk after meals.'
    },
    'Blood Pressure': {
      why: 'Blood pressure fluctuates based on sodium intake, hydration, stress, and physical activity. Consistent high readings indicate hypertension.',
      control: 'To control blood pressure: \n1. Drink 8+ glasses of water daily.\n2. Limit sodium (salt) intake.\n3. Do at least 30 minutes of aerobic exercise daily.'
    },
    'Cholesterol': {
      why: 'Cholesterol levels are heavily driven by saturated fats in your diet, genetics, and lack of exercise.',
      control: 'To improve cholesterol: \n1. Eat more omega-3 fatty acids (fish, nuts).\n2. Increase soluble fiber (oats, beans).\n3. Exercise regularly.'
    }
  }
  
  const content = details[metric.title]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflowY: 'auto' }}>
      <div style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '28px', width: '450px', margin: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '28px' }}>{metric.icon}</span>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'white', margin: 0 }}>{metric.title}</h2>
        </div>
        
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Current Reading</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: metric.stat.color }}>{metric.val} <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>{metric.unit}</span></div>
          <div style={{ fontSize: '13px', color: metric.stat.color, marginTop: '4px' }}>{metric.stat.text} (Normal: {metric.normal})</div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#00d4ff', marginBottom: '6px' }}>Why is it like this?</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }}>{content.why}</div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#00e5a0', marginBottom: '6px' }}>How to control it</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{content.control}</div>
        </div>

        <button onClick={onClose} style={{ ...btnPrimary, width: '100%', padding: '12px' }}>Close</button>
      </div>
    </div>
  )
}

// ─── MEDICAL ───
function Medical() {
  const { healthData, readings } = React.useContext(GlobalContext)
  const [showModal, setShowModal] = React.useState(false)
  const [selectedMetric, setSelectedMetric] = React.useState(null)

  const barData = {
    labels: readings.slice(0, 5).map(r => r.date).reverse(),
    datasets: [
      { label: 'Blood Sugar', data: readings.slice(0, 5).map(r => r.bs).reverse(), backgroundColor: 'rgba(0,212,255,0.6)', borderRadius: 4 },
      { label: 'Cholesterol/10', data: readings.slice(0, 5).map(r => Math.round(r.chol / 10)).reverse(), backgroundColor: 'rgba(0,229,160,0.6)', borderRadius: 4 },
    ]
  }
  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } }, tooltip: { backgroundColor: '#1a2640' } },
    scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)' } } }
  }

  return (
    <div style={{ color: 'white' }}>
      {showModal && <LogModal onClose={() => setShowModal(false)} />}
      {selectedMetric && <MetricDetailModal metric={selectedMetric} onClose={() => setSelectedMetric(null)} />}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800' }}>Medical Monitoring 🩺</h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Track and analyze your medical parameters</p>
        </div>
        <button onClick={() => setShowModal(true)} style={btnPrimary}>+ Add Reading</button>
      </div>

      {/* LIFESTYLE CORRELATIONS WIDGET */}
      <div style={{ ...card, marginBottom: '24px', background: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#00d4ff' }}>Lifestyle & Metabolic Correlation</div>
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>
          AI actively fetching your Dashboard & Lifestyle metrics to analyze their impact on your medical readings.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>Recent Nutrition Impact</div>
            <div style={{ fontSize: '14px', color: 'white', fontWeight: '600', marginBottom: '4px' }}>
              Carbs: <span style={{ color: '#ff8c42' }}>{healthData.carbs}g</span> | Protein: <span style={{ color: '#00e5a0' }}>{healthData.protein}g</span>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.4' }}>
              {healthData.carbs > 200 ? 'High carbohydrate intake is currently driving your blood sugar levels towards the upper limit.' : 'Your balanced macros are keeping your blood sugar stable.'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>Activity Impact</div>
            <div style={{ fontSize: '14px', color: 'white', fontWeight: '600', marginBottom: '4px' }}>
              Steps: <span style={{ color: '#00d4ff' }}>{healthData.steps.toLocaleString()}</span> | Water: <span style={{ color: '#00d4ff' }}>{healthData.water} glasses</span>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.4' }}>
              {healthData.steps >= 10000 ? 'Great activity! This is helping lower your systolic blood pressure.' : 'Increasing your daily steps to 10k can help lower your cardiovascular risk.'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { title: 'Blood Sugar',    icon: '🍬', val: healthData.bloodSugar,   unit: 'mg/dL', stat: getStatus('bs',    healthData.bloodSugar),    normal: '70–100 mg/dL' },
          { title: 'Blood Pressure', icon: '❤️', val: `${healthData.bloodPressureSys}/${healthData.bloodPressureDia}`, unit: 'mmHg', stat: getStatus('bpSys', healthData.bloodPressureSys), normal: '<120/80 mmHg' },
          { title: 'Cholesterol',    icon: '🩸', val: healthData.cholesterol,  unit: 'mg/dL', stat: getStatus('chol',  healthData.cholesterol),   normal: '<170 mg/dL' },
        ].map((m, i) => (
          <div key={i} style={{ ...card, cursor: 'pointer' }} onClick={() => setSelectedMetric(m)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>{m.title}</div>
              <span style={{ fontSize: '22px' }}>{m.icon}</span>
            </div>
            <div style={{ fontSize: '34px', fontWeight: '800', color: m.stat.color, margin: '8px 0 4px', transition: 'all 0.3s' }}>
              {m.val}<span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '4px', fontWeight: '400' }}>{m.unit}</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: m.stat.color, marginBottom: '8px' }}>{m.stat.text}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Normal: {m.normal}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '14px' }}>📊 Reading Trends (last 5 entries)</div>
        <div style={{ height: '150px' }}>
          <Bar data={barData} options={barOpts} />
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>* Cholesterol divided by 10 for scale</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px' }}>📋 Reading History</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Date', 'Blood Sugar', 'Blood Pressure', 'Cholesterol', 'Notes'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readings.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(0,212,255,0.03)' : 'transparent' }}>
                <td style={{ padding: '11px 12px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
                  {r.date}{i === 0 && <span style={{ marginLeft: '6px', background: '#00d4ff', color: '#000', fontSize: '8px', fontWeight: '700', padding: '2px 5px', borderRadius: '4px' }}>LATEST</span>}
                </td>
                <td style={{ padding: '11px 12px', color: getStatus('bs', r.bs).color, fontWeight: '600' }}>{r.bs} mg/dL</td>
                <td style={{ padding: '11px 12px', color: getStatus('bpSys', Number(r.bp.split('/')[0])).color, fontWeight: '600' }}>{r.bp}</td>
                <td style={{ padding: '11px 12px', color: getStatus('chol', r.chol).color, fontWeight: '600' }}>{r.chol} mg/dL</td>
                <td style={{ padding: '11px 12px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PREDICTIONS ───
function Predictions() {
  const { predictionsData, predictionsLoading, predictionsError, fetchPredictionsGlobal, healthData } = React.useContext(GlobalContext)
  const navigate = useNavigate()

  if (predictionsLoading && !predictionsData) {
    return (
      <div style={{ color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ fontSize: '40px', animation: 'spin 2s linear infinite', marginBottom: '20px' }}>🧠</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#00d4ff' }}>Consulting Sanjeevni Smart AI...</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Analyzing metrics, history trends, and medical correlations</div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Fallback to local predictions if fetch failed or returned empty
  const cvRisk   = predictionsData?.cvRisk ?? Math.min(Math.round((healthData.bloodPressureSys - 100) / 40 * 100 + (healthData.cholesterol - 150) / 50 * 20), 95)
  const diabRisk = predictionsData?.diabRisk ?? Math.min(Math.round((healthData.bloodSugar - 80) / 40 * 100 * 0.7 + (healthData.steps < 5000 ? 20 : 0)), 90)
  const overallRisk = predictionsData?.overallRisk ?? Math.round((cvRisk + diabRisk) / 4)
  const recommendations = predictionsData?.recommendations ?? [
    cvRisk >= 50   && { icon: '❤️', title: 'Consult a Cardiologist Soon',  desc: `Your BP (${healthData.bloodPressureSys}/${healthData.bloodPressureDia}) and cholesterol (${healthData.cholesterol} mg/dL) are elevated. CV risk: ${cvRisk}%. See a doctor within 2 weeks.`, meta: `AI Prediction · Confidence: ${Math.min(cvRisk + 13, 95)}%`, btn: 'Find Doctor', btnPath: '/doctors' },
    diabRisk >= 40 && { icon: '🍬', title: 'Pre-Diabetes Warning',          desc: `Blood sugar of ${healthData.bloodSugar} mg/dL with low activity shows ${diabRisk}% diabetes risk. Reducing refined carbs could lower risk by 30%.`, meta: `AI Prediction · Confidence: ${Math.min(diabRisk + 20, 92)}%`, btn: null },
    healthData.steps < 7000 && { icon: '🏃', title: 'Increase Daily Activity', desc: `Your ${healthData.steps.toLocaleString()} daily steps is below 10,000. Adding 20 min cardio 4x/week could reduce CV risk by 15 points.`, meta: 'Lifestyle · Confidence: 93%', btn: null },
    healthData.water < 6   && { icon: '💧', title: 'Increase Water Intake',   desc: `You're at ${healthData.water}/8 glasses. Proper hydration helps blood pressure and kidney function.`, meta: 'Lifestyle · Confidence: 96%', btn: null },
    { icon: '✅', title: 'Keep Monitoring Regularly', desc: 'Consistent health monitoring is key to early detection. Log your readings daily for the most accurate AI predictions.', meta: 'General Health · Confidence: 99%', btn: null },
  ].filter(Boolean)

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
            AI Health Predictions <span style={{ WebkitTextFillColor: 'initial', filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))' }}>🧠</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Live risk scores powered by Sanjeevni AI Medical Engine</p>
          {predictionsData?.cachedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(0, 212, 255, 0.8)', marginTop: '8px', background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '20px', padding: '4px 12px', width: 'fit-content' }}>
              <span className="pulsing-cache-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px #00d4ff' }} />
              <span>
                AI Diagnostics: {predictionsData.isCached ? 'Cached' : 'Live Check Done'} ({new Date(predictionsData.cachedAt * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})})
              </span>
              <style>{`
                .pulsing-cache-dot {
                  animation: cachePulse 2s infinite ease-in-out;
                }
                @keyframes cachePulse {
                  0% { opacity: 0.4; }
                  50% { opacity: 1; }
                  100% { opacity: 0.4; }
                }
              `}</style>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/dashboard')} style={btnOutline}>📋 Log Metrics</button>
        </div>
      </div>

      <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '14px', fontFamily: "'Outfit', sans-serif" }}>Live Risk Assessment</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { title: 'Overall Health Risk',  pct: overallRisk },
          { title: 'Diabetes Risk (5yr)',  pct: diabRisk },
          { title: 'Cardiovascular Risk',  pct: cvRisk },
        ].map((r, i) => {
          const color = r.pct < 30 ? '#00e5a0' : r.pct < 60 ? '#ff8c42' : '#ff4d6d'
          const label = r.pct < 30 ? 'LOW RISK' : r.pct < 60 ? 'MEDIUM RISK' : 'HIGH RISK'
          const bg    = r.pct < 30 ? 'rgba(0,229,160,0.03)' : r.pct < 60 ? 'rgba(255,140,66,0.03)' : 'rgba(255,77,109,0.03)'
          const border= r.pct < 30 ? 'rgba(0,229,160,0.15)'  : r.pct < 60 ? 'rgba(255,140,66,0.2)' : 'rgba(255,77,109,0.2)'
          return (
            <div key={i} className="chart-card" style={{ borderRadius: '20px', padding: '24px', background: bg, border: `1px solid ${border}`, backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', transition: 'all 0.3s' }}>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: '500' }}>{r.title}</div>
              <div style={{ fontSize: '48px', fontWeight: '900', color, marginBottom: '4px', transition: 'all 0.5s', fontFamily: "'Outfit', sans-serif", letterSpacing: '-1.5px' }}>{r.pct}%</div>
              <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '2px', color, marginBottom: '12px' }}>{label}</div>
              <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${r.pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.8s ease' }}></div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '14px', fontFamily: "'Outfit', sans-serif" }}>AI Recommendations</div>
      {recommendations.map((r, i) => (
        <div key={i} className="chart-card" style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px' }}>
          <div className="icon-container-wrapper" style={{ fontSize: '18px', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14.5px', fontWeight: '700', marginBottom: '5px', color: 'white' }}>{r.title}</div>
            <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', marginBottom: '6px' }}>{r.desc}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{r.meta}</div>
          </div>
          {r.btn && <button onClick={() => navigate(r.btnPath)} style={{ ...btnPrimary, padding: '8px 18px', fontSize: '12px', flexShrink: 0 }}>{r.btn}</button>}
        </div>
      ))}
    </div>
  )
}


// ─── DOCTORS ───
function Doctors() {
  const { bookAppointment, triggerToast } = React.useContext(GlobalContext)
  const [filter, setFilter]   = React.useState('All Doctors')
  const [search, setSearch]   = React.useState('')
  const [showScheduler, setShowScheduler] = React.useState(null) // holds doc object

  const [selectedDate, setSelectedDate] = React.useState(null)
  const [selectedTime, setSelectedTime] = React.useState('')
  const [consultMode, setConsultMode]   = React.useState('Offline')
  const [isUrgent, setIsUrgent]         = React.useState(false)

  const next7Days = React.useMemo(() => {
    const days = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      days.push({
        name: dayNames[d.getDay()],
        dateNum: d.getDate(),
        month: monthNames[d.getMonth()],
        fullString: `${monthNames[d.getMonth()]} ${d.getDate()}`
      })
    }
    return days
  }, [])

  // Reset/Preset scheduler details when opened
  React.useEffect(() => {
    if (showScheduler) {
      setSelectedDate(next7Days[0])
      setSelectedTime('')
      setConsultMode('Offline')
      setIsUrgent(false)
    }
  }, [showScheduler, next7Days])

  // Handle urgency updates
  React.useEffect(() => {
    if (isUrgent) {
      setConsultMode('Online')
      setSelectedTime('⚡ Instant Video Call (10 min wait)')
    } else {
      setSelectedTime('')
    }
  }, [isUrgent])

  const handleBookClick = (doc) => {
    setShowScheduler(doc)
  }

  const handleConfirmBooking = () => {
    if (!showScheduler) return
    if (!isUrgent && (!selectedDate || !selectedTime)) return

    const timeStr = isUrgent ? selectedTime : `${selectedDate.fullString} at ${selectedTime}`
    bookAppointment(showScheduler.name, showScheduler.spec, showScheduler.hospital, timeStr, consultMode, isUrgent)
    
    // Trigger global Toast notification popup for 4-5 seconds
    const title = isUrgent ? 'Urgent Request Registered!' : 'Appointment Confirmed!'
    const message = `${showScheduler.name} (${showScheduler.spec}) — ${timeStr} · Mode: ${consultMode}`
    triggerToast(title, message, isUrgent ? 'warning' : 'success')
    
    setShowScheduler(null)
  }

  const doctors = [
    { name: 'Dr. Johny Paji',    spec: 'Cardiologist',                  hospital: 'AIIMS Delhi',   dist: 2.3, wait: '15 min', exp: '18 yrs', rating: 4.9, reviews: 312, avail: 'AVAILABLE NOW',   availColor: '#00e5a0', availBg: 'rgba(0,229,160,0.1)',  type: 'Cardiologist' },
    { name: 'Dr. Sameer Singh',  spec: 'Diabetologist & Endocrinologist', hospital: 'Fortis',       dist: 3.1, wait: '30 min', exp: '12 yrs', rating: 4.8, reviews: 218, avail: 'AVAILABLE NOW',   availColor: '#00e5a0', availBg: 'rgba(0,229,160,0.1)',  type: 'Diabetologist' },
    { name: 'Dr. Aditya Popli',   spec: 'General Physician',             hospital: 'PGIMER',         dist: 1.8, wait: '45 min', exp: '22 yrs', rating: 4.7, reviews: 405, avail: 'NEXT IN 45 MIN', availColor: '#ff8c42', availBg: 'rgba(255,140,66,0.1)', type: 'General Physician' },
    { name: 'Dr. Sneha Mehta',  spec: 'Cardiologist',                  hospital: 'Fortis Hospital', dist: 5.6, wait: '20 min', exp: '15 yrs', rating: 4.9, reviews: 289, avail: 'AVAILABLE NOW',   availColor: '#00e5a0', availBg: 'rgba(0,229,160,0.1)',  type: 'Cardiologist' },
  ]

  const filtered = doctors
    .filter(d => {
      const matchFilter = filter === 'All Doctors' || (filter === '✅ Available Now' && d.avail === 'AVAILABLE NOW') || filter.includes(d.type)
      const matchSearch = search === '' || d.name.toLowerCase().includes(search.toLowerCase()) || d.spec.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
    .sort((a, b) => filter === '⭐ Top Rated' ? b.rating - a.rating : a.dist - b.dist)

  const normalTimeSlots = ["09:30 AM", "10:30 AM", "11:30 AM", "02:00 PM", "03:30 PM", "04:30 PM"]
  const urgentTimeSlots = [
    "⚡ Instant Video Call (10 min wait)",
    "⚡ Urgent Consultation (20 min wait)",
    "⚡ Live Queue Entry (30 min wait)"
  ]

  return (
    <div style={{ color: 'white' }}>
      {/* SCHEDULER MODAL */}
      {showScheduler && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,10,25,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="chart-card" style={{ background: 'radial-gradient(circle at top left, #152238 0%, #0d1527 100%)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '24px', padding: '28px', width: '480px', maxWidth: '90%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '18px', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'white' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '19px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>📅 Schedule Appointment</span>
              <button onClick={() => setShowScheduler(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '24px', cursor: 'pointer', padding: '0 4px', outline: 'none' }}>&times;</button>
            </div>

            {/* Doctor Brief Info */}
            <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👨‍⚕️</div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700' }}>{showScheduler.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(0,212,255,0.8)', marginTop: '2px' }}>{showScheduler.spec} · {showScheduler.hospital}</div>
              </div>
            </div>

            {/* Urgent Switch Option */}
            <div style={{ background: isUrgent ? 'rgba(255,77,109,0.08)' : 'rgba(255,255,255,0.01)', border: isUrgent ? '1px solid rgba(255,77,109,0.25)' : '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', color: isUrgent ? '#ff4d6d' : 'white' }}>
                  🚨 This is an Urgent Request
                </span>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                  <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span className="slider round" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: isUrgent ? '#ff4d6d' : 'rgba(255,255,255,0.15)', borderRadius: '34px', transition: '.4s', boxShadow: isUrgent ? '0 0 10px rgba(255,77,109,0.4)' : 'none' }}>
                    <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: isUrgent ? '22px' : '4px', bottom: '4px', background: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                  </span>
                </label>
              </div>
              <div style={{ fontSize: '11px', color: isUrgent ? 'rgba(255,77,109,0.7)' : 'rgba(255,255,255,0.4)' }}>
                {isUrgent ? '⚠️ Urgent consultations trigger live online video channels with minimal wait times.' : 'Toggle this to route to immediate emergency video queue.'}
              </div>
            </div>

            {/* Offline vs Online Mode selector */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>Consultation Mode</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div onClick={() => !isUrgent && setConsultMode('Offline')}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid', textAlign: 'center', cursor: isUrgent ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                    borderColor: consultMode === 'Offline' ? '#00d4ff' : 'rgba(255,255,255,0.06)',
                    background: consultMode === 'Offline' ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.01)',
                    opacity: isUrgent ? 0.35 : 1
                  }}>
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>🏥</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: consultMode === 'Offline' ? '#00d4ff' : 'white' }}>Offline Mode</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Visit Clinic</div>
                </div>

                <div onClick={() => setConsultMode('Online')}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                    borderColor: consultMode === 'Online' ? '#00d4ff' : 'rgba(255,255,255,0.06)',
                    background: consultMode === 'Online' ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.01)'
                  }}>
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>💻</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: consultMode === 'Online' ? '#00d4ff' : 'white' }}>Online Mode</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Video Consultation</div>
                </div>
              </div>
            </div>

            {/* Date Calendar Selector */}
            {!isUrgent && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>Select Date</div>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px', scrollbarWidth: 'thin' }}>
                  {next7Days.map((day, idx) => {
                    const isSel = selectedDate?.fullString === day.fullString
                    return (
                      <div key={idx} onClick={() => setSelectedDate(day)}
                        style={{
                          width: '54px', height: '68px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, border: '1px solid', transition: 'all 0.2s',
                          borderColor: isSel ? '#00d4ff' : 'rgba(255,255,255,0.08)',
                          background: isSel ? 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,153,255,0.05) 100%)' : 'rgba(255,255,255,0.02)'
                        }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: isSel ? '#00d4ff' : 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{day.name}</div>
                        <div style={{ fontSize: '15px', fontWeight: '800', marginTop: '2px', color: isSel ? '#00d4ff' : 'white' }}>{day.dateNum}</div>
                        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{day.month}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Specific Time Slots Grid */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                {isUrgent ? 'Available Urgent Timeframes' : 'Select Time Slot'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isUrgent ? '1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                {(isUrgent ? urgentTimeSlots : normalTimeSlots).map((slot, idx) => {
                  const isSel = selectedTime === slot
                  return (
                    <button key={idx} onClick={() => setSelectedTime(slot)}
                      style={{
                        padding: '10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', border: '1px solid', cursor: 'pointer', outline: 'none', transition: 'all 0.2s', fontFamily: "'Plus Jakarta Sans', sans-serif",
                        borderColor: isSel ? (isUrgent ? '#ff4d6d' : '#00d4ff') : 'rgba(255,255,255,0.08)',
                        background: isSel ? (isUrgent ? 'rgba(255,77,109,0.15)' : 'rgba(0,212,255,0.15)') : 'rgba(255,255,255,0.02)',
                        color: isSel ? (isUrgent ? '#ff4d6d' : '#00d4ff') : 'rgba(255,255,255,0.7)',
                        boxShadow: isSel ? (isUrgent ? '0 0 10px rgba(255,77,109,0.2)' : '0 0 10px rgba(0,212,255,0.15)') : 'none'
                      }}>
                      {slot}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Modal Footer Confirm buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button onClick={() => setShowScheduler(null)} style={{ ...btnOutline, flex: 1, padding: '11px 0', borderRadius: '12px' }}>Cancel</button>
              <button onClick={handleConfirmBooking} disabled={!selectedTime || (!isUrgent && !selectedDate)}
                style={{
                  ...btnPrimary,
                  flex: 1,
                  padding: '11px 0',
                  borderRadius: '12px',
                  opacity: (!selectedTime || (!isUrgent && !selectedDate)) ? 0.5 : 1,
                  cursor: (!selectedTime || (!isUrgent && !selectedDate)) ? 'not-allowed' : 'pointer',
                  background: isUrgent ? 'linear-gradient(135deg,#ff4d6d,#ff1a43)' : 'linear-gradient(135deg,#00d4ff,#0099ff)',
                  color: isUrgent ? '#ffffff' : '#000000'
                }}>
                {isUrgent ? '⚡ Book Urgent Online' : 'Confirm Appointment'}
              </button>
            </div>

          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Find Nearby Doctors <span style={{ WebkitTextFillColor: 'initial', filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))' }}>👨‍⚕️</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Connect with specialists near you · Mohali, Punjab</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btnOutline}>📍 Update Location</button>
          <button onClick={() => filtered[0] && handleBookClick(filtered[0])} style={btnPrimary}>📅 Book Appointment</button>
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name or specialty..."
          style={{ ...input, width: '360px', display: 'inline-block', fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {['All Doctors', '❤️ Cardiologist', '🍬 Diabetologist', '🩺 General Physician', '✅ Available Now', '⭐ Top Rated'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '7px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid', fontFamily: "'Plus Jakarta Sans', sans-serif",
              borderColor: filter === f ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)',
              background: filter === f ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: filter === f ? '#00d4ff' : 'rgba(255,255,255,0.5)' }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px' }}>
        <div>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>No doctors found</div>}
          {filtered.map((d, i) => (
            <div key={i} className="chart-card" style={{ ...card, marginBottom: '12px', border: `1px solid ${i === 0 ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '12px' }}>
                <div className="icon-container-wrapper" style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg,#1a2640,#243050)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>👨‍⚕️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '17px', fontWeight: '700', fontFamily: "'Outfit', sans-serif" }}>{d.name}</div>
                  <div style={{ fontSize: '12px', color: '#00d4ff', marginTop: '2px' }}>{d.spec} · {d.hospital}</div>
                </div>
                <span className="status-pill" style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '800', background: `${d.availColor}15`, color: d.availColor, border: `1px solid ${d.availColor}25`, whiteSpace: 'nowrap' }}>{d.avail}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>
                <span>📍 {d.dist} km away</span><span>⏱ {d.wait} wait</span><span>💼 {d.exp} exp</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
                <span style={{ color: '#fbbf24' }}>{'★'.repeat(Math.round(d.rating))}</span>
                <span>{d.rating}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>({d.reviews} reviews)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleBookClick(d)} style={{ ...btn, background: 'linear-gradient(135deg,#00d4ff,#0099ff)', color: '#000', padding: '8px 16px', fontSize: '12px', fontWeight: '700', borderRadius: '10px' }}>📅 Book Now</button>
                <button style={{ ...btn, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', padding: '8px 16px', fontSize: '12px', fontWeight: '600', borderRadius: '10px' }}>📞 Call Clinic</button>
                <button style={{ ...btn, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', padding: '8px 16px', fontSize: '12px', fontWeight: '600', borderRadius: '10px' }}>👤 Profile</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...card, overflow: 'hidden', padding: 0, height: 'fit-content' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '13px', fontWeight: '600' }}>📍 Mohali, Punjab</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Showing {filtered.length} of {doctors.length} doctors</div>
          </div>
          <div style={{ height: '300px', background: 'radial-gradient(ellipse at center,#0d1a2e 0%,#070d18 100%)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,212,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.04) 1px,transparent 1px)', backgroundSize: '40px 40px' }}></div>
            {[
              { label: 'You',           emoji: '😊', color: '#00d4ff', top: '55%', left: '50%' },
              { label: 'Johny·2.3km',   emoji: '👨‍⚕️', color: '#00e5a0', top: '28%', left: '33%' },
              { label: 'Sameer·3.1km',  emoji: '👩‍⚕️', color: '#a78bfa', top: '36%', left: '66%' },
              { label: 'Aditya·1.8km',  emoji: '👨‍⚕️', color: '#ff8c42', top: '70%', left: '38%' },
              { label: 'Sneha·5.6km',   emoji: '👩‍⚕️', color: '#ff4d6d', top: '65%', left: '73%' },
            ].map((p, i) => (
              <div key={i} style={{ position: 'absolute', top: p.top, left: p.left, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${p.color}30`, border: `2px solid ${p.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', boxShadow: `0 0 10px ${p.color}50` }}>{p.emoji}</div>
                <div style={{ fontSize: '8px', fontWeight: '600', color: p.color, whiteSpace: 'nowrap', background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: '4px' }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CHATBOT ───
function Chatbot() {
  const { currentUser, healthData, appointments, surveyData } = React.useContext(GlobalContext)
  const [messages, setMessages] = React.useState([
    { role: 'bot', text: `👋 Hello! I've analyzed your health data. Your BP is ${healthData.bloodPressureSys}/${healthData.bloodPressureDia} mmHg and blood sugar is ${healthData.bloodSugar} mg/dL. How can I help you today?` },
  ])
  const [inputVal, setInputVal] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const bottomRef = React.useRef(null)
  React.useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages])

  const getReply = (msg) => {
    const m = msg.toLowerCase()
    if (m.includes('blood sugar') || m.includes('glucose'))
      return `Your current blood sugar is ${healthData.bloodSugar} mg/dL. ${getStatus('bs', healthData.bloodSugar).text}. Normal range is 70–100 mg/dL fasting. ${healthData.bloodSugar > 100 ? 'Consider reducing sugar intake and increasing exercise.' : 'Keep up the good work!'}`
    if (m.includes('blood pressure') || m.includes('bp'))
      return `Your BP is ${healthData.bloodPressureSys}/${healthData.bloodPressureDia} mmHg. ${getStatus('bpSys', healthData.bloodPressureSys).text}. ${healthData.bloodPressureSys >= 130 ? 'Reduce sodium, exercise regularly, and consult a doctor.' : 'Maintain your current healthy habits!'}`
    if (m.includes('cholesterol'))
      return `Your cholesterol is ${healthData.cholesterol} mg/dL. ${getStatus('chol', healthData.cholesterol).text}. ${healthData.cholesterol >= 170 ? 'Reduce saturated fats, increase fiber, and exercise.' : 'Great cholesterol levels!'}`
    if (m.includes('step') || m.includes('walk'))
      return `You've done ${healthData.steps.toLocaleString()} steps today — ${Math.round(healthData.steps / 10000 * 100)}% of your 10,000 goal. ${healthData.steps < 7000 ? 'Try to add a 20-minute walk!' : 'Great job! Keep it up!'}`
    if (m.includes('sleep'))
      return `You slept ${healthData.sleep} hours. ${healthData.sleep >= 7 ? 'Good sleep! Aim for 7-9 hours consistently.' : 'You need more sleep. Try going to bed 30 minutes earlier.'}`
    if (m.includes('water') || m.includes('hydrat'))
      return `You've had ${healthData.water} glasses today. ${healthData.water >= 8 ? 'Great hydration!' : 'Try to reach 8 glasses (2L) daily.'}`
    if (m.includes('score') || m.includes('summar') || m.includes('status')) {
      const score = getHealthScore(healthData)
      return `📊 Health Summary:\n• Score: ${score}/100\n• Blood Sugar: ${healthData.bloodSugar} mg/dL — ${getStatus('bs', healthData.bloodSugar).text}\n• BP: ${healthData.bloodPressureSys}/${healthData.bloodPressureDia} — ${getStatus('bpSys', healthData.bloodPressureSys).text}\n• Cholesterol: ${healthData.cholesterol} — ${getStatus('chol', healthData.cholesterol).text}\n• Steps: ${healthData.steps.toLocaleString()}/10,000\n• Sleep: ${healthData.sleep}h\n• Water: ${healthData.water}/8 glasses`
    }
    if (m.includes('food') || m.includes('eat') || m.includes('diet') || m.includes('avoid'))
      return `Based on your data:\n${healthData.bloodSugar > 100 ? '🍬 Reduce refined carbs & sugary drinks\n' : ''}${healthData.bloodPressureSys >= 130 ? '🧂 Limit sodium to under 2,300mg/day\n' : ''}${healthData.cholesterol >= 170 ? '🥩 Reduce saturated & trans fats\n' : ''}✅ Eat more: leafy greens, whole grains, omega-3 fish`
    if (m.includes('doctor') || m.includes('appointment'))
      return `Based on your health score of ${getHealthScore(healthData)}/100:\n${healthData.bloodPressureSys >= 130 || healthData.cholesterol >= 170 ? '⚠️ I recommend seeing a cardiologist soon.\n' : ''}Dr. Johny Paji (Cardiologist) is available nearby — 2.3km away, 15 min wait.`
    return `Based on your data (BS: ${healthData.bloodSugar}, BP: ${healthData.bloodPressureSys}/${healthData.bloodPressureDia}, Score: ${getHealthScore(healthData)}), I recommend maintaining regular monitoring. What specific aspect of your health would you like to know?`
  }

  const sendMessage = (text) => {
    const msg = text || inputVal.trim()
    if (!msg) return
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setInputVal('')
    setLoading(true)

    const email = currentUser?.email || 'default@sanjeevni.app'
    fetch('http://localhost:8000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, userEmail: email, history: messages, appointments, surveyData })
    })
    .then(r => {
      if (!r.ok) throw new Error('Network error')
      return r.json()
    })
    .then(res => {
      setMessages(prev => [...prev, { role: 'bot', text: res.reply }])
      setLoading(false)
    })
    .catch(err => {
      console.error("Failed to fetch Gemini chat reply:", err)
      setMessages(prev => [...prev, { role: 'bot', text: getReply(msg) }])
      setLoading(false)
    })
  }


  return (
    <div style={{ color: 'white' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
          AI Health Assistant <span style={{ WebkitTextFillColor: 'initial', filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))' }}>💬</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Powered by your real health data — ask me anything!</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
        <div className="chart-card" style={{ ...card, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: '400px', padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,#00d4ff,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>🤖</div>
            <div>
              <div style={{ fontSize: '14.5px', fontWeight: '700', fontFamily: "'Outfit', sans-serif" }}>HealthAI Bot</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#00e5a0', marginRight: '4px' }}></span>
                Online · Using your live health data
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px', fontFamily: 'monospace', textAlign: m.role === 'user' ? 'right' : 'left' }}>{m.role === 'bot' ? 'HEALTHAI BOT' : 'YOU'}</div>
                  <div style={{ padding: '11px 15px', borderRadius: '14px', fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-line',
                    background: m.role === 'bot' ? '#1a2640' : 'rgba(0,212,255,0.15)',
                    border: m.role === 'bot' ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,212,255,0.25)',
                    borderBottomLeftRadius: m.role === 'bot' ? '4px' : '14px',
                    borderBottomRightRadius: m.role === 'user' ? '4px' : '14px' }}>
                    {m.text}
                  </div>
                </div>
              </div>
            ))}
            {loading && <div style={{ display: 'flex' }}><div style={{ background: '#1a2640', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '11px 15px' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '20px', letterSpacing: '4px' }}>···</span></div></div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '10px' }}>
            <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about your health data..." style={{ ...input, flex: 1, fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)', outline: 'none' }} />
            <button onClick={() => sendMessage()} style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg,#00d4ff,#0099ff)', border: 'none', cursor: 'pointer', fontSize: '16px' }}>➤</button>
          </div>
        </div>

        <div>
          <div className="chart-card" style={{ ...card, marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', fontFamily: "'Outfit', sans-serif" }}>Quick Questions 🚀</div>
            {[
              { icon: '🍬', text: 'What is my blood sugar status?' },
              { icon: '❤️', text: 'Explain my blood pressure' },
              { icon: '🥗', text: 'What foods should I avoid?' },
              { icon: '🏃', text: 'How much exercise do I need?' },
              { icon: '💧', text: 'How is my hydration?' },
              { icon: '📋', text: 'Summarize my health status' },
              { icon: '👨‍⚕️', text: 'Should I see a doctor?' },
            ].map((q, i) => (
              <button key={i} onClick={() => sendMessage(q.text)}
                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)', color: 'rgba(255,255,255,0.6)', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '12px', cursor: 'pointer', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                <span>{q.icon}</span><span>{q.text}</span>
              </button>
            ))}
          </div>
          <div className="chart-card" style={{ ...card, fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.6' }}>
            <div style={{ fontWeight: '700', color: '#00d4ff', marginBottom: '4px', fontFamily: "'Outfit', sans-serif" }}>🔒 Privacy Note</div>
            Responses use your logged health data. AI suggestions are not a replacement for professional medical advice.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ALERTS ───
function Alerts() {
  const { alerts, unreadCount, readIds, markAlertAsRead, markAllAlertsRead } = React.useContext(GlobalContext)

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", background: 'linear-gradient(90deg, #ffffff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Health Alerts <span style={{ WebkitTextFillColor: 'initial', filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.4))' }}>🔔</span>
            {unreadCount > 0 && <span className="status-pill" style={{ marginLeft: '10px', background: '#ff4d6d15', color: '#ff4d6d', border: '1px solid #ff4d6d25', fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', verticalAlign: 'middle', WebkitTextFillColor: '#ff4d6d' }}>{unreadCount} new</span>}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '4px' }}>Alerts update automatically based on your health data</p>
        </div>
        <button onClick={() => markAllAlertsRead(alerts.map(a => a.id))} style={btnOutline}>✓ Mark All Read</button>
      </div>

      {unreadCount > 0 && (
        <div style={{ background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.15)', borderRadius: '14px', padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(10px)' }}>
          <span style={{ fontSize: '16px' }}>🚨</span>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>You have <strong style={{ color: '#ff4d6d' }}>{unreadCount} unread alerts</strong> that require your attention.</span>
        </div>
      )}

      {alerts.map((a) => {
        const isUnread = a.isNew && !readIds.has(a.id)
        return (
          <div key={a.id} onClick={() => markAlertAsRead(a.id)} className="chart-card"
            style={{ background: a.color, border: `1px solid ${a.border}`, borderLeft: isUnread ? '3px solid #ff4d6d' : '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '10px', cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(10px)' }}>
            <div className="icon-container-wrapper" style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' }}>{a.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '15.5px', fontWeight: '700', fontFamily: "'Outfit', sans-serif" }}>{a.title}</div>
                {isUnread && <span className="status-pill" style={{ background: '#ff4d6d15', color: '#ff4d6d', border: '1px solid #ff4d6d25', fontSize: '9px', fontWeight: '800', padding: '2px 8px', borderRadius: '20px' }}>NEW</span>}
              </div>
              <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.6', marginBottom: '6px' }}>{a.desc}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>⏱ {a.time}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── LOGIN SCREEN ───
function LoginScreen() {
  const { login } = React.useContext(GlobalContext)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPw, setShowPw] = React.useState(false)
  const [isSignUp, setIsSignUp] = React.useState(false)

  const handleSubmit = () => {
    if (!email || !password) return alert('Please enter email and password')
    login('email', email, password)
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', width: '100vw',
      background: 'radial-gradient(circle at 50% 50%, #031430 0%, #010612 100%)',
      alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden'
    }}>
      {/* Background Grid Lines */}
      <div className="login-bg-grid" />

      {/* Full-width glowing ECG background trace line */}
      <svg style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', height: '200px', opacity: 0.18, pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 1200 100" preserveAspectRatio="none">
        <path d="M0 50 H300 L320 20 L345 80 L365 5 L385 95 L405 50 H650 L670 15 L690 85 L710 35 L730 65 L755 50 H1200" 
          stroke="#00d4ff" strokeWidth="2.5" fill="none" filter="drop-shadow(0 0 8px rgba(0, 212, 255, 0.6))"
          strokeDasharray="1500" strokeDashoffset="1500"
          style={{ animation: 'ecgDash 4s linear infinite' }} />
      </svg>

      {/* Floating Hexagons */}
      {/* Heart hex (top-left) */}
      <div className="floating-hex float-1" style={{ left: '12%', top: '25%' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
      </div>
      
      {/* Stethoscope hex (middle-right) */}
      <div className="floating-hex float-2" style={{ right: '12%', top: '32%' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.25-2.5 3-2.5 5h6c0-2-1-3.75-2.5-5z" /><path d="M12 2v10a4 4 0 0 0 8 0V2" /><circle cx="16" cy="18" r="2" /></svg>
      </div>

      {/* Plus/Shield hex (bottom-left) */}
      <div className="floating-hex float-3" style={{ left: '15%', top: '65%' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v8M8 12h8" /></svg>
      </div>

      {/* Pill/Capsule hex (bottom-right) */}
      <div className="floating-hex float-4" style={{ right: '14%', top: '68%' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)" /><line x1="8.5" y1="15.5" x2="15.5" y2="8.5" /></svg>
      </div>

      {/* Scattered background glowing stars/plus crosses */}
      <div style={{ position: 'absolute', top: '15%', right: '22%', color: 'rgba(0, 240, 255, 0.4)', fontSize: '20px', zIndex: 0 }}>+</div>
      <div style={{ position: 'absolute', bottom: '25%', left: '26%', color: 'rgba(0, 240, 255, 0.3)', fontSize: '18px', zIndex: 0 }}>+</div>
      <div style={{ position: 'absolute', top: '40%', left: '8%', color: 'rgba(0, 240, 255, 0.25)', fontSize: '24px', zIndex: 0 }}>+</div>

      {/* Central Login Card */}
      <div className="login-card-wrapper" style={{
        background: 'rgba(4, 12, 32, 0.45)', border: '2px solid rgba(0, 212, 255, 0.35)',
        borderRadius: '36px', padding: '48px 40px 40px', width: '100%', maxWidth: '440px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        backdropFilter: 'blur(25px)', boxShadow: '0 0 40px rgba(0, 212, 255, 0.15), inset 0 0 20px rgba(0, 212, 255, 0.05)',
        zIndex: 2, position: 'relative'
      }}>
        {/* Glow behind logo */}
        <div style={{ position: 'absolute', top: '24px', width: '90px', height: '90px', background: 'rgba(0, 240, 255, 0.15)', filter: 'blur(20px)', borderRadius: '50%', zIndex: -1 }} />
        
        {/* Logo matching the mockup */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, #020d20 0%, #06183a 100%)',
          border: '2px solid #00f0ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20, boxShadow: '0 0 22px rgba(0,240,255,0.3)'
        }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGreenGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="100%" stopColor="#00ffaa" />
              </linearGradient>
            </defs>
            <path d="M6 22H13.5L16.5 13L20.5 30L24 18L26.5 24H28" 
              stroke="url(#logoGreenGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M28 24C31 20 34.5 15 34.5 9.5C29 9.5 24 13 20 16" 
              stroke="url(#logoGreenGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 17.5L28.5 24" 
              stroke="url(#logoGreenGrad)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Brand Title with horizontal pulse waves */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, width: '100%', marginBottom: 6 }}>
          <svg width="40" height="20" viewBox="0 0 40 20" fill="none" opacity="0.65">
            <path d="M0 10 H15 L18 4 L22 16 L25 8 L27 12 L29 10 H40" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: '2px', color: '#fff', margin: 0 }}>
            SAN<span style={{ color: '#00f0ff' }}>JEEVNI</span>
          </h1>

          <svg width="40" height="20" viewBox="0 0 40 20" fill="none" opacity="0.65">
            <path d="M0 10 H11 L13 8 L15 12 L18 4 L22 16 L25 10 H40" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p style={{ fontSize: 13.5, color: '#7ab3cc', marginBottom: 28, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Your Smart AI Health Platform</p>

        {/* Continue with Google */}
        <button onClick={() => login('google')} style={{
          width: '100%', padding: '13px', borderRadius: '12px',
          background: 'rgba(5, 15, 35, 0.65)', border: '1px solid rgba(0, 212, 255, 0.25)',
          color: '#e8f4ff', fontSize: '14.5px', fontWeight: '600', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.25s'
        }}>
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 18 }} />
          Continue with Google
        </button>

        {/* OR separator */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10, margin: '22px 0', color: '#3a5a72', fontSize: '12px', fontWeight: 600, letterSpacing: '1px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          OR
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Email */}
        <div style={{ width: '100%', position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </span>
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,15,35,0.45)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 12, padding: '14px 14px 14px 44px', color: '#c8e8f8', fontSize: 14.5, outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.25s' }} />
        </div>

        {/* Password */}
        <div style={{ width: '100%', position: 'relative', marginBottom: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,15,35,0.45)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 12, padding: '14px 44px 14px 44px', color: '#c8e8f8', fontSize: 14.5, outline: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.25s' }} />
          <span onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,240,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
        </div>

        {/* Sign In Button with Heart Icon */}
        <button onClick={handleSubmit} style={{
          width: '100%', padding: 15, borderRadius: 12, marginTop: 24,
          background: 'linear-gradient(90deg, #00f0ff 0%, #0040ff 100%)', border: 'none',
          color: '#ffffff', fontSize: 15.5, fontWeight: 800, letterSpacing: '0.5px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 25px rgba(0,212,255,0.35)', fontFamily: "'Outfit', sans-serif",
          transition: 'all 0.25s'
        }}>
          {isSignUp ? 'Create Account' : 'Sign In'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 6 }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
        </button>

        <div style={{ marginTop: 22, fontSize: 13, color: '#5a8aaa', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span onClick={() => setIsSignUp(!isSignUp)} style={{ color: '#00f0ff', cursor: 'pointer', fontWeight: 700, marginLeft: 4 }}>
            {isSignUp ? 'Sign In' : 'Create one'}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes ecgDash { to { stroke-dashoffset: -1500; } }
        .login-card-wrapper input:focus {
          border-color: #00f0ff !important;
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.2) !important;
          background: rgba(0,15,35,0.6) !important;
        }
      `}</style>
    </div>
  )
}

// ─── APP ───
function Toast({ toast, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 10000,
      background: 'rgba(19, 29, 46, 0.85)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${toast.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : toast.type === 'warning' ? 'rgba(255, 140, 66, 0.4)' : 'rgba(0, 212, 255, 0.4)'}`,
      borderRadius: '16px',
      padding: '16px 20px',
      width: '320px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      color: 'white',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      
      <div style={{ fontSize: '20px' }}>
        {toast.type === 'error' ? '🚨' : toast.type === 'warning' ? '⚠️' : '✅'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: toast.type === 'error' ? '#ff4d6d' : toast.type === 'warning' ? '#ff8c42' : '#00e5a0' }}>
          {toast.title}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', lineHeight: '1.4' }}>
          {toast.message}
        </div>
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1, outline: 'none' }}>
        &times;
      </button>
    </div>
  )
}

// ─── SURVEY SCREEN ───
function LogoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 8px rgba(0, 212, 255, 0.5))' }}>
      <polygon points="50,5 93,30 93,80 50,95 7,80 7,30" fill="rgba(0, 114, 255, 0.15)" stroke="#00d4ff" strokeWidth="6" />
      <path d="M25,50 H40 L47,30 L55,70 L62,45 L67,55 L75,50" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SurveyScreen({ onComplete }) {
  const [step, setStep] = React.useState(1)
  
  // Profile stats (Step 1)
  const [age, setAge] = React.useState(28)
  const [gender, setGender] = React.useState('Male')
  const [weight, setWeight] = React.useState(70)
  const [height, setHeight] = React.useState(175)
  const [activity, setActivity] = React.useState('Moderately Active')
  
  // Fitness goal (Step 2)
  const [selectedGoal, setSelectedGoal] = React.useState('Fat Loss')
  const [goalDetail, setGoalDetail] = React.useState('Lose weight and burn fat fast')

  // Diet & Medical (Step 3)
  const [diet, setDiet] = React.useState('Non-Veg')
  const [conditions, setConditions] = React.useState([])

  // Loading & roadmap summary (Step 4)
  const [loadingStep, setLoadingStep] = React.useState(0)

  const goals = [
    { id: 'Fat Loss', icon: '🔥', label: 'Fat Loss', desc: 'Burn calories & drop weight' },
    { id: 'Muscle Gain', icon: '💪', label: 'Muscle Gain', desc: 'Build size & strength' },
    { id: 'Marathon', icon: '🏃', label: 'Marathon', desc: 'Endurance & run training' },
    { id: 'Six Pack', icon: '⚡', label: 'Six Pack', desc: 'Core definition & abs' },
    { id: 'Flexibility', icon: '🧘', label: 'Flexibility', desc: 'Yoga, stretch & mobility' },
    { id: 'Wellness', icon: '🌿', label: 'Wellness', desc: 'General fitness & vitality' },
  ]

  const btn = {
    border: 'none',
    outline: 'none',
    cursor: 'pointer',
    fontWeight: '800',
    transition: 'all 0.25s ease',
  }

  const stepTitles = {
    1: 'Bio Profile',
    2: 'Fitness Goal',
    3: 'Diet & Health',
    4: 'Custom Roadmap'
  }

  const [isGeneratingGoal, setIsGeneratingGoal] = React.useState(false)

  const [aiRoadmap, setAiRoadmap] = React.useState(null)

  const generateAiGoal = async () => {
    setIsGeneratingGoal(true)
    try {
      const res = await fetch('http://localhost:8000/api/generate-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, weight, height, gender, goal: selectedGoal })
      })
      if (!res.ok) throw new Error('Failed to generate')
      const data = await res.json()
      if (data.goalDetail) setGoalDetail(data.goalDetail)
    } catch (e) {
      console.error(e)
    } finally {
      setIsGeneratingGoal(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      width: '100%',
      background: 'radial-gradient(circle at 50% 50%, #031430 0%, #010612 100%)',
      color: 'white',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      position: 'relative',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Background Grid Overlay */}
      <div className="login-bg-grid" style={{ opacity: 0.15 }} />

      <style>{`
        .survey-card {
          animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .survey-btn-glow {
          box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4);
          transition: all 0.3s ease;
        }
        .survey-btn-glow:hover {
          box-shadow: 0 0 25px rgba(0, 212, 255, 0.5);
          transform: translateY(-2px);
        }
        .survey-gender-card {
          transition: all 0.25s ease;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(4, 12, 32, 0.45);
        }
        .survey-gender-card:hover {
          border-color: rgba(0, 212, 255, 0.4);
          background: rgba(0, 212, 255, 0.03);
          transform: translateY(-2px);
        }
        .survey-gender-card.active {
          border-color: #00d4ff;
          background: rgba(0, 212, 255, 0.08);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
        }
        .activity-card {
          transition: all 0.25s ease;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(4, 12, 32, 0.45);
          cursor: pointer;
        }
        .activity-card:hover {
          border-color: rgba(0, 212, 255, 0.4);
          background: rgba(0, 212, 255, 0.03);
          transform: translateY(-2px);
        }
        .activity-card.active {
          border-color: #00d4ff;
          background: rgba(0, 212, 255, 0.08);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
        }
        .survey-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.1);
          outline: none;
          margin: 15px 0;
        }
        .survey-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00d4ff;
          cursor: pointer;
          box-shadow: 0 0 10px #00d4ff;
          transition: transform 0.1s;
        }
        .survey-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .goal-card-btn {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .goal-card-btn:hover {
          transform: translateY(-3px);
          border-color: rgba(0, 212, 255, 0.4) !important;
          box-shadow: 0 8px 25px rgba(0, 212, 255, 0.15) !important;
          background: rgba(0, 212, 255, 0.05) !important;
        }
        .survey-try-tag {
          cursor: pointer;
          color: #00d4ff;
          border-bottom: 1px dashed rgba(0, 212, 255, 0.4);
          transition: all 0.2s ease;
        }
        .survey-try-tag:hover {
          color: #00e5a0;
          border-color: #00e5a0;
        }
        @keyframes surveySpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Top Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: 'rgba(1, 6, 18, 0.8)',
        backdropFilter: 'blur(10px)',
        zIndex: 10,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LogoIcon />
          <span style={{ fontSize: '20px', fontWeight: '900', letterSpacing: '1.5px', fontFamily: "'Outfit', sans-serif" }}>
            SAN<span style={{ color: '#00d4ff' }}>JEEVNI</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '8px 24px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {[1, 2, 3, 4].map(s => {
              const isActive = s === step;
              const isCompleted = s < step;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    position: 'relative',
                    width: isActive ? '36px' : '10px',
                    height: '10px',
                    borderRadius: '10px',
                    background: isActive ? 'linear-gradient(90deg, #00d4ff, #0072ff)' : isCompleted ? '#00d4ff' : 'rgba(255,255,255,0.15)',
                    boxShadow: isActive ? '0 0 16px rgba(0,212,255,0.6)' : isCompleted ? '0 0 8px rgba(0,212,255,0.3)' : 'none',
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                  {s < 4 && <div style={{ width: '12px', height: '2px', borderRadius: '1px', background: isCompleted ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255,255,255,0.08)' }} />}
                </div>
              )
            })}
          </div>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '130px' }}>
            <span style={{ fontSize: '9px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              STEP {step} OF 4
            </span>
            <span style={{ fontSize: '13px', fontWeight: '800', color: '#00d4ff', letterSpacing: '0.5px' }}>
              {stepTitles[step]}
            </span>
          </div>
        </div>
      </header>

      {/* Body content based on step */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 20px', zIndex: 2, overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
        
        {step === 1 && (
          <div className="survey-card" style={{ maxWidth: '750px', margin: '20px auto', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.25)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: '700', color: '#00d4ff', letterSpacing: '0.5px', marginBottom: '20px', textTransform: 'uppercase' }}>
                ✦ BIOLOGICAL METRICS
              </div>
              <h1 style={{ fontSize: '38px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", marginBottom: '12px', background: 'linear-gradient(130deg, #ffffff 50%, #8ae4ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Build your Bio Profile
              </h1>
              <p style={{ fontSize: '14.5px', color: 'rgba(255,255,255,0.5)', maxWidth: '480px', margin: '0 auto', lineHeight: '1.6' }}>
                Accurate baseline metrics configure the AI engine to compute precise health risk alerts.
              </p>
            </div>

            <div style={{ background: 'rgba(4, 12, 32, 0.45)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '28px', padding: '36px', backdropFilter: 'blur(20px)' }}>
              
              {/* Row 1: Age */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>AGE</span>
                  <span style={{ fontSize: '18px', fontWeight: '900', color: '#00d4ff', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{age} <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 'normal' }}>Years</span></span>
                </div>
                <input type="range" min="18" max="100" value={age} onChange={e => setAge(Number(e.target.value))} className="survey-slider" style={{ background: `linear-gradient(to right, #00d4ff ${(age - 18) / (100 - 18) * 100}%, rgba(255,255,255,0.1) ${(age - 18) / (100 - 18) * 100}%)` }} />
              </div>

              {/* Row 2: Gender Selection Cards */}
              <div>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px', marginBottom: '12px' }}>GENDER IDENTITY</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {[
                    { id: 'Male', label: 'Male', icon: '♂️' },
                    { id: 'Female', label: 'Female', icon: '♀️' },
                    { id: 'Other', label: 'Other', icon: '⚧' }
                  ].map(g => (
                    <div key={g.id} onClick={() => setGender(g.id)} className={`survey-gender-card ${gender === g.id ? 'active' : ''}`} style={{ padding: '16px', borderRadius: '14px', textAlign: 'center', cursor: 'pointer' }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{g.icon}</div>
                      <div style={{ fontSize: '14px', fontWeight: '700' }}>{g.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 3: Weight and Height Sliders */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>WEIGHT</span>
                    <span style={{ fontSize: '16.5px', fontWeight: '900', color: '#00d4ff' }}>{weight} <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>KG</span></span>
                  </div>
                  <input type="range" min="30" max="180" value={weight} onChange={e => setWeight(Number(e.target.value))} className="survey-slider" style={{ background: `linear-gradient(to right, #00d4ff ${(weight - 30) / (180 - 30) * 100}%, rgba(255,255,255,0.1) ${(weight - 30) / (180 - 30) * 100}%)` }} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>HEIGHT</span>
                    <span style={{ fontSize: '16.5px', fontWeight: '900', color: '#00d4ff' }}>{height} <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>CM</span></span>
                  </div>
                  <input type="range" min="120" max="220" value={height} onChange={e => setHeight(Number(e.target.value))} className="survey-slider" style={{ background: `linear-gradient(to right, #00d4ff ${(height - 120) / (220 - 120) * 100}%, rgba(255,255,255,0.1) ${(height - 120) / (220 - 120) * 100}%)` }} />
                </div>
              </div>

              {/* Row 4: Daily Activity Cards */}
              <div>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px', marginBottom: '12px' }}>DAILY ACTIVITY LEVEL</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {[
                    { id: 'Sedentary', label: 'Sedentary', desc: 'Little to no exercise, desk job', icon: '💤' },
                    { id: 'Lightly Active', label: 'Lightly Active', desc: 'Light workout 1-3 days/week', icon: '🚶' },
                    { id: 'Moderately Active', label: 'Moderately Active', desc: 'Active workout 3-5 days/week', icon: '🏃' },
                    { id: 'Very Active', label: 'Very Active', desc: 'Heavy sports or physical job', icon: '⚡' }
                  ].map(act => (
                    <div key={act.id} onClick={() => setActivity(act.id)} className={`activity-card ${activity === act.id ? 'active' : ''}`} style={{ padding: '16px', borderRadius: '16px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div style={{ fontSize: '24px', background: 'rgba(255,255,255,0.03)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{act.icon}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: activity === act.id ? '#00d4ff' : 'white' }}>{act.label}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{act.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => setStep(2)} className="survey-btn-glow" style={{ ...btn, background: 'linear-gradient(90deg, #0072ff 0%, #00c6ff 100%)', color: 'white', padding: '16px', borderRadius: '14px', fontSize: '15px', marginTop: '10px' }}>
                ✦ CONTINUE TO FITNESS TARGET
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="survey-card" style={{ maxWidth: '900px', margin: '20px auto', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '20px', marginBottom: '20px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px #00d4ff' }} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#00d4ff', letterSpacing: '1px' }}>AI HEALTH ASSISTANT</span>
              </div>
              <h1 style={{ fontSize: '52px', fontWeight: '900', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '16px', lineHeight: '1.1', color: '#ffffff', letterSpacing: '-1px' }}>
                What's your <br />
                <span style={{ color: '#00d4ff' }}>fitness target?</span>
              </h1>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', maxWidth: '600px', margin: '0 auto', lineHeight: '1.6' }}>
                Choose a baseline track or detail your own objectives. Our AI adapts dashboards to fit your focus.
              </p>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px', textTransform: 'uppercase' }}>
                QUICK SELECT A GOAL
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                {goals.map(g => {
                  const isSel = selectedGoal === g.id
                  return (
                    <div key={g.id} onClick={() => { setSelectedGoal(g.id); g.id === 'Fat Loss' ? setGoalDetail('Lose weight and burn fat fast') : g.id === 'Muscle Gain' ? setGoalDetail('Build muscle mass and strength') : g.id === 'Marathon' ? setGoalDetail('Train endurance for running 5km+') : g.id === 'Six Pack' ? setGoalDetail('Sculpt abs and core muscles') : g.id === 'Flexibility' ? setGoalDetail('Improve range of motion and yoga postures') : setGoalDetail('Overall health and stress management') }}
                      className="goal-card-btn"
                      style={{
                        background: isSel ? 'rgba(0, 212, 255, 0.08)' : 'rgba(4, 12, 32, 0.45)',
                        border: isSel ? '2px solid #00d4ff' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        position: 'relative',
                        boxShadow: isSel ? '0 8px 25px rgba(0, 212, 255, 0.2)' : 'none',
                        textAlign: 'left'
                      }}>
                      {isSel && (
                        <div style={{ position: 'absolute', top: '16px', right: '16px', width: '20px', height: '20px', borderRadius: '50%', background: '#00d4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#031430', fontWeight: 'bold' }}>
                          ✓
                        </div>
                      )}
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>{g.icon}</div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: isSel ? '#00d4ff' : 'white' }}>{g.label}</div>
                      <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: '1.4' }}>{g.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: 'rgba(4, 12, 32, 0.45)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '28px', backdropFilter: 'blur(20px)' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', marginBottom: '14px', textTransform: 'uppercase' }}>
                CUSTOM PLAN SUMMARY & INSTRUCTIONS
              </div>
              
              <div style={{ display: 'flex', gap: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '8px 8px 8px 18px', alignItems: 'center' }}>
                <button 
                  onClick={generateAiGoal}
                  disabled={isGeneratingGoal}
                  className="survey-try-tag"
                  style={{ fontSize: '18px', color: isGeneratingGoal ? '#00e5a0' : '#00d4ff', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'all 0.3s ease' }}
                  title="Generate with AI"
                >
                  {isGeneratingGoal ? '⌛' : '✨'}
                </button>
                <input type="text" value={goalDetail} onChange={e => setGoalDetail(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', fontSize: '15.5px', outline: 'none', padding: '8px 0' }} placeholder="Describe your focus details..." />
                <button onClick={() => setStep(3)} className="survey-btn-glow" style={{ ...btn, background: 'linear-gradient(90deg, #0072ff 0%, #00c6ff 100%)', color: 'white', padding: '14px 28px', borderRadius: '12px', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ✦ NEXT STEP
                </button>
              </div>

              {/* Suggestion tags */}
              <div style={{ display: 'flex', gap: '14px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.4)' }}>Try suggestions:</span>
                {['Summer body', 'Run 5km', 'Bulk season'].map(suggestion => (
                  <span key={suggestion} onClick={() => setGoalDetail(suggestion === 'Summer body' ? 'Build a lean summer body with defined abs' : suggestion === 'Run 5km' ? 'Train to run 5km and increase aerobic capacity' : 'Increase calorie intake to gain strength and size')} className="survey-try-tag">
                    {suggestion}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="survey-card" style={{ maxWidth: '650px', margin: '20px auto', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '36px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.25)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: '700', color: '#00d4ff', letterSpacing: '0.5px', marginBottom: '20px', textTransform: 'uppercase' }}>
                ✦ NUTRITION & CLINICALS
              </div>
              <h1 style={{ fontSize: '38px', fontWeight: '800', fontFamily: "'Outfit', sans-serif", marginBottom: '12px', background: 'linear-gradient(130deg, #ffffff 50%, #8ae4ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Diet & Medical Profile
              </h1>
              <p style={{ fontSize: '14.5px', color: 'rgba(255,255,255,0.5)', maxWidth: '480px', margin: '0 auto', lineHeight: '1.6' }}>
                Medical filters adapt warning threshold calculators and food recommendations to match your status.
              </p>
            </div>

            <div style={{ background: 'rgba(4, 12, 32, 0.45)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '28px', padding: '36px', backdropFilter: 'blur(20px)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px', marginBottom: '12px' }}>DIETARY TRACK PREFERENCE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {['Veg', 'Non-Veg', 'Vegan', 'Keto'].map(d => {
                    const isSel = diet === d
                    return (
                      <div key={d} onClick={() => setDiet(d)}
                        style={{
                          background: isSel ? 'rgba(0, 212, 255, 0.08)' : 'rgba(255,255,255,0.02)',
                          border: isSel ? '2px solid #00d4ff' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '14px',
                          padding: '16px 8px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontWeight: '800',
                          fontSize: '13.5px',
                          color: isSel ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                          transition: 'all 0.2s ease',
                          boxShadow: isSel ? '0 4px 15px rgba(0, 212, 255, 0.15)' : 'none'
                        }}>
                        <div style={{ fontSize: '18px', marginBottom: '4px' }}>{d === 'Veg' ? '🥗' : d === 'Non-Veg' ? '🍗' : d === 'Vegan' ? '🌱' : '🥑'}</div>
                        {d}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px', marginBottom: '12px' }}>ACTIVE MEDICAL HISTORIES (SELECT ALL THAT APPLY)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {[
                    { id: 'Diabetes', label: '🩸 Diabetes (High Sugar)', color: '#ef4444' },
                    { id: 'Hypertension', label: '🫀 Hypertension (High BP)', color: '#ec4899' },
                    { id: 'High Cholesterol', label: '🧪 High Cholesterol', color: '#eab308' },
                    { id: 'Asthma', label: '🫁 Asthma (Respiratory)', color: '#3b82f6' }
                  ].map(cond => {
                    const isSel = conditions.includes(cond.id)
                    return (
                      <div key={cond.id} onClick={() => {
                        if (isSel) {
                          setConditions(conditions.filter(c => c !== cond.id))
                        } else {
                          setConditions([...conditions, cond.id])
                        }
                      }}
                        style={{
                          background: isSel ? `${cond.color}15` : 'rgba(255,255,255,0.02)',
                          border: isSel ? `2px solid ${cond.color}` : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '14px',
                          padding: '16px',
                          cursor: 'pointer',
                          fontSize: '13.5px',
                          fontWeight: '700',
                          color: isSel ? 'white' : 'rgba(255,255,255,0.6)',
                          transition: 'all 0.25s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: isSel ? `0 4px 15px ${cond.color}20` : 'none'
                        }}>
                        <span>{cond.label}</span>
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: `1.5px solid ${isSel ? cond.color : 'rgba(255,255,255,0.3)'}`,
                          background: isSel ? cond.color : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          color: 'black',
                          fontWeight: 'bold'
                        }}>
                          {isSel && '✓'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={() => {
                setStep(4)
                let cycle = 0
                const timer = setInterval(() => {
                  cycle++
                  setLoadingStep(cycle)
                  if (cycle >= 4) {
                    clearInterval(timer)
                  }
                }, 900)
                
                // Fetch AI Roadmap dynamically
                fetch('http://localhost:8000/api/generate-roadmap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ age, weight, height, gender, goal: selectedGoal, diet, conditions })
                })
                .then(r => r.json())
                .then(data => setAiRoadmap(data))
                .catch(err => console.error(err))

              }} className="survey-btn-glow" style={{ ...btn, background: 'linear-gradient(90deg, #0072ff 0%, #00c6ff 100%)', color: 'white', padding: '16px', borderRadius: '14px', fontSize: '15px', marginTop: '10px' }}>
                ✦ ANALYZE & GENERATE ROADMAP
              </button>
            </div>
          </div>
        )}

        {step === 4 && loadingStep < 4 && (
          <div className="survey-card" style={{ maxWidth: '500px', margin: '20px auto', padding: '60px 20px', width: '100%', textAlign: 'center' }}>
            <div style={{ position: 'relative', width: '90px', height: '90px', margin: '0 auto 30px' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: '50%',
                border: '4px solid rgba(0, 212, 255, 0.05)',
              }} />
              <div style={{
                width: '90px', height: '90px', borderRadius: '50%',
                border: '4px solid transparent',
                borderTop: '4px solid #00d4ff',
                borderBottom: '4px solid #00e5a0',
                animation: 'surveySpin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite'
              }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: '28px' }}>🤖</div>
            </div>
            
            <h2 style={{ fontSize: '22px', fontWeight: '900', color: 'white', marginBottom: '8px', fontFamily: "'Outfit', sans-serif" }}>
              {loadingStep === 1 ? 'Calibrating body metrics...' : 
               loadingStep === 2 ? 'Formulating nutritional plan...' :
               loadingStep === 3 ? 'Syncing Gemini prediction engine...' : 'Creating your custom roadmap...'}
            </h2>
            <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.3px' }}>
              Sanjeevni AI is preparing your profile dashboard
            </p>
          </div>
        )}

        {step === 4 && loadingStep >= 4 && (
          <div className="survey-card" style={{ maxWidth: '700px', margin: '20px auto', padding: '40px 20px', width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 229, 160, 0.08)', border: '1px solid rgba(0, 229, 160, 0.25)', padding: '6px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: '700', color: '#00e5a0', letterSpacing: '0.5px', marginBottom: '20px', textTransform: 'uppercase' }}>
                ✦ ROADMAP SYNTHESIZED
              </div>
              <h1 style={{ fontSize: '36px', fontWeight: '900', fontFamily: "'Outfit', sans-serif", marginBottom: '8px', color: 'white' }}>
                Your Custom AI Roadmap
              </h1>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                Target metrics configured dynamically according to your bio-parameters
              </p>
            </div>

            <div style={{ background: 'rgba(4, 12, 32, 0.45)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px', backdropFilter: 'blur(20px)' }}>
              
              <div style={{ display: 'flex', gap: '16px', background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 114, 255, 0.05) 100%)', padding: '20px', borderRadius: '18px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <div style={{ fontSize: '36px', display: 'flex', alignItems: 'center' }}>✨</div>
                <div>
                  <div style={{ fontSize: '11px', color: '#00d4ff', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' }}>SELECTED FOCUS TRACK</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', marginTop: '2px', color: 'white' }}>
                    {selectedGoal} Roadmap ({diet})
                  </div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px', fontStyle: 'italic', lineHeight: '1.4' }}>
                    "{goalDetail}"
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { title: 'DAILY CALORIE GOAL', value: aiRoadmap?.calorieGoal || (selectedGoal === 'Fat Loss' ? '1,820 kcal' : selectedGoal === 'Muscle Gain' ? '2,850 kcal' : '2,200 kcal'), desc: 'AI Calculated Target', color: '#00d4ff' },
                  { title: 'HYDRATION TARGET', value: aiRoadmap?.hydrationTarget || '8-10 glasses (2.5L)', desc: 'Clean metabolic function', color: '#00e5a0' },
                  { title: 'DAILY MOVEMENT GOAL', value: aiRoadmap?.movementGoal || (selectedGoal === 'Marathon' ? '12,000 steps' : '10,000 steps'), desc: 'Cardiovascular maintenance', color: '#00d4ff' },
                  { title: 'CLINICAL CONTEXT', value: aiRoadmap?.clinicalContext || (conditions.length > 0 ? conditions.join(', ') : 'No Conditions Active'), desc: 'Targeted warnings active', color: conditions.length > 0 ? '#ff4d6d' : '#00e5a0' }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '18px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: '800', letterSpacing: '0.5px' }}>{item.title}</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <button onClick={() => onComplete({ age, gender, weight, height, activity, selectedGoal, goalDetail, diet, conditions })}
                className="survey-btn-glow"
                style={{ ...btn, background: 'linear-gradient(90deg, #00e5a0 0%, #00b4ff 100%)', color: '#031430', padding: '18px', borderRadius: '14px', fontSize: '15px', fontWeight: '800' }}>
                ✦ ENTER SANJEEVNI HEALTH PORTAL
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function AppContent() {
  const { currentUser, toast, setToast, surveyData, completeSurvey } = React.useContext(GlobalContext)
  
  if (!currentUser) {
    return <LoginScreen />
  }

  if (!surveyData) {
    return <SurveyScreen onComplete={completeSurvey} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0f1e' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <Routes>
          <Route path="/"           element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/lifestyle"  element={<Lifestyle />} />
          <Route path="/medical"    element={<Medical />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/doctors"    element={<Doctors />} />
          <Route path="/chatbot"    element={<Chatbot />} />
          <Route path="/alerts"     element={<Alerts />} />
        </Routes>
      </main>

      {/* Toast Notification Popup */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

export default function App() {
  return (
    <GlobalProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </GlobalProvider>
  )
}
