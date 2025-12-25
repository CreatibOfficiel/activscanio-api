const io = require('socket.io-client');

console.log('🔌 Connecting to WebSocket server...');

const socket = io('http://localhost:3001/events', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server!');
  console.log(`Socket ID: ${socket.id}`);

  // Register a test user
  console.log('📝 Registering user: test-user-123');
  socket.emit('register', 'test-user-123');
});

socket.on('registered', (data) => {
  console.log('✅ Registration successful:', data);
});

socket.on('achievement:unlocked', (achievement) => {
  console.log('🎉 Achievement unlocked:', achievement);
});

socket.on('level:up', (data) => {
  console.log('📈 Level up:', data);
});

socket.on('perfect:score', (data) => {
  console.log('🎯 Perfect score:', data);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from WebSocket server');
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

// Keep alive for 30 seconds
setTimeout(() => {
  console.log('👋 Disconnecting...');
  socket.disconnect();
  process.exit(0);
}, 30000);

console.log('Listening for events for 30 seconds...');
