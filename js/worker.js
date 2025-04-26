/**
 * Web Worker for Game Boy Emulation
 * Runs the emulation in a separate thread
 */

// Import emulator components
import { CPU } from './cpu.js';
import { MMU } from './mmu.js';
import { PPU } from './ppu.js';
import { Timer } from './timer.js';
import { Input } from './input.js';
import { Cartridge } from './cartridge.js';

// State
let running = false;
let frameBuffer = null;
let audioBuffer = null;

// Components
let cartridge = null;
let mmu = null;
let cpu = null;
let ppu = null;
let timer = null;
let input = null;

// Performance tracking
let lastFrameTime = 0;
let cyclesThisFrame = 0;
let framesPerSecond = 0;
let frameCount = 0;
let lastFpsTime = 0;

// Constants
const CYCLES_PER_FRAME = 70224; // ~4.194 MHz / ~59.7 fps

// Initialize emulator
function initEmulator(romData) {
  postMessage({ type: 'status', data: { message: 'Initializing emulator...' } });
  
  // Create a simple gameboy object to pass to components
  const gameboy = {
    mmu: null,
    cpu: null,
    ppu: null,
    timer: null,
    input: null,
    cartridge: null
  };
  
  // Initialize components
  cartridge = new Cartridge(romData);
  gameboy.cartridge = cartridge;
  
  mmu = new MMU(gameboy);
  gameboy.mmu = mmu;
  
  ppu = new PPU(gameboy);
  gameboy.ppu = ppu;
  
  timer = new Timer(gameboy);
  gameboy.timer = timer;
  
  input = new Input(gameboy);
  gameboy.input = input;
  
  cpu = new CPU(gameboy);
  gameboy.cpu = cpu;
  
  // Create frame buffer for rendering
  frameBuffer = new Uint8ClampedArray(160 * 144 * 4);
  
  // Reset all components
  reset();
  
  postMessage({ type: 'status', data: { message: 'Emulator initialized' } });
}

// Reset emulator state
function reset() {
  mmu.reset();
  cpu.reset();
  ppu.reset();
  timer.reset();
  input.reset();
  
  running = false;
  cyclesThisFrame = 0;
  frameCount = 0;
  lastFpsTime = performance.now();
}

// Start emulation
function start() {
  if (!running) {
    running = true;
    lastFrameTime = performance.now();
    emulationLoop();
  }
}

// Pause emulation
function pause() {
  running = false;
}

// Main emulation loop
function emulationLoop() {
  if (!running) return;
  
  const startTime = performance.now();
  
  // Run one frame's worth of CPU cycles
  runFrame();
  
  // Copy frame buffer data to send back to main thread
  const frameData = ppu.frameBuffer.data;
  for (let i = 0; i < frameBuffer.length; i++) {
    frameBuffer[i] = frameData[i];
  }
  
  // Send frame to main thread
  postMessage({
    type: 'frame',
    data: {
      frameData: frameBuffer
    }
  }, [frameBuffer.buffer]);
  
  // Recreate the frame buffer
  frameBuffer = new Uint8ClampedArray(160 * 144 * 4);
  
  // Calculate FPS
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    framesPerSecond = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
    
    postMessage({
      type: 'status',
      data: { message: `FPS: ${framesPerSecond}` }
    });
  }
  
  // Calculate timing for next frame
  const frameTime = performance.now() - startTime;
  const delay = Math.max(0, 16.7 - frameTime); // Target ~60fps
  
  // Schedule next frame
  setTimeout(() => {
    requestAnimationFrame(emulationLoop);
  }, delay);
}

// Run one frame of emulation
function runFrame() {
  cyclesThisFrame = 0;
  
  while (cyclesThisFrame < CYCLES_PER_FRAME) {
    // Execute one CPU instruction
    const cyclesExecuted = cpu.step();
    cyclesThisFrame += cyclesExecuted;
    
    // Update timer
    timer.update(cyclesExecuted);
    
    // Update PPU
    ppu.update(cyclesExecuted);
  }
}

// Handle input changes
function handleKeyDown(keyCode) {
  input.handleKeyDown({ keyCode, preventDefault: () => {} });
}

function handleKeyUp(keyCode) {
  input.handleKeyUp({ keyCode, preventDefault: () => {} });
}

// Message handler
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'start':
      if (data && data.romData) {
        initEmulator(data.romData);
        start();
      } else if (cartridge && mmu && cpu) {
        start();
      }
      break;
      
    case 'pause':
      pause();
      break;
      
    case 'reset':
      reset();
      break;
      
    case 'keydown':
      if (input && data && data.keyCode) {
        handleKeyDown(data.keyCode);
      }
      break;
      
    case 'keyup':
      if (input && data && data.keyCode) {
        handleKeyUp(data.keyCode);
      }
      break;
      
    default:
      console.warn('Unknown message type:', type);
  }
};

// Send ready message
postMessage({
  type: 'status',
  data: { message: 'Worker ready' }
});

