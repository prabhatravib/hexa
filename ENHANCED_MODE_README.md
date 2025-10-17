  # Enhanced Mode - Chat Panel with Dynamic Feature Count Buttons

  ## Overview

  The Enhanced Mode is an advanced version of the Hexa Voice Agent's chat panel that includes **dynamic numbered aspect buttons** (2-10 configurable) for organizing conversations by different contexts or features. The system supports **PostMessage communication** for iframe integration, allowing parent websites to dynamically control the number of aspect buttons.

  ## What is Enhanced Mode?

Enhanced Mode transforms the standard chat panel by adding:

- **Dynamic Aspect Selection Buttons** (numbered 1-N, where N is 2-10) in the chat panel header
- **Per-aspect message organization** - each aspect maintains its own conversation history
- **Context isolation** - conversations in different aspects are kept separate
- **Visual indicators** - active aspect is highlighted with blue background and scale effect
- **Tooltip descriptions** - hover over buttons to see aspect descriptions
- **Automatic context injection** - clicking an aspect button injects context into the voice session
- **PostMessage API** - parent websites can control aspect count and descriptions via iframe communication
- **Real-time updates** - aspect count and configuration can be changed dynamically without page reload

  ## How It Works

  ### URL-Based Routing

  The enhanced mode is activated through **URL routing**:

  - **Normal Mode**: `https://hexa-worker.prabhatravib.workers.dev/`
  - **Enhanced Mode**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode`

### PostMessage Communication

The system supports **dynamic aspect count control** and **aspect configuration** via PostMessage API:

#### Simple Aspect Count (Backward Compatible)
```javascript
// Parent website sends aspect count to iframe
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_COUNT',
  aspectCount: 5  // 2-10 range
}, 'https://hexa-worker.prabhatravib.workers.dev');
```

#### Advanced Aspect Configuration (New Feature)
```javascript
// Parent website sends aspect configuration with descriptions
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_CONFIG',
  aspectCount: 4,
  aspects: [
    { id: 1, description: "Technical support - help with bugs and issues" },
    { id: 2, description: "Sales inquiries - pricing and features" },
    { id: 3, description: "Billing questions - payments and accounts" },
    { id: 4, description: "General information - company and products" }
  ]
}, 'https://hexa-worker.prabhatravib.workers.dev');
```

  ### Technical Implementation

  1. **URL Detection**: The React app detects if "enhancedMode" is in the URL path
  2. **PostMessage Listener**: Listens for both `SET_ASPECT_COUNT` and `SET_ASPECT_CONFIG` messages from parent websites
  3. **Dynamic Rendering**: Aspect buttons are generated dynamically based on received count
  4. **State Management**: Each aspect (1-N) maintains separate:
    - Voice message history
    - Text message history
    - Conversation context
    - Aspect-specific descriptions and metadata
  5. **Validation**: 
    - Aspect count is validated (2-10 range) with fallback to default (7)
    - Aspect configurations are validated for sequential IDs and non-empty descriptions
  6. **Context Injection**: Automatic injection of aspect context into voice sessions when switching aspects
  7. **Tooltip System**: CSS-based tooltips showing aspect descriptions on hover

  ## Features

  ### Aspect Selection UI
  ```
  ┌─────────────────────────────────────┐
  │  🎤 Voice chat  💬 Text chat       │  ← Tabs (unchanged)
  ├─────────────────────────────────────┤
  │  [1] [2] [3] [4] [5] [6] [7] [8]    │  ← Dynamic aspect buttons (2-10)
  │  ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲  │  ← Tooltips on hover
  │  1 2 3 4 5 6 7 8 ← Active aspect     │
  │  ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑ ↑  │
  │  Hover for descriptions              │
  └─────────────────────────────────────┘
  ```

  ### Tooltip Behavior
  - **Hover Activation**: Tooltips appear when hovering over aspect buttons
  - **Description Display**: Shows custom descriptions or fallback "Aspect N" text
  - **Positioning**: Tooltips appear above buttons with arrow indicators
  - **Styling**: Dark background with white text, rounded corners, shadow
  - **Responsive**: Tooltips adapt to content length with max-width constraints

  ### Dynamic Button Generation
  - **Default Count**: 7 buttons (maintains backward compatibility)
  - **Configurable Range**: 2-10 buttons via PostMessage
  - **Single Row Layout**: All buttons fit in one row regardless of count
  - **Real-time Updates**: Buttons update immediately when count changes
  - **State Preservation**: Existing messages are preserved when count changes
  - **Description Support**: Buttons can display custom descriptions via tooltips
  - **Context Awareness**: Each button can inject specific context into voice sessions

  ### Context Injection System
  - **Automatic Trigger**: Context injection occurs when clicking aspect buttons
  - **Context Format**: Structured messages injected into voice session
  - **AI Adaptation**: Voice agent adapts responses based on injected context
  - **Session Integration**: Uses existing external context injection system
  - **Error Handling**: Graceful fallback if injection fails
  - **Logging**: Console logging for debugging context injection

  ### Visual States
  - **Active Aspect**: Blue background, white text, shadow, scale effect
  - **Inactive Aspects**: Gray background, hover effects
  - **Tooltip Display**: Dark tooltips with descriptions on hover
  - **Status Text**: Shows "Enhanced Mode - Ready" when active

  ## Usage Examples

  ### Basic Usage (Normal Mode)
  ```tsx
  <ChatPanel
    transcript={transcript}
    response={response}
    onSendMessage={handleSendMessage}
    isAgentReady={isReady}
  />
  // Shows standard chat panel without aspect buttons
  ```

  ### Enhanced Mode (Default 7 Buttons)
  ```tsx
  <ChatPanel
    transcript={transcript}
    response={response}
    onSendMessage={handleSendMessage}
    isAgentReady={isReady}
    enhancedMode={true}
  />
  // Shows chat panel with 1-7 aspect selection buttons
  ```

  ### Dynamic Aspect Count via PostMessage
  ```javascript
  // Parent website controls aspect count
  const iframe = document.getElementById('hexa-iframe');

  // Set 5 aspect buttons
  iframe.contentWindow.postMessage({
    type: 'SET_ASPECT_COUNT',
    aspectCount: 5
  }, 'https://hexa-worker.prabhatravib.workers.dev');

  // Set 8 aspect buttons
  iframe.contentWindow.postMessage({
    type: 'SET_ASPECT_COUNT',
    aspectCount: 8
  }, 'https://hexa-worker.prabhatravib.workers.dev');
  ```

  ### Advanced Aspect Configuration
  ```javascript
  // Parent website sends detailed aspect configuration
  const iframe = document.getElementById('hexa-iframe');

  // E-commerce configuration example
  iframe.contentWindow.postMessage({
    type: 'SET_ASPECT_CONFIG',
    aspectCount: 6,
    aspects: [
      { id: 1, description: "Product information - specifications and features" },
      { id: 2, description: "Order support - tracking and delivery" },
      { id: 3, description: "Returns and refunds - policy and process" },
      { id: 4, description: "Account management - profile and settings" },
      { id: 5, description: "Payment issues - billing and transactions" },
      { id: 6, description: "General questions - store policies and FAQ" }
    ]
  }, 'https://hexa-worker.prabhatravib.workers.dev');

  // Healthcare configuration example
  iframe.contentWindow.postMessage({
    type: 'SET_ASPECT_CONFIG',
    aspectCount: 5,
    aspects: [
      { id: 1, description: "Appointment scheduling - book and manage visits" },
      { id: 2, description: "Medical records - access and update information" },
      { id: 3, description: "Insurance and billing - coverage and payments" },
      { id: 4, description: "Prescription refills - medication requests" },
      { id: 5, description: "General health questions - symptoms and advice" }
    ]
  }, 'https://hexa-worker.prabhatravib.workers.dev');
  ```

  ### Iframe Integration
  ```html
  <!-- Basic iframe with default 7 buttons -->
  <iframe 
    src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode"
    width="400" 
    height="600">
  </iframe>

  <!-- Dynamic control via JavaScript -->
  <script>
  const iframe = document.getElementById('hexa-iframe');
  iframe.contentWindow.postMessage({
    type: 'SET_ASPECT_COUNT',
    aspectCount: 6
  }, 'https://hexa-worker.prabhatravib.workers.dev');
  </script>
  ```

  ## Implementation Details

  ### File Structure
  ```
  src/
  ├── components/
  │   └── ChatPanel.tsx           # Main component with enhanced mode logic
  ├── App.tsx                     # URL detection and enhancedMode prop passing
  └── worker-voice/
      └── index.ts                # SPA routing for /enhancedMode URL
  ```

  ### Key Components

  #### URL Detection & PostMessage Listener (App.tsx)
  ```typescript
  // URL detection for enhanced mode
  const checkEnhancedMode = () => {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const enhancedModeDetected = pathSegments.includes('enhancedMode');
    setIsEnhancedMode(enhancedModeDetected);
  };

  // PostMessage listener for dynamic aspect count
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SET_ASPECT_COUNT') {
        const count = event.data.aspectCount;
        // Validate count is between 2-10
        if (count >= 2 && count <= 10) {
          setAspectCount(count);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  ```

  #### Dynamic Enhanced Mode Logic (ChatPanel.tsx)
  ```typescript
  // Aspect configuration interface
  interface AspectConfig {
    id: number;
    description: string;
  }

  // Dynamic aspect count prop with configuration
  interface ChatPanelProps {
    // ... other props
    aspectCount?: number; // Number of aspect buttons (2-10, default 7)
    aspectConfigs?: AspectConfig[]; // Configuration for aspect buttons with descriptions
  }

  // Dynamic state initialization
  const [aspectMessages, setAspectMessages] = useState<Record<AspectNumber, AspectMessages>>(() => {
    const messages: Record<AspectNumber, AspectMessages> = {} as Record<AspectNumber, AspectMessages>;
    for (let i = 1; i <= aspectCount; i++) {
      messages[i as AspectNumber] = { voice: [], text: [] };
    }
    return messages;
  });

  // Helper function to get aspect description
  const getAspectDescription = (aspectNum: number): string => {
    const config = aspectConfigs.find(config => config.id === aspectNum);
    return config?.description || `Aspect ${aspectNum}`;
  };

  // Function to handle aspect switching with context injection
  const handleAspectSwitch = useCallback(async (aspectNum: AspectNumber) => {
    setActiveAspect(aspectNum);
    
    // Inject context for the new aspect
    const description = getAspectDescription(aspectNum);
    const contextMessage = `=== CONVERSATION CONTEXT ===
You are now in a conversation focused on: ${description}
Please tailor your responses to this specific context.
===========================`;
    
    try {
      await injectExternalContext({ text: contextMessage });
      console.log(`✅ Context injected for aspect ${aspectNum}:`, description);
    } catch (error) {
      console.warn(`⚠️ Failed to inject context for aspect ${aspectNum}:`, error);
    }
  }, [aspectConfigs]);

  // Dynamic button generation with tooltips
  {Array.from({ length: aspectCount }, (_, i) => i + 1).map(aspectNum => (
    <div key={aspectNum} className="relative">
      <button
        onClick={() => handleAspectSwitch(aspectNum as AspectNumber)}
        onMouseEnter={() => setHoveredAspect(aspectNum as AspectNumber)}
        onMouseLeave={() => setHoveredAspect(null)}
        className={/* styling */}
      >
        {aspectNum}
      </button>
      
      {/* Tooltip */}
      {hoveredAspect === aspectNum && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-md shadow-lg z-50 whitespace-nowrap max-w-xs">
          {getAspectDescription(aspectNum)}
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-700"></div>
        </div>
      )}
    </div>
  ))}
  ```

  #### SPA Routing (worker-voice/index.ts)
  ```typescript
  // Serve React app for all non-API routes
  return new Response(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root"></div>
        <script src="/assets/index-BxuuT1Jk.js"></script>
      </body>
    </html>
  `);
  ```

  ## Benefits

  1. **Context Separation**: Keep different types of conversations isolated
  2. **Organization**: Logical grouping of related discussions
  3. **User Experience**: Clear visual indication of active context
  4. **Flexibility**: Easy switching between conversation contexts
  5. **Scalability**: Support for 2-10 different aspects/contexts
  6. **Iframe Integration**: Perfect for embedding in parent websites
  7. **Dynamic Configuration**: Real-time aspect count changes without redeployment
  8. **PostMessage API**: Standard web communication protocol for iframe control
  9. **Backward Compatibility**: Default 7-button behavior maintained
  10. **State Preservation**: Messages preserved when aspect count changes
  11. **Context Awareness**: AI adapts responses based on active aspect context
  12. **Tooltip Guidance**: Users understand what each aspect represents
  13. **Automatic Injection**: Seamless context switching without manual intervention
  14. **Error Resilience**: Graceful handling of injection failures
  15. **Debugging Support**: Comprehensive logging for troubleshooting

  ## Browser Compatibility

  - Works with browser back/forward navigation
  - Maintains aspect state during navigation
  - Supports all modern browsers with JavaScript enabled
  - PostMessage API support (IE9+, all modern browsers)
  - Cross-origin iframe communication support
  - Real-time aspect count updates without page reload

  ## Deployment

  The enhanced mode is deployed alongside the normal mode:
  - Both modes use the same Cloudflare Worker
  - Same Durable Objects for voice session management
  - Separate static asset handling for SPA routing
  - PostMessage functionality works immediately after deployment
  - No additional configuration required for iframe integration

  ## Testing

  ### PostMessage Testing
  A comprehensive test file `test-aspect-config.html` is provided for testing both simple and advanced aspect configuration features:

  ```html
  <!-- Test different aspect counts -->
  <button onclick="sendAspectCount(2)">Set 2 Buttons</button>
  <button onclick="sendAspectCount(5)">Set 5 Buttons</button>
  <button onclick="sendAspectCount(10)">Set 10 Buttons</button>

  <!-- Test validation -->
  <button onclick="sendAspectCount(1)">Test Invalid: 1</button>
  <button onclick="sendAspectCount(15)">Test Invalid: 15</button>

  <!-- Test advanced configurations -->
  <button onclick="sendTechSupportConfig()">Tech Support Config</button>
  <button onclick="sendEcommerceConfig()">E-commerce Config</button>
  <button onclick="sendHealthcareConfig()">Healthcare Config</button>
  <button onclick="sendInvalidConfig()">Test Invalid Config</button>
  ```

  ### Comprehensive Testing Features
  - **Simple Count Testing**: Test basic aspect count functionality
  - **Advanced Configuration**: Test aspect descriptions and context injection
  - **Real-time Updates**: Verify immediate UI updates when configuration changes
  - **Tooltip Testing**: Hover over buttons to verify tooltip display
  - **Context Injection**: Click buttons and check console for injection logs
  - **Validation Testing**: Test invalid configurations are properly rejected
  - **Cross-browser Testing**: Verify functionality across different browsers
  - **Error Handling**: Test graceful handling of invalid inputs

  ## Future Enhancements

  Potential improvements could include:
  - **Custom Aspect Labels**: Display custom text instead of numbers on buttons
  - **Aspect Persistence**: Remember aspect configurations across sessions
  - **Aspect-specific AI Personas**: Different AI behavior for each aspect
  - **Drag & Drop Reordering**: Allow users to reorder aspect buttons
  - **Aspect Templates**: Pre-built configurations for common use cases
  - **PostMessage Security**: Origin validation for enhanced security
  - **Aspect Count Persistence**: Remember aspect count across page reloads
  - **Multi-row Layout**: Support for aspect counts > 10 with wrapping
  - **Aspect Export/Import**: Save and restore aspect configurations
  - **Dynamic Aspect Labels**: Custom names for each aspect button
  - **Aspect-specific Instructions**: Different AI instructions per aspect
  - **Aspect Analytics**: Track usage patterns per aspect
  - **Aspect Permissions**: Control which aspects are available to different users
  - **Aspect Scheduling**: Time-based aspect availability
  - **Aspect Integration**: Connect aspects to external APIs or databases

  ---

  **Note**: The enhanced mode maintains full compatibility with all existing voice agent features while adding the organizational benefits of aspect-based conversation management. The dynamic aspect count and configuration features via PostMessage make it perfect for iframe integration in parent websites, allowing real-time customization without redeployment. The new context injection system enables AI agents to adapt their responses based on the active aspect, creating more relevant and contextual conversations.

  ## API Reference

### PostMessage API

#### Simple Aspect Count Message Format
```typescript
interface SetAspectCountMessage {
  type: 'SET_ASPECT_COUNT';
  aspectCount: number; // 2-10 range
}
```

#### Advanced Aspect Configuration Message Format
```typescript
interface SetAspectConfigMessage {
  type: 'SET_ASPECT_CONFIG';
  aspectCount: number; // 2-10 range
  aspects: Array<{
    id: number; // Must be sequential (1, 2, 3, ...)
    description: string; // Non-empty description for tooltip
  }>;
}
```

#### Response Behavior
- **Valid Count (2-10)**: Updates aspect count immediately
- **Valid Configuration**: Updates both count and aspect descriptions
- **Invalid Count (< 2 or > 10)**: Ignores message, maintains current count
- **Invalid Configuration**: Ignores message, logs warning
- **No Response**: Messages are one-way communication
- **Console Logging**: All PostMessage events are logged for debugging
- **Context Injection**: Clicking aspect buttons automatically injects context into voice session

  #### Security Considerations
  - **No Origin Validation**: Currently accepts messages from any origin
  - **Input Validation**: Aspect count and configuration are validated before processing
  - **Error Handling**: Invalid messages are logged but don't cause errors
  - **Context Sanitization**: Aspect descriptions are used as-is in context injection
  - **Session Security**: Context injection respects existing voice session security

## Context Injection System

### How Context Injection Works

The context injection system automatically injects aspect-specific context into the voice session when users click aspect buttons. This enables the AI to adapt its responses based on the active conversation context.

### Context Message Format

When an aspect button is clicked, the following context message is injected:

```
=== CONVERSATION CONTEXT ===
You are now in a conversation focused on: {aspect.description}
Please tailor your responses to this specific context.
===========================
```

### Integration with Voice Session

- **Automatic Trigger**: Context injection occurs immediately when switching aspects
- **Session Integration**: Uses the existing `injectExternalContext` system
- **Error Handling**: Graceful fallback if injection fails
- **Logging**: Console logging for debugging and monitoring
- **Non-blocking**: Context injection doesn't interrupt ongoing conversations

### Example Context Injections

**Technical Support Aspect:**
```
=== CONVERSATION CONTEXT ===
You are now in a conversation focused on: Technical support - help with bugs and issues
Please tailor your responses to this specific context.
===========================
```

**Sales Aspect:**
```
=== CONVERSATION CONTEXT ===
You are now in a conversation focused on: Sales inquiries - pricing and features
Please tailor your responses to this specific context.
===========================
```

### Benefits of Context Injection

1. **Relevant Responses**: AI provides contextually appropriate answers
2. **Consistent Behavior**: Same aspect always triggers same context
3. **User Guidance**: Users understand what to expect from each aspect
4. **Seamless Experience**: No manual context switching required
5. **Debugging Support**: Clear logging for troubleshooting

## Iframe Embedding Support

The Enhanced Mode now supports **iframe embedding** with flexible layout options for integration into parent websites.

### URL Parameters for Iframe Control

#### Basic Iframe Embedding (Chat Hidden)
```html
<iframe 
  src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode"
  width="400" 
  height="600">
</iframe>
```
- **Behavior**: Shows only the hexagon (voice interaction)
- **Chat Panel**: Hidden (default iframe behavior)
- **Layout**: Centered hexagon

#### Iframe with Chat Visible (Vertical Split)
```html
<iframe 
  src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode?showChat=true"
  width="600" 
  height="800">
</iframe>
```
- **Behavior**: Shows hexagon + chat panel in vertical split
- **Layout**: Top 50% = Hexagon, Bottom 50% = Chat panel
- **Chat Panel**: Full-width embedded layout (no floating overlay)

### Layout Modes

#### Default Mode (Direct Access)
- **URL**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode`
- **Layout**: Centered hexagon with floating chat panel (bottom-right)
- **Chat**: Minimizable/maximizable overlay

#### Iframe Mode (Chat Hidden)
- **URL**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode`
- **Layout**: Centered hexagon only
- **Chat**: Completely hidden

#### Iframe Mode (Chat Visible)
- **URL**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode?showChat=true`
- **Layout**: Vertical split (50/50)
- **Chat**: Full-width embedded panel
- **Features**: All enhanced mode features available

#### Chat-Only Mode (NEW)
- **URL**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode?chatOnly=true`
- **Layout**: Full-width chat panel only
- **Hexagon**: Completely hidden
- **Features**: All enhanced mode features available in chat

### Implementation Details

#### URL Parameter Detection
The system detects iframe context and URL parameters:
- `showChat=true`: Forces chat visibility even in iframe mode
- `chatOnly=true`: Shows only the chat panel (NEW)
- `sessionId`: Links to specific voice session
- `embed=true`: Alternative embed mode flag
- `widget=true`: Widget mode flag

#### Layout Logic
```typescript
const shouldShowChat = !iframeContext.isIframe || iframeContext.showChat;
const isVerticalSplit = iframeContext.isIframe && iframeContext.showChat;
const isChatOnly = iframeContext.chatOnly; // NEW: Chat-only mode
```

#### Chat Panel Adaptations
When `isEmbedded=true`:
- **Positioning**: Relative instead of fixed
- **Styling**: No rounded corners, shadows, or borders
- **Size**: Full width and height of container
- **Controls**: No minimize/maximize button
- **Content**: Always expanded (no minimization)

### Use Cases

#### 1. Voice-Only Integration
```html
<!-- Parent website with voice-only iframe -->
<iframe src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode"></iframe>
```
- **Use Case**: Voice interaction without chat history
- **Layout**: Clean, focused voice interface
- **Space**: Minimal iframe footprint

#### 2. Full Interface Integration
```html
<!-- Parent website with complete interface -->
<iframe src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode?showChat=true"></iframe>
```
- **Use Case**: Complete voice + chat experience
- **Layout**: Vertical split for optimal space usage
- **Features**: All enhanced mode capabilities

#### 3. Chat-Only Integration (NEW)
```html
<!-- Parent website with chat-only iframe -->
<iframe src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode?chatOnly=true"></iframe>
```
- **Use Case**: Text-based chat without voice interaction
- **Layout**: Clean, focused chat interface
- **Space**: Optimal for chat-heavy workflows

#### 4. Dynamic Control
```javascript
// Parent website can dynamically control layout
const iframe = document.getElementById('hexa-iframe');

// Switch to chat-visible mode
iframe.src = 'https://hexa-worker.prabhatravib.workers.dev/enhancedMode?showChat=true';

// Switch to chat-only mode
iframe.src = 'https://hexa-worker.prabhatravib.workers.dev/enhancedMode?chatOnly=true';

// Switch back to voice-only mode
iframe.src = 'https://hexa-worker.prabhatravib.workers.dev/enhancedMode';
```

### Technical Specifications

#### Iframe Detection Methods
1. **Window Comparison**: `window.self !== window.top`
2. **Parent Check**: `window.parent !== window.self`
3. **URL Parameters**: Presence of `sessionId`, `embed`, `widget`
4. **Cross-Origin**: Exception handling for restricted access

#### Responsive Behavior
- **Mobile**: Layout adapts to smaller screens
- **Desktop**: Optimal use of available space
- **Dark Mode**: Automatically inherited from parent
- **Aspect Buttons**: Fully functional in embedded mode

#### Session Management
- **Shared Sessions**: Both iframe modes use same voice session
- **Real-time Sync**: Voice interactions populate chat automatically
- **Context Injection**: Enhanced mode context works in embedded chat
- **External Data**: PostMessage API fully supported

### Best Practices

#### Iframe Sizing
- **Voice-Only**: Minimum 400x400px
- **With Chat**: Minimum 600x800px
- **Aspect Ratio**: 3:4 recommended for chat mode

#### Parent Website Integration
- **CSS**: Ensure iframe container has proper dimensions
- **JavaScript**: Use PostMessage for dynamic control
- **Accessibility**: Provide proper iframe titles and descriptions

#### Performance Considerations
- **Loading**: Single iframe loads faster than multiple components
- **Memory**: Shared voice session reduces resource usage
- **Updates**: Real-time synchronization without polling