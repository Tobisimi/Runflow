// DOM Elements
const distanceEl = document.getElementById("distance");
const paceEl = document.getElementById("pace");
const timeEl = document.getElementById("time");
const speedEl = document.getElementById("speed");
const caloriesEl = document.getElementById("calories");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceBtn = document.getElementById("voiceBtn");
const micIndicator = document.getElementById("micIndicator");
const installBtn = document.getElementById("installBtn");

// App State
let isRunning = false;
let startTime = null;
let totalDistance = 0; // in kilometers
let positions = [];
let watchId = null;
let stepCount = 0;
let estimatedDistanceFromSteps = 0;
let lastAnnouncedKm = 0;
let voiceRecognition = null;
let wakeLock = null; // ✅ ADDED: Wake lock variable

// GPS Settings
const MIN_DISTANCE = 0.005; // 5 meters minimum movement
const MAX_SPEED_KPH = 25; // Maximum realistic running speed
const STEP_LENGTH = 0.00075; // 0.75 meters per step in km
const GPS_UPDATE_INTERVAL = 2000; // Update every 2 seconds

// AI Mode
let useAI = true; // AI enabled by default if key exists
let aiCoach = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  console.log("RunFlow PWA Loaded");
  setupEventListeners();
  setupPWAInstall();
  checkPermissions();
  initializeAI();
  setupNetworkStatus();
});

// ==================== DEBUG MODE ====================
const DEBUG = true;
function log(...args) {
  if (DEBUG) console.log("🔍", ...args);
  // Also show on screen for mobile debugging
  const debugEl = document.getElementById("debugLog");
  if (debugEl) {
    debugEl.textContent =
      args.join(" ") + "\n" + debugEl.textContent.substring(0, 500);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  log("Setting up event listeners...");

  // Use both click and touchend for better mobile support
  startBtn.addEventListener("click", (e) => {
    log("Start button CLICKED");
    e.preventDefault();
    startRun();
  });

  startBtn.addEventListener("touchend", (e) => {
    log("Start button TOUCHED");
    e.preventDefault();
    startRun();
  });

  stopBtn.addEventListener("click", (e) => {
    log("Stop button CLICKED");
    e.preventDefault();
    stopRun();
  });

  stopBtn.addEventListener("touchend", (e) => {
    log("Stop button TOUCHED");
    e.preventDefault();
    stopRun();
  });

  voiceBtn.addEventListener("click", (e) => {
    log("Voice button CLICKED");
    e.preventDefault();
    startManualVoiceCommand();
  });

  addAIToggleButton();
  log("Event listeners setup complete");
}

// Check Permissions
async function checkPermissions() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported");
    startBtn.disabled = true;
  }

  if (!("speechSynthesis" in window)) {
    console.warn("Speech synthesis not supported");
  }

  if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
    console.warn("Speech recognition not supported");
    voiceBtn.disabled = true;
  }
}

// ==================== AI COACH INITIALIZATION ====================

function initializeAI() {
  try {
    // Check if API key is available (from config.js)
    const apiKey = window.APP_CONFIG?.GEMINI_API_KEY;

    if (apiKey && apiKey.length > 10) {
      aiCoach = new AICoach(apiKey);
      console.log("AI Coach initialized with API key");

      // Enable AI mode by default
      useAI = true;
      updateAIToggleButton(true);

      // Test AI connection
      testAIConnection();
    } else {
      console.warn("No valid Gemini API key found. AI features disabled.");
      useAI = false;
      updateAIToggleButton(false);
      speak("AI Coach unavailable. Using basic mode.");
    }
  } catch (error) {
    console.error("Failed to initialize AI:", error);
    useAI = false;
  }
}

function addAIToggleButton() {
  const aiToggleBtn = document.createElement("button");
  aiToggleBtn.id = "aiToggleBtn";
  aiToggleBtn.className = "ai-toggle-btn";
  aiToggleBtn.innerHTML = "🧠 AI: ON";
  aiToggleBtn.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: #4CAF50;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 20px;
        font-size: 12px;
        cursor: pointer;
        z-index: 1000;
        box-shadow: 0 0 10px #4CAF50;
        transition: all 0.3s;
    `;

  aiToggleBtn.addEventListener("click", () => {
    if (!aiCoach) {
      speak("AI Coach not available. Check API key in config.js");
      return;
    }

    useAI = !useAI;
    updateAIToggleButton(useAI);
    speak(useAI ? "AI Coach activated!" : "Basic mode activated");

    // Save preference
    localStorage.setItem("runflow_ai_mode", useAI ? "on" : "off");
  });

  // Load saved preference
  const savedMode = localStorage.getItem("runflow_ai_mode");
  if (savedMode === "off") {
    useAI = false;
    updateAIToggleButton(false);
  }

  document.body.appendChild(aiToggleBtn);
}

function updateAIToggleButton(isEnabled) {
  const btn = document.getElementById("aiToggleBtn");
  if (btn) {
    btn.innerHTML = isEnabled ? "🧠 AI: ON" : "🧠 AI: OFF";
    btn.style.background = isEnabled ? "#4CAF50" : "#666";
    btn.style.boxShadow = isEnabled ? "0 0 10px #4CAF50" : "none";
  }
}

async function testAIConnection() {
  if (!aiCoach) return;

  try {
    const response = await aiCoach.queryGemini("Say hello as a running coach");
    console.log("AI Connection test:", response.substring(0, 50) + "...");
  } catch (error) {
    console.warn("AI Connection failed:", error.message);
    useAI = false;
    updateAIToggleButton(false);
  }
}

// ==================== RUN FUNCTIONS ====================

// Start Run
async function startRun() {
  try {
    // ✅ FIXED: Request wake lock to keep screen on
    if (wakeLock) {
      try {
        await wakeLock.release();
        wakeLock = null;
      } catch (err) {
        console.log("Wake lock error:", err);
      }
    }

    // Request location permission
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      });
    });

    const greeting =
      useAI && aiCoach
        ? "Run started! Your AI coach is ready. Say anything to me!"
        : "Run started! Say 'how far', 'pace', 'time', or 'stop'.";

    speak(greeting);

    // Reset state
    totalDistance = 0;
    positions = [
      {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        time: Date.now(),
        accuracy: position.coords.accuracy,
      },
    ];
    startTime = new Date();
    isRunning = true;
    stepCount = 0;
    lastAnnouncedKm = 0;

    // Update UI
    updateUI();
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Start systems
    startGPSTracking();
    startStepDetection();
    startVoiceMonitoring();
    updateTimer();

    console.log("Run started at", startTime);
  } catch (error) {
    console.error("Failed to start run:", error);
    speak("Could not start run. Please check location permissions.");
  }
}

// Smart GPS Tracking with Filtering
function startGPSTracking() {
  const options = {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 10000,
  };

  let lastUpdateTime = 0;

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const now = Date.now();

      // Throttle updates to save battery
      if (now - lastUpdateTime < GPS_UPDATE_INTERVAL) {
        return;
      }
      lastUpdateTime = now;

      const accuracy = position.coords.accuracy;

      // ✅ FIXED: More lenient GPS accuracy (was 30, now 100)
      if (accuracy > 100) {
        console.log("Poor GPS accuracy:", accuracy, "meters. Skipping.");
        return;
      }

      const newPos = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        time: now,
        accuracy: accuracy,
      };

      if (positions.length === 0) {
        positions.push(newPos);
        return;
      }

      const lastPos = positions[positions.length - 1];
      const distance = calculateDistance(
        lastPos.lat,
        lastPos.lon,
        newPos.lat,
        newPos.lon,
      );

      // Time difference in hours for speed calculation
      const timeDiffHours = (newPos.time - lastPos.time) / 3600000;
      const speedKph = distance / timeDiffHours;

      // SMART FILTERS:
      // 1. Minimum movement (5m) to ignore GPS drift
      // 2. Maximum speed (25 km/h for running)
      // 3. Not jumping too far (max 0.1km per update)
      if (
        distance > MIN_DISTANCE &&
        speedKph < MAX_SPEED_KPH &&
        distance < 0.1
      ) {
        totalDistance += distance;
        positions.push(newPos);

        // Keep only recent positions
        if (positions.length > 20) positions.shift();

        updateUI();
      }
    },
    (error) => {
      console.log("GPS Error:", error.message);
      // Fallback to step estimation when GPS fails
      if (isRunning) {
        speak("GPS signal weak. Using step estimation.");
      }
    },
    options,
  );
}

// Step Detection (for when GPS fails)
function startStepDetection() {
  if (window.DeviceMotionEvent) {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      // iOS 13+
      DeviceMotionEvent.requestPermission()
        .then((permission) => {
          if (permission === "granted") {
            window.addEventListener("devicemotion", handleMotion);
          }
        })
        .catch(console.error);
    } else {
      // Android/other
      window.addEventListener("devicemotion", handleMotion);
    }
  }
}

function handleMotion(event) {
  if (!isRunning) return;

  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;

  // Simple step detection based on vertical acceleration
  const verticalAccel = Math.abs(acceleration.y || acceleration.y);

  if (verticalAccel > 10.5 && verticalAccel < 15) {
    stepCount++;
    estimatedDistanceFromSteps = stepCount * STEP_LENGTH;

    // If GPS hasn't updated in 5 seconds, blend with step estimation
    const lastGpsTime =
      positions.length > 0 ? positions[positions.length - 1].time : 0;
    if (Date.now() - lastGpsTime > 5000) {
      // Blend: 70% GPS distance + 30% step distance
      const blendedDistance =
        totalDistance * 0.7 + estimatedDistanceFromSteps * 0.3;

      // Only update if it's a meaningful increase
      if (blendedDistance > totalDistance + 0.001) {
        totalDistance = blendedDistance;
        updateUI();
      }
    }
  }
}

// Calculate Distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ✅ FIXED: Stop Run Function
async function stopRun() {
  if (!isRunning) return;

  console.log("Stopping run...");
  isRunning = false;

  // 1. Stop GPS tracking
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    console.log("GPS stopped");
  }

  // 2. Stop voice monitoring
  stopVoiceMonitoring();
  console.log("Voice monitoring stopped");

  // 3. ✅ FIXED: Release wake lock correctly
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
      console.log("Wake lock released");
    } catch (err) {
      console.log("Wake lock error (not critical):", err);
    }
  }

  // 4. Calculate final stats
  const time = calculateTimeElapsed();
  const pace = calculatePace(totalDistance, time);
  const avgSpeed = totalDistance / (time / 3600000) || 0;

  // 5. Speak summary (try AI first, fallback to basic)
  try {
    if (useAI && aiCoach && aiCoach.isOnline) {
      const summary = await aiCoach.getRunSummary(totalDistance, time, pace);
      speak(summary);
    } else {
      speak(
        `Run completed! ${totalDistance.toFixed(2)} km in ${formatTime(time)}. Pace: ${pace}/km.`,
      );
    }
  } catch (error) {
    // AI failed, use basic summary
    speak(
      `Run done! You ran ${totalDistance.toFixed(2)} kilometers in ${formatTime(time)}.`,
    );
  }

  // 6. Save to history
  saveRunHistory();

  // 7. Update UI buttons
  startBtn.disabled = false;
  stopBtn.disabled = true;

  // 8. Log final stats
  console.log(
    `Run stopped: ${totalDistance.toFixed(2)} km, ${formatTime(time)}, Pace: ${pace}/km`,
  );
}

// ==================== VOICE SYSTEM ====================

// Voice Monitoring System
function startVoiceMonitoring() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not available");
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "en-US";
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;

  voiceRecognition.onstart = () => {
    console.log("✅ Voice recognition STARTED - listening for commands");
  };

  voiceRecognition.onresult = (event) => {
    console.log("🎤 Result received:", event.results.length, "results");
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const fullTranscript = result[0].transcript.toLowerCase().trim();
      console.log(
        "🎤 FINAL transcript:",
        fullTranscript,
        "confidence:",
        result[0].confidence,
      );

      if (fullTranscript.length > 2) {
        micIndicator.style.display = "flex";
        setTimeout(() => (micIndicator.style.display = "none"), 1500);
        processVoiceCommand(fullTranscript);
      }
    }
  };

  voiceRecognition.onerror = (event) => {
    console.error("❌ Speech Recognition ERROR:", event.error, event);
    speak(`Voice error: ${event.error}`);

    if (isRunning && voiceRecognition) {
      setTimeout(() => {
        try {
          voiceRecognition.start();
        } catch (e) {
          console.error("Failed to restart voice recognition:", e);
        }
      }, 2000);
    }
  };

  voiceRecognition.onend = () => {
    console.log("Voice recognition ended");
    if (isRunning && voiceRecognition) {
      setTimeout(() => {
        try {
          console.log("Restarting voice recognition...");
          voiceRecognition.start();
        } catch (e) {
          console.error("Failed to restart:", e);
        }
      }, 500);
    }
  };

  try {
    voiceRecognition.start();
    console.log("✅ Voice monitoring started - waiting for speech");
  } catch (e) {
    console.error("❌ Failed to start voice monitoring:", e);
    speak("Voice recognition failed to start");
  }
}

function stopVoiceMonitoring() {
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch (e) {}
    voiceRecognition = null;
  }
}

// Manual Voice Button
function startManualVoiceCommand() {
  if (!isRunning) {
    speak("Start a run first to use voice commands.");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speak("Voice recognition not available.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micIndicator.style.display = "flex";
  speak("Listening...");

  recognition.start();

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.toLowerCase();
    micIndicator.style.display = "none";
    processVoiceCommand(text);
  };

  recognition.onerror = () => {
    micIndicator.style.display = "none";
    speak("Sorry, I didn't catch that.");
  };
}

// Process Voice Command (with AI)
async function processVoiceCommand(command) {
  console.log("🎤 Processing command:", command);

  // Show visual feedback
  micIndicator.style.display = "flex";

  // If command is very short, ignore (likely noise)
  if (command.trim().length < 3) {
    setTimeout(() => (micIndicator.style.display = "none"), 1000);
    return;
  }

  try {
    let response;

    // Check if we should use AI
    const shouldUseAI = useAI && aiCoach && aiCoach.isOnline;

    if (shouldUseAI) {
      // Use AI for complex commands or if "coach" is mentioned
      if (
        command.toLowerCase().includes("coach") ||
        command.toLowerCase().includes("hey") ||
        command.length > 10
      ) {
        console.log("Using AI for:", command);
        response = await aiCoach.handleCommand(command, {
          distance: totalDistance,
          time: calculateTimeElapsed(),
          isRunning: isRunning,
        });
      } else {
        // Simple command, use basic handler
        response = handleBasicCommand(command);
      }
    } else {
      // No AI available, use basic
      response = handleBasicCommand(command);
    }

    // Speak the response
    if (response) {
      console.log("🤖 Response:", response);
      speak(response);
    }

    // Check if command was to stop
    if (
      command.toLowerCase().includes("stop") ||
      command.toLowerCase().includes("done") ||
      command.toLowerCase().includes("finish")
    ) {
      setTimeout(() => stopRun(), 1000);
    }
  } catch (error) {
    console.error("Command processing error:", error);

    // Fallback response
    if (command.toLowerCase().includes("how far")) {
      speak(`You've run ${totalDistance.toFixed(2)} kilometers`);
    } else if (command.toLowerCase().includes("pace")) {
      const pace = calculatePace(totalDistance, calculateTimeElapsed());
      speak(`Pace is ${pace} per kilometer`);
    } else if (command.toLowerCase().includes("time")) {
      speak(`Time: ${formatTime(calculateTimeElapsed())}`);
    } else {
      speak(`I heard you say: ${command.substring(0, 30)}`);
    }
  } finally {
    // Hide mic indicator after delay
    setTimeout(() => (micIndicator.style.display = "none"), 2000);
  }
}

// Basic command handler (fallback)
function handleBasicCommand(command) {
  const cmd = command.toLowerCase();

  if (cmd.includes("how far") || cmd.includes("distance")) {
    return `You've run ${totalDistance.toFixed(2)} kilometers!`;
  } else if (cmd.includes("pace") || cmd.includes("speed")) {
    const pace = calculatePace(totalDistance, calculateTimeElapsed());
    return `Your pace is ${pace} per kilometer`;
  } else if (cmd.includes("time")) {
    return `Elapsed time: ${formatTime(calculateTimeElapsed())}`;
  } else if (
    cmd.includes("stop") ||
    cmd.includes("done") ||
    cmd.includes("finish")
  ) {
    return "Stopping your run now!";
  } else if (cmd.includes("activate ai") || cmd.includes("ai mode")) {
    if (!aiCoach) return "AI Coach not available. Check API key.";
    useAI = !useAI;
    updateAIToggleButton(useAI);
    return useAI ? "AI Coach activated!" : "Basic mode activated";
  } else {
    return `I heard: "${command}". Try: how far, pace, time, or stop.`;
  }
}

// ==================== AI COACH CLASS ====================

class AICoach {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.isOnline = navigator.onLine;
    this.conversationHistory = [];
    this.setupNetworkListener();
  }

  setupNetworkListener() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      console.log("AI: Back online");
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      console.log("AI: Offline mode");
    });
  }

  async queryGemini(prompt) {
    if (!this.isOnline) {
      throw new Error("No internet connection");
    }

    if (!this.apiKey) {
      throw new Error("No API key configured");
    }

    try {
      // ✅ FIXED: Updated Gemini model name
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 150,
              topP: 0.8,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid API response format");
      }

      const aiResponse = data.candidates[0].content.parts[0].text.trim();

      // Save to conversation history
      this.conversationHistory.push({
        user: prompt.substring(0, 100),
        ai: aiResponse,
        time: new Date().toISOString(),
      });

      // Keep history manageable
      if (this.conversationHistory.length > 10) {
        this.conversationHistory.shift();
      }

      return aiResponse;
    } catch (error) {
      console.error("Gemini API error:", error);
      throw error;
    }
  }

  async handleCommand(command, context) {
    const stats = this.getStatsText(context);

    const prompt = `You are Coach Flow, an enthusiastic AI running coach. Be motivational, concise, and helpful.

Current run stats: ${stats}

User says: "${command}"

Important rules:
1. If user wants to stop/end the run, respond with exactly: "Stopping your run now! Great job today!"
2. If asking for distance/pace/time, include the exact numbers from stats above
3. Keep responses under 2 sentences
4. Be positive and encouraging
5. If user asks for advice, give specific, actionable tips
6. End with a motivational phrase or emoji if appropriate

Response:`;

    return await this.queryGemini(prompt);
  }

  async getRunSummary(distance, time, pace) {
    const prompt = `The user just completed a run. Give a motivational summary.

Run completed:
- Distance: ${distance.toFixed(2)} km
- Time: ${formatTime(time)}
- Pace: ${pace} per km

Give a 2-sentence summary that's positive and encouraging. Include a fun fact or achievement if appropriate. End with a motivational phrase.

Summary:`;

    return await this.queryGemini(prompt);
  }

  getStatsText(context) {
    const distance = context.distance.toFixed(2);
    const time = formatTime(context.time);
    const pace = calculatePace(context.distance, context.time);

    return `Distance: ${distance} km, Time: ${time}, Pace: ${pace}/km, Status: ${context.isRunning ? "Running" : "Stopped"}`;
  }
}

// ==================== UI FUNCTIONS ====================

// Update UI with Audio Cues
function updateUI() {
  // Update distance
  distanceEl.textContent = totalDistance.toFixed(2);

  // Update time
  if (startTime) {
    const time = calculateTimeElapsed();
    timeEl.textContent = formatTime(time);

    // Update pace if we have reasonable distance
    if (totalDistance > 0.01) {
      const pace = calculatePace(totalDistance, time);
      paceEl.textContent = pace;

      // Update speed (km/h)
      const hours = time / 3600000;
      const speed = hours > 0 ? totalDistance / hours : 0;
      speedEl.textContent = speed.toFixed(1);

      // Update calories (rough estimate: 60 cal/km)
      const calories = Math.round(totalDistance * 60);
      caloriesEl.textContent = calories;
    }
  }

  // Audio cues for milestones
  checkAudioCues();
}

// Audio Cues
function checkAudioCues() {
  if (!isRunning) return;

  const currentKm = Math.floor(totalDistance);

  // Kilometer announcements
  if (currentKm > lastAnnouncedKm && currentKm > 0) {
    const pace = calculatePace(totalDistance, calculateTimeElapsed());

    if (useAI && aiCoach && aiCoach.isOnline) {
      // Let AI handle milestone announcement
      aiCoach
        .handleCommand(`I just reached ${currentKm} kilometers`, {
          distance: totalDistance,
          time: calculateTimeElapsed(),
          isRunning: true,
        })
        .then((response) => speak(response))
        .catch(() => speakBasicMilestone(currentKm, pace));
    } else {
      speakBasicMilestone(currentKm, pace);
    }

    lastAnnouncedKm = currentKm;
  }
}

function speakBasicMilestone(km, pace) {
  speak(
    `${km} kilometer${km > 1 ? "s" : ""} completed! Current pace: ${pace}.`,
  );
}

// Helper Functions
function calculateTimeElapsed() {
  return startTime ? Date.now() - startTime : 0;
}

function calculatePace(distanceKm, timeMs) {
  if (distanceKm < 0.01) return "0:00";
  const minPerKm = timeMs / 60000 / distanceKm;
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function speak(text) {
  if (!window.speechSynthesis) {
    console.log("TTS:", text);
    return;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Find a good voice
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) {
    const preferredVoice =
      voices.find((v) => v.lang.includes("en") && v.name.includes("Female")) ||
      voices.find((v) => v.lang.includes("en")) ||
      voices[0];
    utterance.voice = preferredVoice;
  }

  speechSynthesis.speak(utterance);
}

// Save Run History
function saveRunHistory() {
  const run = {
    date: new Date().toISOString(),
    distance: parseFloat(totalDistance.toFixed(2)),
    time: calculateTimeElapsed(),
    pace: calculatePace(totalDistance, calculateTimeElapsed()),
  };

  const history = JSON.parse(localStorage.getItem("runHistory") || "[]");
  history.push(run);
  localStorage.setItem("runHistory", JSON.stringify(history.slice(-50)));

  console.log("Run saved to history:", run);
}

// Update Timer
function updateTimer() {
  if (!isRunning) return;
  updateUI();
  setTimeout(updateTimer, 1000);
}

// Network Status Indicator
function setupNetworkStatus() {
  const statusDiv = document.createElement("div");
  statusDiv.id = "networkStatus";
  statusDiv.className = navigator.onLine
    ? "network-status online"
    : "network-status offline";
  statusDiv.title = navigator.onLine
    ? "Online - AI Available"
    : "Offline - Basic Mode Only";
  statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        z-index: 1000;
    `;

  document.body.appendChild(statusDiv);

  window.addEventListener("online", () => {
    statusDiv.className = "network-status online";
    statusDiv.title = "Online - AI Available";
    if (useAI && aiCoach) {
      aiCoach.isOnline = true;
      speak("Back online! AI Coach is ready.");
    }
  });

  window.addEventListener("offline", () => {
    statusDiv.className = "network-status offline";
    statusDiv.title = "Offline - Basic Mode Only";
    if (aiCoach) aiCoach.isOnline = false;
    if (useAI) speak("Offline. Using basic mode.");
  });
}

// PWA Install
function setupPWAInstall() {
  let deferredPrompt;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = "block";

    installBtn.addEventListener("click", () => {
      installBtn.style.display = "none";
      deferredPrompt.prompt();

      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          console.log("User installed PWA");
        }
        deferredPrompt = null;
      });
    });
  });

  window.addEventListener("appinstalled", () => {
    console.log("PWA installed successfully");
    installBtn.style.display = "none";
  });
}

// Initialize speech voices
if (speechSynthesis) {
  speechSynthesis.onvoiceschanged = () => {
    console.log("Voices loaded:", speechSynthesis.getVoices().length);
  };
}
