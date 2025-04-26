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
  if (!romData || !romData.length) {
    postMessage({ 
      type: 'status', 
      data: { message: 'Error: Invalid ROM data provided to worker' } 
    });
    return false;
  }

  try {
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
    return true;
  } catch (error) {
    postMessage({ 
      type: 'status', 
      data: { message: `Emulator initialization failed: ${error.message}` } 
    });
    console.error('Worker: Emulator initialization error:', error);
    return false;
  }
}

// Reset emulator state
function reset() {
  if (!mmu || !cpu || !ppu || !timer || !input) {
    postMessage({ 
      type: 'status', 
      data: { message: 'Error: Cannot reset - components not initialized' } 
    });
    return;
  }

  try {
    mmu.reset();
    cpu.reset();
    ppu.reset();
    timer.reset();
    input.reset();
    
    running = false;
    cyclesThisFrame = 0;
    frameCount = 0;
    lastFpsTime = performance.now();
  } catch (error) {
    postMessage({ 
      type: 'status', 
      data: { message: `Reset failed: ${error.message}` } 
    });
    console.error('Worker: Reset error:', error);
  }
}

// Start emulation
function start() {
  if (!running && cpu && ppu) {
    running = true;
    lastFrameTime = performance.now();
    emulationLoop();
  } else if (!cpu || !ppu) {
    postMessage({ 
      type: 'status', 
      data: { message: 'Error: Cannot start - emulator not initialized' } 
    });
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
  
  try {
    // Run one frame's worth of CPU cycles
    runFrame();
    
    // Copy frame buffer data to send back to main thread
    if (ppu && ppu.frameBuffer && ppu.frameBuffer.data) {
      const frameData = ppu.frameBuffer.data;
      for (let i = 0; i < frameBuffer.length && i < frameData.length; i++) {
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
    } else {
      postMessage({
        type: 'status',
        data: { message: 'Warning: Could not update frame buffer' }
      });
    }
    
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
      if (running) {
        requestAnimationFrame(emulationLoop);
      }
    }, delay);
  } catch (error) {
    running = false;
    postMessage({
      type: 'status',
      data: { message: `Emulation error: ${error.message}` }
    });
    console.error('Worker: Emulation loop error:', error);
  }
}

// Run one frame of emulation
function runFrame() {
  if (!cpu || !timer || !ppu) {
    postMessage({
      type: 'status',
      data: { message: 'Error: Cannot run frame - components not initialized' }
    });
    running = false;
    return;
  }

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
  if (input) {
    input.handleKeyDown({ keyCode, preventDefault: () => {} });
  }
}

function handleKeyUp(keyCode) {
  if (input) {
    input.handleKeyUp({ keyCode, preventDefault: () => {} });
  }
}

// Message handler
self.onmessage = function(e) {
  if (!e || !e.data) return;
  
  const { type, data } = e.data;
  
  try {
    switch (type) {
      case 'start':
        if (data && data.romData) {
          const initialized = initEmulator(data.romData);
          if (initialized) {
            start();
          }
        } else if (cartridge && mmu && cpu) {
          start();
        } else {
          postMessage({
            type: 'status',
            data: { message: 'Error: Cannot start - ROM data missing and emulator not initialized' }
          });
        }
        break;
        
      case 'pause':
        pause();
        break;
        
      case 'reset':
        reset();
        break;
        
      case 'keydown':
        if (data && typeof data.keyCode === 'number') {
          handleKeyDown(data.keyCode);
        }
        break;
        
      case 'keyup':
        if (data && typeof data.keyCode === 'number') {
          handleKeyUp(data.keyCode);
        }
        break;
        
      default:
        console.warn('Worker: Unknown message type:', type);
    }
  } catch (error) {
    postMessage({
      type: 'status',
      data: { message: `Worker error: ${error.message}` }
    });
    console.error('Worker: Message handler error:', error);
  }
};

// Handle errors
self.addEventListener('error', (event) => {
  postMessage({
    type: 'status',
    data: { message: `Worker error: ${event.message}` }
  });
  console.error('Worker: Unhandled error:', event);
});

// Send ready message
postMessage({
  type: 'status',
  data: { message: 'Worker ready' }
});