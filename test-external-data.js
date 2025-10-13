// Test script for the new external data endpoint
// This demonstrates how to send various types of external data to the Hexagon Worker

const WORKER_URL = 'https://hexa-worker.prabhatravib.workers.dev';

// Test function to send external data
async function testExternalDataEndpoint() {
  console.log('🧪 Testing External Data Endpoint...\n');

  // Test 1: Send text data
  console.log('📝 Test 1: Sending text data...');
  try {
    const textResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'This is a sample text input for voice discussion',
        prompt: 'Discuss this text in the context of AI voice interactions',
        type: 'text'
      })
    });
    
    const textResult = await textResponse.json();
    console.log('✅ Text data response:', textResult);
  } catch (error) {
    console.error('❌ Text data test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Send image data (base64 encoded)
  console.log('🖼️ Test 2: Sending image data...');
  try {
    const imageResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        prompt: 'Analyze this image and discuss its content',
        type: 'image'
      })
    });
    
    const imageResult = await imageResponse.json();
    console.log('✅ Image data response:', imageResult);
  } catch (error) {
    console.error('❌ Image data test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Send mixed data
  console.log('🔀 Test 3: Sending mixed data...');
  try {
    const mixedResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Sample code snippet: function hello() { return "world"; }',
        prompt: 'Explain this code and discuss its implementation',
        type: 'code'
      })
    });
    
    const mixedResult = await mixedResponse.json();
    console.log('✅ Mixed data response:', mixedResult);
  } catch (error) {
    console.error('❌ Mixed data test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 4: Test OPTIONS request (CORS preflight)
  console.log('🌐 Test 4: Testing CORS preflight...');
  try {
    const optionsResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'OPTIONS'
    });
    
    console.log('✅ CORS preflight response status:', optionsResponse.status);
    console.log('✅ CORS headers:', {
      'Access-Control-Allow-Origin': optionsResponse.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': optionsResponse.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': optionsResponse.headers.get('Access-Control-Allow-Headers')
    });
  } catch (error) {
    console.error('❌ CORS preflight test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 5: Test invalid method
  console.log('🚫 Test 5: Testing invalid method...');
  try {
    const invalidResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'GET'
    });
    
    const invalidResult = await invalidResponse.json();
    console.log('✅ Invalid method response:', invalidResult);
  } catch (error) {
    console.error('❌ Invalid method test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 6: Send diagram data first
  console.log('📊 Test 6: Sending diagram data for context...');
  try {
    const diagramResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mermaidCode: 'graph TD; A[Start] --> B[Process]; B --> C[End]',
        diagramImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        prompt: 'Explain this flowchart diagram',
        type: 'diagram',
        sessionId: 'test-session-123'
      })
    });

    const diagramResult = await diagramResponse.json();
    console.log('✅ Diagram data response:', diagramResult);
  } catch (error) {
    console.error('❌ Diagram data test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 7: Send hover event with diagram context
  console.log('🖱️ Test 7: Sending hover event (should combine with diagram context)...');
  try {
    const hoverResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'hover',
        nodeText: 'Process',
        nodeId: 'node-B',
        timestamp: Date.now(),
        sessionId: 'test-session-123'
      })
    });

    const hoverResult = await hoverResponse.json();
    console.log('✅ Hover event response:', JSON.stringify(hoverResult, null, 2));

    if (hoverResult.success && hoverResult.diagramContext) {
      console.log('🎯 SUCCESS: Hover response includes diagram context!');
      console.log('- Node Text:', hoverResult.hoverData.nodeText);
      console.log('- Diagram has code:', !!hoverResult.diagramContext.mermaidCode);
      console.log('- Diagram has image:', !!hoverResult.diagramContext.diagramImage);
      console.log('- Original prompt:', hoverResult.diagramContext.originalPrompt);
    } else {
      console.log('❌ Hover response missing diagram context');
    }
  } catch (error) {
    console.error('❌ Hover event test failed:', error);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 8: Test hover without prior diagram (should fail gracefully)
  console.log('🚫 Test 8: Testing hover without diagram context...');
  try {
    const noContextHoverResponse = await fetch(`${WORKER_URL}/api/external-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'hover',
        nodeText: 'Some Node',
        nodeId: 'node-X',
        timestamp: Date.now(),
        sessionId: 'no-diagram-session'
      })
    });

    const noContextResult = await noContextHoverResponse.json();
    console.log('✅ No context hover response:', JSON.stringify(noContextResult, null, 2));

    if (noContextResult.error === 'no_diagram_context') {
      console.log('🎯 SUCCESS: Properly handled missing diagram context');
    } else {
      console.log('❌ Expected no_diagram_context error');
    }
  } catch (error) {
    console.error('❌ No context hover test failed:', error);
  }

  console.log('\n🎉 External Data Endpoint Testing Complete!');
}

// Run the tests
testExternalDataEndpoint().catch(console.error);

// Usage examples for different scenarios
console.log('\n📚 Usage Examples:\n');

console.log('1. Send text for voice discussion:');
console.log(`fetch('${WORKER_URL}/api/external-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Your text here',
    prompt: 'Optional context prompt',
    type: 'text'
  })
});\n`);

console.log('2. Send image for analysis:');
console.log(`fetch('${WORKER_URL}/api/external-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: 'data:image/png;base64,your_base64_image_data',
    prompt: 'Analyze this image',
    type: 'image'
  })
});\n`);

console.log('3. Send code for discussion:');
console.log(`fetch('${WORKER_URL}/api/external-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'function example() { return "code"; }',
    prompt: 'Explain this code',
    type: 'code'
  })
});\n`);

console.log('4. Send diagram data for context:');
console.log(`fetch('${WORKER_URL}/api/external-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mermaidCode: 'graph TD; A[Start] --> B[End]',
    diagramImage: 'data:image/png;base64,base64_image_data',
    prompt: 'Explain this diagram',
    type: 'diagram',
    sessionId: 'my-session-id'
  })
});\n`);

console.log('5. Send hover event (retrieves diagram context):');
console.log(`fetch('${WORKER_URL}/api/external-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'hover',
    nodeText: 'Start',
    nodeId: 'node-A',
    timestamp: Date.now(),
    sessionId: 'my-session-id'
  })
});
// Response includes both node info AND full diagram context\n`);
