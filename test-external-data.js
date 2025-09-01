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
