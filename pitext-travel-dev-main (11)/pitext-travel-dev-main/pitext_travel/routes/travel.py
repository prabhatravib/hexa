# pitext_travel/routes/travel.py
"""Travel routes and blueprint configuration."""

import os
from flask import Blueprint, render_template, jsonify, request, session
from pitext_travel.api.llm import generate_trip_itinerary
from pitext_travel.api.config import get_google_maps_config
import logging

def create_travel_blueprint(base_dir):
    """Create and configure the travel blueprint.
    
    Args:
        base_dir: Absolute path to the application directory
    
    Returns:
        Configured Flask Blueprint
    """
    travel_bp = Blueprint(
        "travel",
        __name__,
        template_folder=os.path.join(base_dir, 'templates'),
        static_folder=os.path.join(base_dir, 'static'),
        static_url_path='/static',
        url_prefix="/travel"
    )
    
    @travel_bp.route("/")
    def index():
        """Main travel planner page."""
        return render_template("map.html")
    
    @travel_bp.route("/api/config")
    def api_config():
        """Return Google Maps configuration for frontend."""
        config = get_google_maps_config()
        
        # Determine auth type and prepare response
        if config.get("api_key"):
            # API Key authentication
            return jsonify({
                "auth_type": "api_key",
                "google_maps_api_key": config["api_key"],
                "google_maps_client_id": config.get("client_id", ""),
                "client_secret_configured": bool(config.get("client_secret"))
            })
        else:
            return jsonify({
                "error": "No Google Maps API key configured"
            }), 500
    
    @travel_bp.route("/api/itinerary", methods=["GET", "POST"])
    def api_itinerary():
        """Generate or retrieve itinerary."""
        if request.method == "POST":
            # Generate new itinerary
            data = request.get_json()
            city = data.get("city", "Paris")
            days = data.get("days", 3)
            
            try:
                itinerary = {
                                "days": generate_trip_itinerary(city, days),
                                "metadata": {"city": city, "days": days}
                            }

                # Store in session
                session['current_itinerary'] = itinerary
                session['current_city'] = city
                session['current_days'] = days
                
                return jsonify(itinerary)
            except Exception as e:
                return jsonify({"error": str(e)}), 500
        else:
            # Retrieve existing itinerary from session
            itinerary = session.get('current_itinerary')
            if itinerary:
                return jsonify(itinerary)
            else:
                # Return default itinerary
                    itinerary = {
                                "days": generate_trip_itinerary("Paris", 3),
                                "metadata": {"city": "Paris", "days": 3}
                            }
            return jsonify(itinerary)
    
    @travel_bp.route("/test-namespace")
    def test_namespace():
        """Test if the /travel/ws namespace is properly registered."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Namespace Test</title></head>
        <body>
          <h1>Namespace Registration Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            add('Testing namespace registration...');
            
            // Test 1: Try to connect to /travel/ws
            add('Attempting to connect to /travel/ws...');
            const travelSocket = io('/travel/ws', { 
              path: '/socket.io/',
              transports: ['polling'],
              timeout: 5000
            });

            travelSocket.on('connect', () => {
              add('✅ SUCCESS: Connected to /travel/ws namespace');
              status.textContent = 'Namespace is working!';
              
              // Test ping
              travelSocket.emit('ping');
            });
            
            travelSocket.on('pong', (data) => {
              add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
            });
            
            travelSocket.on('connect_error', (e) => {
              add(`❌ FAILED to connect to /travel/ws: ${e.message}`);
              status.textContent = 'Namespace registration failed';
            });
            
            // Test 2: Also test default namespace
            add('Also testing default namespace...');
            const defaultSocket = io('/', { 
              path: '/socket.io/',
              transports: ['polling'],
              timeout: 5000
            });
            
            defaultSocket.on('connect', () => {
              add('⚠️ Connected to default namespace (this might be the fallback)');
            });
            
            defaultSocket.on('connect_error', (e) => {
              add(`❌ Default namespace also failed: ${e.message}`);
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/health")
    def health():
        """Health check endpoint."""
        return jsonify({"status": "ok", "service": "travel"})
    
    @travel_bp.route("/test-openai")
    def test_openai():
        """Test if Render can reach OpenAI API."""
        import requests
        import os
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "No OpenAI API key configured"}), 500
            
        try:
            # Test basic OpenAI API connectivity
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            # Simple test request
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 10
                },
                timeout=10
            )
            
            if response.status_code == 200:
                return jsonify({
                    "status": "success",
                    "message": "OpenAI API is reachable",
                    "response_time": response.elapsed.total_seconds()
                })
            else:
                return jsonify({
                    "status": "error",
                    "message": f"OpenAI API returned status {response.status_code}",
                    "response": response.text[:200]
                }), 500
                
        except requests.exceptions.Timeout:
            return jsonify({
                "status": "error",
                "message": "OpenAI API request timed out"
            }), 500
        except requests.exceptions.ConnectionError as e:
            return jsonify({
                "status": "error",
                "message": f"Connection error: {str(e)}"
            }), 500
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Unexpected error: {str(e)}"
            }), 500
    
    @travel_bp.route("/test-launch")
    def test_launch():
        """Test page for debugging launch trip functionality."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Launch Trip Test</title></head>
        <body>
          <h1>Launch Trip Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            add('Testing launch trip functionality...');
            
            // Test 1: Direct API call
            add('Testing direct API call...');
            fetch('/travel/api/itinerary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ city: 'Paris', days: 3 })
            })
            .then(response => {
                add(`API response status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                add(`API response data: ${JSON.stringify(data).substring(0, 200)}...`);
                status.textContent = 'API call successful!';
            })
            .catch(error => {
                add(`API call failed: ${error.message}`);
                status.textContent = 'API call failed';
            });
            
            // Test 2: Check if dependencies are loaded
            setTimeout(() => {
                add('Checking dependencies...');
                add(`TravelApp: ${!!window.TravelApp}`);
                add(`TravelAPI: ${!!window.TravelAPI}`);
                add(`TravelHelpers: ${!!window.TravelHelpers}`);
                add(`TravelOverlays: ${!!window.TravelOverlays}`);
                add(`TravelGoogleMaps: ${!!window.TravelGoogleMaps}`);
                add(`mapModulesReady: ${window.mapModulesReady}`);
            }, 1000);
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-realtime")
    def test_realtime():
        """Test if OpenAI Realtime API is accessible."""
        import requests
        import os
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "No OpenAI API key configured"}), 500
            
        try:
            # Test basic OpenAI API connectivity first
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            # Test regular chat API
            chat_response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 10
                },
                timeout=10
            )
            
            if chat_response.status_code != 200:
                return jsonify({
                    "status": "error",
                    "message": f"OpenAI Chat API returned status {chat_response.status_code}",
                    "response": chat_response.text[:200]
                }), 500
            
            # Test Realtime API model availability
            models_response = requests.get(
                "https://api.openai.com/v1/models",
                headers=headers,
                timeout=10
            )
            
            if models_response.status_code == 200:
                models = models_response.json()
                realtime_models = [m for m in models.get('data', []) if 'realtime' in m.get('id', '').lower()]
                
                return jsonify({
                    "status": "success",
                    "message": "OpenAI API is accessible",
                    "chat_api_working": True,
                    "realtime_models_available": len(realtime_models),
                    "realtime_model_ids": [m['id'] for m in realtime_models],
                    "config": {
                        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview-2024-12-17"),
                        "voice": os.getenv("REALTIME_VOICE", "alloy"),
                        "api_key_length": len(api_key) if api_key else 0
                    }
                })
            else:
                return jsonify({
                    "status": "error",
                    "message": f"OpenAI Models API returned status {models_response.status_code}",
                    "response": models_response.text[:200]
                }), 500
                
        except requests.exceptions.Timeout:
            return jsonify({
                "status": "error",
                "message": "OpenAI API request timed out"
            }), 500
        except requests.exceptions.ConnectionError as e:
            return jsonify({
                "status": "error",
                "message": f"Connection error: {str(e)}"
            }), 500
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Unexpected error: {str(e)}"
            }), 500
    
    @travel_bp.route("/debug-sessions")
    def debug_sessions():
        """Debug endpoint to check session manager status."""
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            
            manager = get_session_manager()
            stats = manager.get_stats()
            
            return jsonify({
                "status": "success",
                "session_manager_stats": stats,
                "active_sessions": manager.get_active_sessions(),
                "config": {
                    "max_concurrent": stats["config"]["max_concurrent"],
                    "rate_limit_per_ip": stats["config"]["rate_limit_per_ip"],
                    "timeout_seconds": stats["config"]["timeout_seconds"]
                }
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Failed to get session manager stats: {str(e)}"
            }), 500
    
    @travel_bp.route("/test-websocket")
    def test_websocket():
        """Test page for debugging WebSocket and session activation."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>WebSocket & Session Test</title></head>
        <body>
          <h1>WebSocket & Session Activation Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            add('Testing WebSocket connection and session activation...');
            
            // Test 1: Connect to WebSocket
            add('Step 1: Connecting to WebSocket...');
            const socket = io('/travel/ws', { 
              path: '/socket.io/',
              transports: ['websocket', 'polling'],
              timeout: 10000
            });

            socket.on('connect', () => {
              add('✅ WebSocket connected successfully');
              
              // Test 2: Start session
              add('Step 2: Starting session...');
              socket.emit('start_session', {});
            });
            
            socket.on('session_started', (data) => {
              add(`✅ Session started successfully: ${JSON.stringify(data)}`);
              status.textContent = 'Session activation successful!';
            });
            
            socket.on('error', (errorData) => {
              add(`❌ Error received: ${JSON.stringify(errorData)}`);
              status.textContent = 'Session activation failed';
            });
            
            socket.on('connect_error', (e) => {
              add(`❌ WebSocket connection failed: ${e.message}`);
              status.textContent = 'WebSocket connection failed';
            });
            
            // Test 3: Check API endpoints
            setTimeout(async () => {
              add('Step 3: Testing API endpoints...');
              
              try {
                const realtimeResponse = await fetch('/travel/test-realtime');
                const realtimeData = await realtimeResponse.json();
                add(`Realtime API test: ${JSON.stringify(realtimeData)}`);
              } catch (e) {
                add(`Realtime API test failed: ${e.message}`);
              }
              
              try {
                const sessionsResponse = await fetch('/travel/debug-sessions');
                const sessionsData = await sessionsResponse.json();
                add(`Sessions debug: ${JSON.stringify(sessionsData)}`);
              } catch (e) {
                add(`Sessions debug failed: ${e.message}`);
              }
            }, 2000);
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-session-activation")
    def test_session_activation():
        """Test session activation step by step to identify the failure point."""
        import os
        import time
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Check environment variables
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                add_step("Environment Variables", False, "OPENAI_API_KEY not set")
                results["error"] = "No OpenAI API key configured"
                return jsonify(results), 500
            
            if not api_key.startswith("sk-"):
                add_step("Environment Variables", False, "Invalid API key format")
                results["error"] = "Invalid API key format"
                return jsonify(results), 500
                
            add_step("Environment Variables", True, f"API key length: {len(api_key)}")
            
            # Step 2: Test basic OpenAI API connectivity
            import requests
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            try:
                response = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": "gpt-3.5-turbo",
                        "messages": [{"role": "user", "content": "Hello"}],
                        "max_tokens": 10
                    },
                    timeout=10
                )
                
                if response.status_code == 200:
                    add_step("OpenAI API Connectivity", True, f"Response time: {response.elapsed.total_seconds():.2f}s")
                else:
                    add_step("OpenAI API Connectivity", False, f"Status: {response.status_code}, Response: {response.text[:200]}")
                    results["error"] = f"OpenAI API returned status {response.status_code}"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("OpenAI API Connectivity", False, error=e)
                results["error"] = f"OpenAI API connectivity failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Check Realtime model availability
            try:
                models_response = requests.get(
                    "https://api.openai.com/v1/models",
                    headers=headers,
                    timeout=10
                )
                
                if models_response.status_code == 200:
                    models = models_response.json()
                    realtime_models = [m for m in models.get('data', []) if 'realtime' in m.get('id', '').lower()]
                    
                    if realtime_models:
                        add_step("Realtime Model Availability", True, f"Found {len(realtime_models)} realtime models")
                    else:
                        add_step("Realtime Model Availability", False, "No realtime models found")
                        results["error"] = "No realtime models available for this API key"
                        return jsonify(results), 500
                else:
                    add_step("Realtime Model Availability", False, f"Status: {models_response.status_code}")
                    results["error"] = f"Failed to check models: {models_response.status_code}"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Realtime Model Availability", False, error=e)
                results["error"] = f"Failed to check model availability: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test session manager initialization
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                manager = get_session_manager()
                add_step("Session Manager", True, f"Manager type: {type(manager)}")
            except Exception as e:
                add_step("Session Manager", False, error=e)
                results["error"] = f"Session manager initialization failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 5: Test session creation
            try:
                test_session = manager.create_session("127.0.0.1", "test_session")
                if test_session:
                    add_step("Session Creation", True, f"Session ID: {test_session.session_id}")
                    
                    # Clean up test session
                    manager.remove_session(test_session.session_id)
                else:
                    add_step("Session Creation", False, "Session creation returned None")
                    results["error"] = "Session creation failed (rate limited or capacity reached)"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Session Creation", False, error=e)
                results["error"] = f"Session creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 6: Test RealtimeClient creation
            try:
                from pitext_travel.api.realtime.client import RealtimeClient
                test_client = RealtimeClient("test_client")
                add_step("RealtimeClient Creation", True, f"Client type: {type(test_client)}")
            except Exception as e:
                add_step("RealtimeClient Creation", False, error=e)
                results["error"] = f"RealtimeClient creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 7: Test configuration loading
            try:
                from pitext_travel.api.config import get_realtime_config
                config = get_realtime_config()
                add_step("Configuration Loading", True, f"Model: {config.get('model')}, Voice: {config.get('voice')}")
            except Exception as e:
                add_step("Configuration Loading", False, error=e)
                results["error"] = f"Configuration loading failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/debug-session-activation")
    def debug_session_activation():
        """Comprehensive debug page for session activation issues."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Session Activation Debug</title></head>
        <body>
          <h1>Session Activation Debug</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            async function runTests() {
              add('Starting comprehensive session activation debug...');
              
              // Test 1: Check server-side components
              add('Step 1: Testing server-side components...');
              try {
                const activationResponse = await fetch('/travel/test-session-activation');
                const activationData = await activationResponse.json();
                
                if (activationData.success) {
                  add('✅ Server-side components working');
                  activationData.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                } else {
                  add(`❌ Server-side test failed: ${activationData.error}`);
                  activationData.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                  status.textContent = 'Server-side issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Server-side test failed: ${e.message}`);
                status.textContent = 'Server-side test failed';
                return;
              }
              
              // Test 2: Check OpenAI API
              add('Step 2: Testing OpenAI API...');
              try {
                const realtimeResponse = await fetch('/travel/test-realtime');
                const realtimeData = await realtimeResponse.json();
                
                if (realtimeData.status === 'success') {
                  add('✅ OpenAI API accessible');
                  add(`  - Chat API: ${realtimeData.chat_api_working ? '✅' : '❌'}`);
                  add(`  - Realtime models: ${realtimeData.realtime_models_available}`);
                  add(`  - Model: ${realtimeData.config.model}`);
                } else {
                  add(`❌ OpenAI API test failed: ${realtimeData.message}`);
                  status.textContent = 'OpenAI API issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ OpenAI API test failed: ${e.message}`);
                status.textContent = 'OpenAI API test failed';
                return;
              }
              
              // Test 3: Check session manager
              add('Step 3: Testing session manager...');
              try {
                const sessionsResponse = await fetch('/travel/debug-sessions');
                const sessionsData = await sessionsResponse.json();
                
                if (sessionsData.status === 'success') {
                  add('✅ Session manager working');
                  add(`  - Total sessions: ${sessionsData.session_manager_stats.total_sessions}`);
                  add(`  - Active sessions: ${sessionsData.session_manager_stats.active_sessions}`);
                  add(`  - Max concurrent: ${sessionsData.config.max_concurrent}`);
                } else {
                  add(`❌ Session manager test failed: ${sessionsData.message}`);
                  status.textContent = 'Session manager issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Session manager test failed: ${e.message}`);
                status.textContent = 'Session manager test failed';
                return;
              }
              
              // Test 4: WebSocket connection
              add('Step 4: Testing WebSocket connection...');
              if (typeof io === 'undefined') {
                add('❌ Socket.IO not loaded');
                status.textContent = 'Socket.IO not available';
                return;
              }
              
              const socket = io('/travel/ws', { 
                path: '/socket.io/',
                transports: ['websocket', 'polling'],
                timeout: 10000
              });

              const wsPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('WebSocket connection timeout'));
                }, 10000);
                
                socket.on('connect', () => {
                  clearTimeout(timeout);
                  add('✅ WebSocket connected');
                  resolve();
                });
                
                socket.on('connect_error', (e) => {
                  clearTimeout(timeout);
                  reject(new Error(`WebSocket connection failed: ${e.message}`));
                });
              });
              
              try {
                await wsPromise;
              } catch (e) {
                add(`❌ WebSocket test failed: ${e.message}`);
                status.textContent = 'WebSocket connection failed';
                return;
              }
              
              // Test 5: Session activation
              add('Step 5: Testing session activation...');
              const sessionPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Session activation timeout'));
                }, 20000);
                
                socket.on('session_started', (data) => {
                  clearTimeout(timeout);
                  add(`✅ Session activated: ${JSON.stringify(data)}`);
                  resolve(data);
                });
                
                socket.on('error', (errorData) => {
                  clearTimeout(timeout);
                  reject(new Error(`Session activation failed: ${JSON.stringify(errorData)}`));
                });
              });
              
              try {
                socket.emit('start_session', {});
                await sessionPromise;
                add('✅ All tests passed! Session activation is working.');
                status.textContent = 'Session activation working correctly';
              } catch (e) {
                add(`❌ Session activation failed: ${e.message}`);
                status.textContent = 'Session activation failed';
              }
            }
            
            runTests().catch(error => {
              add(`❌ Test suite failed: ${error.message}`);
              status.textContent = 'Test suite failed';
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-simple-websocket")
    def test_simple_websocket():
        """Simple test to verify WebSocket connection without session activation."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Simple WebSocket Test</title></head>
        <body>
          <h1>Simple WebSocket Connection Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            add('Testing simple WebSocket connection...');
            
            const socket = io('/travel/ws', { 
              path: '/socket.io/',
              transports: ['websocket', 'polling'],
              timeout: 10000
            });

            socket.on('connect', () => {
              add('✅ WebSocket connected successfully');
              status.textContent = 'WebSocket connection working!';
              
              // Test basic ping/pong
              socket.emit('ping');
            });
            
            socket.on('pong', (data) => {
              add(`✅ Ping/pong working: ${JSON.stringify(data)}`);
            });
            
            socket.on('connect_error', (e) => {
              add(`❌ WebSocket connection failed: ${e.message}`);
              status.textContent = 'WebSocket connection failed';
            });
            
            socket.on('error', (errorData) => {
              add(`❌ Error event received: ${JSON.stringify(errorData)}`);
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-session-creation")
    def test_session_creation():
        """Test session creation step by step to identify the failure point."""
        import os
        import time
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Check environment variables
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                add_step("Environment Variables", False, "OPENAI_API_KEY not set")
                results["error"] = "No OpenAI API key configured"
                return jsonify(results), 500
            
            if not api_key.startswith("sk-"):
                add_step("Environment Variables", False, "Invalid API key format")
                results["error"] = "Invalid API key format"
                return jsonify(results), 500
                
            add_step("Environment Variables", True, f"API key length: {len(api_key)}")
            
            # Step 2: Test imports
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                add_step("Session Manager Import", True, "Import successful")
            except Exception as e:
                add_step("Session Manager Import", False, error=e)
                results["error"] = f"Session manager import failed: {str(e)}"
                return jsonify(results), 500
            
            try:
                from pitext_travel.api.realtime.client import RealtimeClient
                add_step("RealtimeClient Import", True, "Import successful")
            except Exception as e:
                add_step("RealtimeClient Import", False, error=e)
                results["error"] = f"RealtimeClient import failed: {str(e)}"
                return jsonify(results), 500
            
            try:
                from pitext_travel.api.realtime.audio_handler import AudioHandler
                add_step("AudioHandler Import", True, "Import successful")
            except Exception as e:
                add_step("AudioHandler Import", False, error=e)
                results["error"] = f"AudioHandler import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test configuration loading
            try:
                from pitext_travel.api.config import get_realtime_config, get_openai_api_key
                config = get_realtime_config()
                api_key = get_openai_api_key()
                add_step("Configuration Loading", True, f"Config keys: {list(config.keys())}")
            except Exception as e:
                add_step("Configuration Loading", False, error=e)
                results["error"] = f"Configuration loading failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test session manager creation
            try:
                manager = get_session_manager()
                add_step("Session Manager Creation", True, f"Manager type: {type(manager)}")
            except Exception as e:
                add_step("Session Manager Creation", False, error=e)
                results["error"] = f"Session manager creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 5: Test RealtimeClient creation
            try:
                test_client = RealtimeClient("test_client")
                add_step("RealtimeClient Creation", True, f"Client type: {type(test_client)}")
            except Exception as e:
                add_step("RealtimeClient Creation", False, error=e)
                results["error"] = f"RealtimeClient creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 6: Test AudioHandler creation
            try:
                test_audio = AudioHandler()
                add_step("AudioHandler Creation", True, f"AudioHandler type: {type(test_audio)}")
            except Exception as e:
                add_step("AudioHandler Creation", False, error=e)
                results["error"] = f"AudioHandler creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 7: Test session creation
            try:
                test_session = manager.create_session("127.0.0.1", "test_session")
                if test_session:
                    add_step("Session Creation", True, f"Session ID: {test_session.session_id}")
                    
                    # Clean up test session
                    manager.remove_session(test_session.session_id)
                else:
                    add_step("Session Creation", False, "Session creation returned None")
                    results["error"] = "Session creation failed (rate limited or capacity reached)"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Session Creation", False, error=e)
                results["error"] = f"Session creation failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-session-creation-page")
    def test_session_creation_page():
        """Test page for debugging session creation issues."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Session Creation Debug</title></head>
        <body>
          <h1>Session Creation Debug</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            async function runTests() {
              add('Starting session creation debug...');
              
              // Test 1: Check server-side components
              add('Step 1: Testing server-side components...');
              try {
                const response = await fetch('/travel/test-session-creation');
                const data = await response.json();
                
                if (data.success) {
                  add('✅ Server-side components working');
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                } else {
                  add(`❌ Server-side test failed: ${data.error}`);
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                  status.textContent = 'Server-side issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Server-side test failed: ${e.message}`);
                status.textContent = 'Server-side test failed';
                return;
              }
              
              // Test 2: Check WebSocket connection
              add('Step 2: Testing WebSocket connection...');
              if (typeof io === 'undefined') {
                add('❌ Socket.IO not loaded');
                status.textContent = 'Socket.IO not available';
                return;
              }
              
              const socket = io('/travel/ws', { 
                path: '/socket.io/',
                transports: ['websocket', 'polling'],
                timeout: 10000
              });

              const wsPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('WebSocket connection timeout'));
                }, 10000);
                
                socket.on('connect', () => {
                  clearTimeout(timeout);
                  add('✅ WebSocket connected');
                  resolve();
                });
                
                socket.on('connect_error', (e) => {
                  clearTimeout(timeout);
                  reject(new Error(`WebSocket connection failed: ${e.message}`));
                });
              });
              
              try {
                await wsPromise;
              } catch (e) {
                add(`❌ WebSocket test failed: ${e.message}`);
                status.textContent = 'WebSocket connection failed';
                return;
              }
              
              // Test 3: Test session creation via WebSocket
              add('Step 3: Testing session creation via WebSocket...');
              const sessionPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Session creation timeout'));
                }, 20000);
                
                socket.on('session_started', (data) => {
                  clearTimeout(timeout);
                  add(`✅ Session created: ${JSON.stringify(data)}`);
                  resolve(data);
                });
                
                socket.on('error', (errorData) => {
                  clearTimeout(timeout);
                  reject(new Error(`Session creation failed: ${JSON.stringify(errorData)}`));
                });
              });
              
              try {
                socket.emit('start_session', {});
                await sessionPromise;
                add('✅ All tests passed! Session creation is working.');
                status.textContent = 'Session creation working correctly';
              } catch (e) {
                add(`❌ Session creation failed: ${e.message}`);
                status.textContent = 'Session creation failed';
              }
            }
            
            runTests().catch(error => {
              add(`❌ Test suite failed: ${error.message}`);
              status.textContent = 'Test suite failed';
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-realtime-client")
    def test_realtime_client():
        """Test RealtimeClient initialization step by step to identify the failure point."""
        import os
        import time
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Check environment variables
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                add_step("Environment Variables", False, "OPENAI_API_KEY not set")
                results["error"] = "No OpenAI API key configured"
                return jsonify(results), 500
            
            if not api_key.startswith("sk-"):
                add_step("Environment Variables", False, "Invalid API key format")
                results["error"] = "Invalid API key format"
                return jsonify(results), 500
                
            add_step("Environment Variables", True, f"API key length: {len(api_key)}")
            
            # Step 2: Test config loading
            try:
                from pitext_travel.api.config import get_realtime_config, get_openai_api_key
                config = get_realtime_config()
                api_key = get_openai_api_key()
                add_step("Configuration Loading", True, f"Config keys: {list(config.keys())}")
            except Exception as e:
                add_step("Configuration Loading", False, error=e)
                results["error"] = f"Configuration loading failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test imports
            try:
                from pitext_travel.api.realtime.client import RealtimeClient
                add_step("RealtimeClient Import", True, "Import successful")
            except Exception as e:
                add_step("RealtimeClient Import", False, error=e)
                results["error"] = f"RealtimeClient import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test RealtimeClient creation
            try:
                test_client = RealtimeClient("test_client")
                add_step("RealtimeClient Creation", True, f"Client type: {type(test_client)}")
            except Exception as e:
                add_step("RealtimeClient Creation", False, error=e)
                results["error"] = f"RealtimeClient creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 5: Test AudioHandler import and creation
            try:
                from pitext_travel.api.realtime.audio_handler import AudioHandler
                test_audio = AudioHandler()
                add_step("AudioHandler Creation", True, f"AudioHandler type: {type(test_audio)}")
            except Exception as e:
                add_step("AudioHandler Creation", False, error=e)
                results["error"] = f"AudioHandler creation failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-realtime-client-page")
    def test_realtime_client_page():
        """Test page for debugging RealtimeClient initialization issues."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>RealtimeClient Debug</title></head>
        <body>
          <h1>RealtimeClient Initialization Debug</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            async function runTests() {
              add('Starting RealtimeClient initialization debug...');
              
              // Test 1: Check server-side components
              add('Step 1: Testing server-side components...');
              try {
                const response = await fetch('/travel/test-realtime-client');
                const data = await response.json();
                
                if (data.success) {
                  add('✅ Server-side components working');
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                } else {
                  add(`❌ Server-side test failed: ${data.error}`);
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                  status.textContent = 'Server-side issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Server-side test failed: ${e.message}`);
                status.textContent = 'Server-side test failed';
                return;
              }
              
              // Test 2: Check session creation
              add('Step 2: Testing session creation...');
              try {
                const response = await fetch('/travel/test-session-creation');
                const data = await response.json();
                
                if (data.success) {
                  add('✅ Session creation working');
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                } else {
                  add(`❌ Session creation failed: ${data.error}`);
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''}`);
                  });
                  status.textContent = 'Session creation issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Session creation test failed: ${e.message}`);
                status.textContent = 'Session creation test failed';
                return;
              }
              
              add('✅ All tests passed! RealtimeClient initialization is working.');
              status.textContent = 'RealtimeClient initialization working correctly';
            }
            
            runTests().catch(error => {
              add(`❌ Test suite failed: ${error.message}`);
              status.textContent = 'Test suite failed';
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-hang-point")
    def test_hang_point():
        """Test to identify exactly where the RealtimeClient initialization hangs."""
        import time
        import os
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None, duration=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "duration": duration,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Check environment variables
            start_time = time.time()
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                add_step("Environment Variables", False, "OPENAI_API_KEY not set", duration=time.time() - start_time)
                results["error"] = "No OpenAI API key configured"
                return jsonify(results), 500
            add_step("Environment Variables", True, f"API key length: {len(api_key)}", duration=time.time() - start_time)
            
            # Step 2: Test config loading
            start_time = time.time()
            try:
                from pitext_travel.api.config import get_realtime_config
                config = get_realtime_config()
                add_step("Config Loading", True, f"Config loaded in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Config Loading", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Config loading failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test RealtimeClient import
            start_time = time.time()
            try:
                from pitext_travel.api.realtime.client import RealtimeClient
                add_step("RealtimeClient Import", True, f"Import successful in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("RealtimeClient Import", False, error=e, duration=time.time() - start_time)
                results["error"] = f"RealtimeClient import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test RealtimeClient creation step by step
            start_time = time.time()
            try:
                # Test just the constructor without config loading
                test_client = RealtimeClient.__new__(RealtimeClient)
                test_client.session_id = "test"
                add_step("RealtimeClient Object Creation", True, f"Object created in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("RealtimeClient Object Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"RealtimeClient object creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 5: Test full RealtimeClient initialization
            start_time = time.time()
            try:
                test_client = RealtimeClient("test_client")
                add_step("Full RealtimeClient Init", True, f"Full init in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Full RealtimeClient Init", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Full RealtimeClient initialization failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-session-lock")
    def test_session_lock():
        """Test session manager lock functionality."""
        import time
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None, duration=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "duration": duration,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Test session manager import
            start_time = time.time()
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                add_step("Session Manager Import", True, f"Import successful in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Session Manager Import", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session manager import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 2: Test session manager creation
            start_time = time.time()
            try:
                manager = get_session_manager()
                add_step("Session Manager Creation", True, f"Manager type: {type(manager)}", duration=time.time() - start_time)
            except Exception as e:
                add_step("Session Manager Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session manager creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test lock acquisition
            start_time = time.time()
            try:
                # Test if we can acquire the lock
                acquired = manager.lock.acquire(timeout=2)
                if acquired:
                    manager.lock.release()
                    add_step("Lock Acquisition", True, f"Lock acquired and released in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
                else:
                    add_step("Lock Acquisition", False, "Lock acquisition timeout", duration=time.time() - start_time)
                    results["error"] = "Lock acquisition timeout"
                    return jsonify(results), 500
            except Exception as e:
                add_step("Lock Acquisition", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Lock acquisition failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test session creation
            start_time = time.time()
            try:
                test_session = manager.create_session("127.0.0.1", "test_session_lock")
                if test_session:
                    add_step("Session Creation", True, f"Session ID: {test_session.session_id}", duration=time.time() - start_time)
                    
                    # Clean up test session
                    manager.remove_session(test_session.session_id)
                else:
                    add_step("Session Creation", False, "Session creation returned None", duration=time.time() - start_time)
                    results["error"] = "Session creation failed (returned None)"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Session Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session creation failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-session-lock-page")
    def test_session_lock_page():
        """Test page for debugging session lock issues."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Session Lock Debug</title></head>
        <body>
          <h1>Session Lock Debug</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            async function runTests() {
              add('Starting session lock debug...');
              
              // Test 1: Check server-side lock functionality
              add('Step 1: Testing server-side lock functionality...');
              try {
                const response = await fetch('/travel/test-session-lock');
                const data = await response.json();
                
                if (data.success) {
                  add('✅ Server-side lock functionality working');
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''} (${step.duration?.toFixed(2)}s)`);
                  });
                } else {
                  add(`❌ Server-side lock test failed: ${data.error}`);
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''} (${step.duration?.toFixed(2)}s)`);
                  });
                  status.textContent = 'Server-side lock issue detected';
                  return;
                }
              } catch (e) {
                add(`❌ Server-side lock test failed: ${e.message}`);
                status.textContent = 'Server-side lock test failed';
                return;
              }
              
              // Test 2: Check WebSocket connection
              add('Step 2: Testing WebSocket connection...');
              if (typeof io === 'undefined') {
                add('❌ Socket.IO not loaded');
                status.textContent = 'Socket.IO not available';
                return;
              }
              
              const socket = io('/travel/ws', { 
                path: '/socket.io/',
                transports: ['websocket', 'polling'],
                timeout: 10000
              });

              const wsPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('WebSocket connection timeout'));
                }, 10000);
                
                socket.on('connect', () => {
                  clearTimeout(timeout);
                  add('✅ WebSocket connected');
                  resolve();
                });
                
                socket.on('connect_error', (e) => {
                  clearTimeout(timeout);
                  reject(new Error(`WebSocket connection failed: ${e.message}`));
                });
              });
              
              try {
                await wsPromise;
              } catch (e) {
                add(`❌ WebSocket test failed: ${e.message}`);
                status.textContent = 'WebSocket connection failed';
                return;
              }
              
              // Test 3: Test session creation via WebSocket
              add('Step 3: Testing session creation via WebSocket...');
              const sessionPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Session creation timeout'));
                }, 20000);
                
                socket.on('session_started', (data) => {
                  clearTimeout(timeout);
                  add(`✅ Session created: ${JSON.stringify(data)}`);
                  resolve(data);
                });
                
                socket.on('error', (errorData) => {
                  clearTimeout(timeout);
                  reject(new Error(`Session creation failed: ${JSON.stringify(errorData)}`));
                });
              });
              
              try {
                socket.emit('start_session', {});
                await sessionPromise;
                add('✅ All tests passed! Session lock is working correctly.');
                status.textContent = 'Session lock working correctly';
              } catch (e) {
                add(`❌ Session creation failed: ${e.message}`);
                status.textContent = 'Session creation failed';
              }
            }
            
            runTests().catch(error => {
              add(`❌ Test suite failed: ${error.message}`);
              status.textContent = 'Test suite failed';
            });
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-minimal-session")
    def test_minimal_session():
        """Minimal test to identify exactly where session creation hangs."""
        import time
        import os
        import logging
        
        logger = logging.getLogger(__name__)
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None, duration=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "duration": duration,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Check environment
            start_time = time.time()
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                add_step("Environment", False, "No API key", duration=time.time() - start_time)
                results["error"] = "No API key"
                return jsonify(results), 500
            add_step("Environment", True, f"API key: {len(api_key)} chars", duration=time.time() - start_time)
            
            # Step 2: Test config loading
            start_time = time.time()
            try:
                from pitext_travel.api.config import get_realtime_config
                config = get_realtime_config()
                add_step("Config Loading", True, f"Config loaded in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Config Loading", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Config failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test session manager import
            start_time = time.time()
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                add_step("Manager Import", True, f"Import in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Manager Import", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Manager import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 4: Test session manager creation
            start_time = time.time()
            try:
                manager = get_session_manager()
                add_step("Manager Creation", True, f"Created in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Manager Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Manager creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 5: Test lock acquisition
            start_time = time.time()
            try:
                acquired = manager.lock.acquire(timeout=2)
                if acquired:
                    manager.lock.release()
                    add_step("Lock Test", True, f"Lock works in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
                else:
                    add_step("Lock Test", False, "Lock timeout", duration=time.time() - start_time)
                    results["error"] = "Lock timeout"
                    return jsonify(results), 500
            except Exception as e:
                add_step("Lock Test", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Lock test failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 6: Test session creation (this is where it hangs)
            start_time = time.time()
            try:
                logger.info("🔧 About to call create_session...")
                test_session = manager.create_session("127.0.0.1", "test_minimal")
                logger.info(f"🔧 create_session returned: {test_session}")
                
                if test_session:
                    add_step("Session Creation", True, f"Created in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
                    # Clean up
                    manager.remove_session(test_session.session_id)
                else:
                    add_step("Session Creation", False, "Returned None", duration=time.time() - start_time)
                    results["error"] = "Session creation returned None"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Session Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session creation failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-minimal-session-page")
    def test_minimal_session_page():
        """Test page for the minimal session test."""
        return """
        <!DOCTYPE html>
        <html>
        <head><title>Minimal Session Test</title></head>
        <body>
          <h1>Minimal Session Creation Test</h1>
          <div id="status">Testing...</div>
          <div id="log"></div>
          
          <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            function add(msg){ log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`; }

            async function runTest() {
              add('Starting minimal session creation test...');
              
              try {
                const response = await fetch('/travel/test-minimal-session');
                const data = await response.json();
                
                if (data.success) {
                  add('✅ All tests passed!');
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''} (${step.duration?.toFixed(2)}s)`);
                  });
                  status.textContent = 'Session creation working correctly';
                } else {
                  add(`❌ Test failed: ${data.error}`);
                  data.steps.forEach(step => {
                    add(`  - ${step.name}: ${step.success ? '✅' : '❌'} ${step.details || step.error || ''} (${step.duration?.toFixed(2)}s)`);
                  });
                  status.textContent = 'Session creation failed';
                }
              } catch (e) {
                add(`❌ Test failed: ${e.message}`);
                status.textContent = 'Test failed';
              }
            }
            
            runTest();
          </script>
        </body>
        </html>
        """
    
    @travel_bp.route("/test-deadlock-fix")
    def test_deadlock_fix():
        """Test to verify the deadlock fix in session creation."""
        import time
        
        results = {
            "timestamp": time.time(),
            "steps": [],
            "success": False,
            "error": None
        }
        
        def add_step(name, success, details=None, error=None, duration=None):
            results["steps"].append({
                "name": name,
                "success": success,
                "details": details,
                "error": str(error) if error else None,
                "duration": duration,
                "timestamp": time.time()
            })
        
        try:
            # Step 1: Test session manager import
            start_time = time.time()
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                add_step("Session Manager Import", True, f"Import successful in {time.time() - start_time:.2f}s", duration=time.time() - start_time)
            except Exception as e:
                add_step("Session Manager Import", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session manager import failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 2: Test session manager creation
            start_time = time.time()
            try:
                manager = get_session_manager()
                add_step("Session Manager Creation", True, f"Manager type: {type(manager)}", duration=time.time() - start_time)
            except Exception as e:
                add_step("Session Manager Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Session manager creation failed: {str(e)}"
                return jsonify(results), 500
            
            # Step 3: Test multiple session creations (this would have caused deadlock before)
            start_time = time.time()
            try:
                # Create multiple sessions quickly to test for deadlock
                sessions = []
                for i in range(3):
                    session = manager.create_session(f"127.0.0.{i}", f"test_session_{i}")
                    if session:
                        sessions.append(session)
                        add_step(f"Session Creation {i+1}", True, f"Session ID: {session.session_id}", duration=time.time() - start_time)
                    else:
                        add_step(f"Session Creation {i+1}", False, "Session creation returned None", duration=time.time() - start_time)
                
                # Clean up test sessions
                for session in sessions:
                    manager.remove_session(session.session_id)
                
                if len(sessions) > 0:
                    add_step("Multiple Session Creation", True, f"Created {len(sessions)} sessions without deadlock", duration=time.time() - start_time)
                else:
                    add_step("Multiple Session Creation", False, "No sessions created", duration=time.time() - start_time)
                    results["error"] = "No sessions were created"
                    return jsonify(results), 500
                    
            except Exception as e:
                add_step("Multiple Session Creation", False, error=e, duration=time.time() - start_time)
                results["error"] = f"Multiple session creation failed: {str(e)}"
                return jsonify(results), 500
            
            results["success"] = True
            return jsonify(results)
            
        except Exception as e:
            results["error"] = f"Unexpected error: {str(e)}"
            return jsonify(results), 500
    
    @travel_bp.route("/test-audio-generation")
    def test_audio_generation():
        """Test endpoint to trigger audio generation test."""
        try:
            from pitext_travel.api.realtime.session_manager import get_session_manager
            
            manager = get_session_manager()
            
            # Get the most recent session for testing
            active_sessions = manager.get_active_sessions()
            if not active_sessions:
                return jsonify({
                    "status": "error",
                    "message": "No active sessions found"
                }), 404
            
            # Use the first active session
            session_id = list(active_sessions.keys())[0]
            session = manager.get_session(session_id)
            
            if not session or not session.client:
                return jsonify({
                    "status": "error",
                    "message": "Session not found or client not available"
                }), 404
            
            # Test audio generation
            result = session.client.test_audio_generation()
            
            return jsonify({
                "status": "success",
                "message": "Audio generation test triggered",
                "session_id": session_id,
                "result": result
            })
            
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Test failed: {str(e)}"
            }), 500
    
    return travel_bp


# Export for backward compatibility
__all__ = ['create_travel_blueprint']