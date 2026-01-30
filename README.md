# 🏃 RunFlow AI — Experimental Voice Running Coach (PWA)

RunFlow AI is an experimental Progressive Web Application (PWA) that acts as a voice-controlled running coach in the browser. It combines speech recognition, GPS tracking, and AI responses to provide hands-free guidance during runs.

⚠️ Project Status: Incomplete — some features are experimental and may not work as expected.

## Features
- Voice command interface (“Hey coach”)  
- GPS-based distance and pace tracking  
- AI-generated feedback and motivational prompts  
- Installable as a PWA for offline/desktop/mobile use  
- Stores run history locally in the browser  

## Tech Stack
- Frontend: HTML5, CSS3, Vanilla JavaScript  
- Voice Input/Output: Web Speech API  
- Location Tracking: Geolocation API  
- AI Integration: Google Gemini API  
- PWA Support: Service Workers for offline caching  
- Data Storage: LocalStorage for run history  

## Setup & Usage
- Clone the repository:  
   ```bash
   git clone https://github.com/your-username/runflow-ai.git
- Configure your Gemini API key in config.js by replacing the placeholder:
  ```Javascript
  const GEMINI_API_KEY = "YOUR_API_KEY";

⚠️ Do not commit your real API key to GitHub.

- Serve locally:
  ```Bash
  python -m http.server 8000
- Open in browser:
  http://localhost:8000

Chrome is recommended for best speech and GPS support.

## How It Works
- User opens the app and grants microphone & location permissions
- User gives voice commands starting with "Hey coach"
- App tracks running metrics via GPS
- Commands are sent to Google Gemini API for AI-generated responses
- Responses are spoken aloud and displayed in the app
- Run history is saved locally in the browser

## Development Note
The project idea was mine. Implementation was largely assisted by AI tools, but I worked with, modified, and tested the code throughout. This project represents learning, experimentation, and portfolio work, not a production-ready fitness app.

## Learning Outcomes
- PWA development without frameworks
- Voice interface design and implementation
- Real-time GPS processing in JavaScript
- AI integration with web applications
- Debugging and experimental development workflow
