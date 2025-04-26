/**
 * GameBoy Emulator - Main Module
 * Coordinates the emulation process and interfaces with the DOM
 */

import { CPU } from './cpu.js';
import { MMU } from './mmu.js';
import { PPU } from './ppu.js';
import { APU } from './apu.js';
import { Timer } from './timer.js';
import { Input } from './input.js';
import { Cartridge } from './cartridge.js';

export class GameBoy {
  constructor(romData, canvas) {
    if (!romData) {
      throw new Error('ROM data is required');
    }
    
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Valid canvas element is required');
    }
    
    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d');
    
    if (!this.ctx) {
      throw new Error('Could not get canvas context');
    }
    
    try {
      // Initialize components
      this.cartridge = new Cartridge(romData);
      this.mmu = new MMU(this);
      this.ppu = new PPU(this);
      this.apu = new APU(this);
      this.timer = new Timer(this);
      this.input = new Input(this);
      this.cpu = new CPU(this);
      
      // Emulation state
      this.paused = true;
      this.animationFrameId = null;
      
      // Performance metrics
      this.lastFrameTime = 0;
      this.frameCount = 0;
      this.fps = 0;
      this.cyclesPerFrame = 70224; // 4.194304MHz / ~59.73Hz
      
      // Initialize offscreen buffer
      this.screenBuffer = this.ctx.createImageData(160, 144);
      
      // Check if Web Workers are supported
      this.useWorker = window.Worker !== undefined;
      this.worker = null;
      
      // Initialize worker if supported
      if (this.useWorker) {
        this.initWorker();
      }
      
      // Initial reset
      this.reset();
      
      console.log('GameBoy emulator initialized successfully');
    } catch (error) {
      console.error('Error initializing GameBoy emulator:', error);
      throw error;
    }
  }
  
  initWorker() {
    try {
      this.worker = new Worker('./js/worker.js', { type: 'module' });
      
      if (!this.worker) {
        throw new Error('Failed to create Web Worker');
      }
      
      this.worker.onmessage = (event) => {
        if (!event || !event.data) return;
        
        const { type, data } = event.data;
        
        switch (type) {
          case 'frame':
            // Update screen with data from worker
            if (data && data.frameData) {
              this.screenBuffer.data.set(data.frameData);
              this.ctx.putImageData(this.screenBuffer, 0, 0);
            }
            break;
            
          case 'audio':
            // Handle audio data
            if (this.apu && data) {
              this.apu.processAudioFromWorker(data);
            }
            break;
            
          case 'status':
            console.log('Worker status:', data?.message || 'Unknown');
            break;
            
          default:
            console.warn('Unknown message type from worker:', type);
        }
      };
      
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        // Fall back to main thread emulation
        this.useWorker = false;
      };
      
      console.log('Web Worker initialized for GameBoy emulation');
    } catch (e) {
      console.error('Failed to initialize Web Worker:', e);
      this.useWorker = false;
    }
  }
  
  start() {
    if (this.paused) {
      this.paused = false;
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      
      if (this.useWorker && this.worker) {
        // Start emulation in worker
        this.worker.postMessage({
          type: 'start',
          data: {
            romData: this.cartridge.rom,
            cartridgeType: this.cartridge.type,
            ramBanks: this.cartridge.ramBanks
          }
        });
        
        // Start audio context on user gesture
        if (this.apu) {
          this.apu.start();
        }
      } else {
        // Start main loop in main thread
        this.runMainThread();
      }
    }
  }
  
  pause() {
    if (!this.paused) {
      this.paused = true;
      
      if (this.useWorker && this.worker) {
        this.worker.postMessage({ type: 'pause' });
      } else if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      // Pause audio
      if (this.apu) {
        this.apu.pause();
      }
    }
  }
  
  reset() {
    this.pause();
    
    if (!this.mmu || !this.cpu || !this.ppu || !this.timer || !this.apu || !this.input) {
      console.error('Cannot reset: One or more components are not initialized');
      return;
    }
    
    // Reset all components
    this.mmu.reset();
    this.cpu.reset();
    this.ppu.reset();
    this.timer.reset();
    this.apu.reset();
    this.input.reset();
    
    // Clear screen
    if (this.ctx) {
      this.ctx.fillStyle = '#0f380f';
      this.ctx.fillRect(0, 0, 160, 144);
    }
    
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'reset' });
    }
  }
  
  runMainThread() {
    if (this.paused) return;
    
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    
    // Run one frame's worth of CPU cycles
    this.runFrame();
    
    // Calculate and display FPS
    this.frameCount++;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFrameTime = now;
      console.log(`FPS: ${this.fps}`);
    }
    
    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(() => this.runMainThread());
  }
  
  runFrame() {
    if (!this.cpu || !this.timer || !this.ppu || !this.apu || !this.ctx) {
      console.error('Cannot run frame: Required components are not initialized');
      this.pause();
      return;
    }
    
    // Execute enough CPU cycles for one frame (~4.194MHz / ~59.73Hz ≈ 70224 cycles)
    let cyclesThisFrame = 0;
    
    try {
      while (cyclesThisFrame < this.cyclesPerFrame) {
        // Run one CPU instruction
        const cyclesExecuted = this.cpu.step();
        cyclesThisFrame += cyclesExecuted;
        
        // Update timer
        this.timer.update(cyclesExecuted);
        
        // Update PPU
        this.ppu.update(cyclesExecuted);
        
        // Update APU
        this.apu.update(cyclesExecuted);
      }
      
      // Render the frame to canvas
      if (this.ppu.frameBuffer) {
        this.ctx.putImageData(this.ppu.frameBuffer, 0, 0);
      }
    } catch (error) {
      console.error('Error during frame execution:', error);
      this.pause();
    }
  }
  
  handleKeyDown(e) {
    if (!this.input) return;
    
    this.input.handleKeyDown(e);
    
    if (this.useWorker && this.worker) {
      this.worker.postMessage({
        type: 'keydown',
        data: { keyCode: e.keyCode }
      });
    }
  }
  
  handleKeyUp(e) {
    if (!this.input) return;
    
    this.input.handleKeyUp(e);
    
    if (this.useWorker && this.worker) {
      this.worker.postMessage({
        type: 'keyup',
        data: { keyCode: e.keyCode }
      });
    }
  }
}