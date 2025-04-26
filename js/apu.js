/**
 * Audio Processing Unit (APU)
 * Emulates the Game Boy sound hardware
 */

export class APU {
  constructor(gameboy) {
    if (!gameboy) {
      throw new Error('APU: Gameboy instance is required');
    }
    
    this.gameboy = gameboy;
    this.mmu = gameboy.mmu;
    
    // Audio context
    this.audioCtx = null;
    this.masterGain = null;
    
    // Channel nodes
    this.channel1 = null;
    this.channel2 = null;
    this.channel3 = null;
    this.channel4 = null;
    
    // Channel states
    this.ch1Enabled = false;
    this.ch2Enabled = false;
    this.ch3Enabled = false;
    this.ch4Enabled = false;
    
    // Wave pattern for channel 3
    this.wavePattern = new Uint8Array(32);
    
    // Frequency sweeps, envelopes, and timers
    this.ch1SweepTime = 0;
    this.ch1SweepDir = 0;
    this.ch1SweepShift = 0;
    this.ch1Frequency = 0;
    
    this.channel1Envelope = { volume: 0, direction: 0, stepTime: 0, timer: 0 };
    this.channel2Envelope = { volume: 0, direction: 0, stepTime: 0, timer: 0 };
    this.channel4Envelope = { volume: 0, direction: 0, stepTime: 0, timer: 0 };
    
    // Initialize
    this.reset();
  }
  
  reset() {
    // Reset channel states
    this.ch1Enabled = false;
    this.ch2Enabled = false;
    this.ch3Enabled = false;
    this.ch4Enabled = false;
    
    // Reset wave pattern
    this.wavePattern.fill(0);
    
    // Stop audio if it's playing
    if (this.audioCtx) {
      this.stopAudio();
    }
  }
  
  // Initialize Web Audio API
  initAudio() {
    if (this.audioCtx) return;
    
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (!this.audioCtx) {
        console.warn('Web Audio API not supported in this browser');
        return;
      }
      
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 0.1; // Master volume
      this.masterGain.connect(this.audioCtx.destination);
      
      // Initialize channels
      this.initChannel1();
      this.initChannel2();
      this.initChannel3();
      this.initChannel4();
      
      console.log('Audio initialized');
    } catch (e) {
      console.error('Web Audio API initialization error:', e);
      this.audioCtx = null;
    }
  }
  
  // Initialize pulse wave channel 1 (with sweep)
  initChannel1() {
    if (!this.audioCtx) return;
    
    try {
      this.channel1 = this.audioCtx.createOscillator();
      this.channel1.type = 'square';
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 0;
      
      this.channel1.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      this.channel1.gainNode = gainNode;
      this.channel1.started = false;
    } catch (e) {
      console.error('Error initializing channel 1:', e);
      this.channel1 = null;
    }
  }
  
  // Initialize pulse wave channel 2
  initChannel2() {
    if (!this.audioCtx) return;
    
    try {
      this.channel2 = this.audioCtx.createOscillator();
      this.channel2.type = 'square';
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 0;
      
      this.channel2.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      this.channel2.gainNode = gainNode;
      this.channel2.started = false;
    } catch (e) {
      console.error('Error initializing channel 2:', e);
      this.channel2 = null;
    }
  }
  
  // Initialize wave channel 3
  initChannel3() {
    if (!this.audioCtx) return;
    
    try {
      // We use a simple sine wave for now
      // A more accurate implementation would use a custom waveform based on wave pattern RAM
      this.channel3 = this.audioCtx.createOscillator();
      this.channel3.type = 'sine';
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 0;
      
      this.channel3.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      this.channel3.gainNode = gainNode;
      this.channel3.started = false;
    } catch (e) {
      console.error('Error initializing channel 3:', e);
      this.channel3 = null;
    }
  }
  
  // Initialize noise channel 4
  initChannel4() {
    if (!this.audioCtx) return;
    
    try {
      // Web Audio doesn't have a built-in noise generator
      // For simplicity, we'll use an approximate white noise generator
      const bufferSize = 2 * this.audioCtx.sampleRate;
      const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      this.channel4 = this.audioCtx.createBufferSource();
      this.channel4.buffer = noiseBuffer;
      this.channel4.loop = true;
      
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 0;
      
      this.channel4.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      this.channel4.gainNode = gainNode;
      this.channel4.started = false;
    } catch (e) {
      console.error('Error initializing channel 4:', e);
      this.channel4 = null;
    }
  }
  
  // Start audio processing
  start() {
    this.initAudio();
    
    if (!this.audioCtx) return;
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(err => {
        console.error('Error resuming audio context:', err);
      });
    }
    
    // Start oscillators if they're not already running
    this.startChannels();
  }
  
  startChannels() {
    try {
      if (this.channel1 && !this.channel1.started) {
        this.channel1.start();
        this.channel1.started = true;
      }
      
      if (this.channel2 && !this.channel2.started) {
        this.channel2.start();
        this.channel2.started = true;
      }
      
      if (this.channel3 && !this.channel3.started) {
        this.channel3.start();
        this.channel3.started = true;
      }
      
      if (this.channel4 && !this.channel4.started) {
        this.channel4.start();
        this.channel4.started = true;
      }
    } catch (e) {
      console.error('Error starting audio channels:', e);
    }
  }
  
  // Pause audio
  pause() {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend().catch(err => {
        console.error('Error suspending audio context:', err);
      });
    }
  }
  
  // Stop and clean up audio resources
  stopAudio() {
    if (!this.audioCtx) return;
    
    try {
      // Stop and disconnect channels
      if (this.channel1) {
        try {
          this.channel1.stop();
          this.channel1.disconnect();
        } catch (e) {}
        this.channel1 = null;
      }
      
      if (this.channel2) {
        try {
          this.channel2.stop();
          this.channel2.disconnect();
        } catch (e) {}
        this.channel2 = null;
      }
      
      if (this.channel3) {
        try {
          this.channel3.stop();
          this.channel3.disconnect();
        } catch (e) {}
        this.channel3 = null;
      }
      
      if (this.channel4) {
        try {
          this.channel4.stop();
          this.channel4.disconnect();
        } catch (e) {}
        this.channel4 = null;
      }
      
      // Disconnect master gain
      if (this.masterGain) {
        this.masterGain.disconnect();
        this.masterGain = null;
      }
      
      // Close audio context
      if (this.audioCtx) {
        this.audioCtx.close().catch(err => {
          console.error('Error closing audio context:', err);
        });
        this.audioCtx = null;
      }
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  }
  
  // Update APU state
  update(cycles) {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    
    // Update envelopes and sweeps
    this.updateChannel1(cycles);
    this.updateChannel2(cycles);
    this.updateChannel3(cycles);
    this.updateChannel4(cycles);
  }
  
  // Handle register writes
  writeRegister(register, value) {
    // Channel 1 - Pulse with sweep
    if (register >= 0x10 && register <= 0x14) {
      this.handleChannel1Register(register, value);
    }
    
    // Channel 2 - Pulse
    else if (register >= 0x15 && register <= 0x19) {
      this.handleChannel2Register(register, value);
    }
    
    // Channel 3 - Wave
    else if (register >= 0x1A && register <= 0x1E) {
      this.handleChannel3Register(register, value);
    }
    
    // Channel 4 - Noise
    else if (register >= 0x1F && register <= 0x23) {
      this.handleChannel4Register(register, value);
    }
    
    // Sound control registers
    else if (register >= 0x24 && register <= 0x26) {
      this.handleControlRegister(register, value);
    }
    
    // Wave pattern RAM
    else if (register >= 0x30 && register <= 0x3F) {
      this.wavePattern[register - 0x30] = value;
      this.updateWaveform();
    }
  }
  
  // Handle registers for Channel 1 (Pulse with sweep)
  handleChannel1Register(register, value) {
    if (!this.channel1) return;
    
    switch (register) {
      case 0x10: // NR10: Sweep
        this.ch1SweepTime = (value >> 4) & 0x07;
        this.ch1SweepDir = (value >> 3) & 0x01;
        this.ch1SweepShift = value & 0x07;
        break;
        
      case 0x11: // NR11: Length timer & duty cycle
        // Duty cycle (bits 6-7)
        const duty = (value >> 6) & 0x03;
        // Approximate duty cycles with pulse width
        switch (duty) {
          case 0: this.channel1.setPeriodicWave(this.createPulseWave(0.125)); break; // 12.5%
          case 1: this.channel1.setPeriodicWave(this.createPulseWave(0.25)); break;  // 25%
          case 2: this.channel1.setPeriodicWave(this.createPulseWave(0.5)); break;   // 50%
          case 3: this.channel1.setPeriodicWave(this.createPulseWave(0.75)); break;  // 75%
        }
        // Length data is 6 bits (bits 0-5)
        // Not implemented for simplicity
        break;
        
      case 0x12: // NR12: Volume envelope
        this.channel1Envelope.volume = value >> 4;
        this.channel1Envelope.direction = (value >> 3) & 0x01;
        this.channel1Envelope.stepTime = value & 0x07;
        
        // Update gain
        if (this.channel1.gainNode) {
          this.channel1.gainNode.gain.value = this.channel1Envelope.volume / 15 * 0.25;
        }
        
        // If volume is 0 and envelope is decreasing, disable channel
        if (this.channel1Envelope.volume === 0 && this.channel1Envelope.direction === 0) {
          this.ch1Enabled = false;
          this.channel1.gainNode.gain.value = 0;
        }
        break;
        
      case 0x13: // NR13: Frequency LSB
        this.ch1Frequency = (this.ch1Frequency & 0x700) | value;
        this.updateChannel1Frequency();
        break;
        
      case 0x14: // NR14: Frequency MSB & trigger
        this.ch1Frequency = (this.ch1Frequency & 0xFF) | ((value & 0x07) << 8);
        this.updateChannel1Frequency();
        
        // Trigger (bit 7)
        if (value & 0x80) {
          this.ch1Enabled = true;
          
          // Reset envelope
          if (this.channel1Envelope.volume > 0) {
            this.channel1.gainNode.gain.value = this.channel1Envelope.volume / 15 * 0.25;
          } else {
            this.ch1Enabled = false;
          }
        }
        break;
    }
  }
  
  // Handle registers for Channel 2 (Pulse)
  handleChannel2Register(register, value) {
    if (!this.channel2) return;
    
    switch (register) {
      case 0x16: // NR21: Length timer & duty cycle
        const duty = (value >> 6) & 0x03;
        switch (duty) {
          case 0: this.channel2.setPeriodicWave(this.createPulseWave(0.125)); break;
          case 1: this.channel2.setPeriodicWave(this.createPulseWave(0.25)); break;
          case 2: this.channel2.setPeriodicWave(this.createPulseWave(0.5)); break;
          case 3: this.channel2.setPeriodicWave(this.createPulseWave(0.75)); break;
        }
        break;
        
      case 0x17: // NR22: Volume envelope
        this.channel2Envelope.volume = value >> 4;
        this.channel2Envelope.direction = (value >> 3) & 0x01;
        this.channel2Envelope.stepTime = value & 0x07;
        
        if (this.channel2.gainNode) {
          this.channel2.gainNode.gain.value = this.channel2Envelope.volume / 15 * 0.25;
        }
        
        if (this.channel2Envelope.volume === 0 && this.channel2Envelope.direction === 0) {
          this.ch2Enabled = false;
          this.channel2.gainNode.gain.value = 0;
        }
        break;
        
      case 0x18: // NR23: Frequency LSB
        let freq = (this.channel2.frequency || 0) & 0x700;
        freq |= value;
        this.updateChannel2Frequency(freq);
        break;
        
      case 0x19: // NR24: Frequency MSB & trigger
        let freq2 = (this.channel2.frequency || 0) & 0xFF;
        freq2 |= (value & 0x07) << 8;
        this.updateChannel2Frequency(freq2);
        
        if (value & 0x80) {
          this.ch2Enabled = true;
          
          if (this.channel2Envelope.volume > 0) {
            this.channel2.gainNode.gain.value = this.channel2Envelope.volume / 15 * 0.25;
          } else {
            this.ch2Enabled = false;
          }
        }
        break;
    }
  }
  
  // Handle registers for Channel 3 (Wave)
  handleChannel3Register(register, value) {
    if (!this.channel3) return;
    
    switch (register) {
      case 0x1A: // NR30: DAC power
        this.ch3Enabled = (value & 0x80) !== 0;
        this.channel3.gainNode.gain.value = this.ch3Enabled ? 0.25 : 0;
        break;
        
      case 0x1B: // NR31: Length timer
        // Not implemented
        break;
        
      case 0x1C: // NR32: Output level
        const volume = (value >> 5) & 0x03;
        let gain = 0;
        
        switch (volume) {
          case 0: gain = 0; break;         // Mute
          case 1: gain = 1.0; break;       // 100%
          case 2: gain = 0.5; break;       // 50%
          case 3: gain = 0.25; break;      // 25%
        }
        
        this.channel3.gainNode.gain.value = this.ch3Enabled ? gain * 0.25 : 0;
        break;
        
      case 0x1D: // NR33: Frequency LSB
        let freq = (this.channel3.frequency || 0) & 0x700;
        freq |= value;
        this.updateChannel3Frequency(freq);
        break;
        
      case 0x1E: // NR34: Frequency MSB & trigger
        let freq2 = (this.channel3.frequency || 0) & 0xFF;
        freq2 |= (value & 0x07) << 8;
        this.updateChannel3Frequency(freq2);
        
        if (value & 0x80) {
          this.ch3Enabled = true;
          this.updateWaveform();
        }
        break;
    }
  }
  
  // Handle registers for Channel 4 (Noise)
  handleChannel4Register(register, value) {
    if (!this.channel4) return;
    
    switch (register) {
      case 0x20: // NR41: Length timer
        // Not implemented
        break;
        
      case 0x21: // NR42: Volume envelope
        this.channel4Envelope.volume = value >> 4;
        this.channel4Envelope.direction = (value >> 3) & 0x01;
        this.channel4Envelope.stepTime = value & 0x07;
        
        if (this.channel4.gainNode) {
          this.channel4.gainNode.gain.value = this.channel4Envelope.volume / 15 * 0.15;
        }
        
        if (this.channel4Envelope.volume === 0 && this.channel4Envelope.direction === 0) {
          this.ch4Enabled = false;
          this.channel4.gainNode.gain.value = 0;
        }
        break;
        
      case 0x22: // NR43: Clock shift & width
        // Not implemented - we're using a simple noise approximation
        break;
        
      case 0x23: // NR44: Trigger & length enable
        if (value & 0x80) {
          this.ch4Enabled = true;
          
          if (this.channel4Envelope.volume > 0) {
            this.channel4.gainNode.gain.value = this.channel4Envelope.volume / 15 * 0.15;
          } else {
            this.ch4Enabled = false;
          }
        }
        break;
    }
  }
  
  // Handle sound control registers
  handleControlRegister(register, value) {
    switch (register) {
      case 0x24: // NR50: Master volume & VIN panning
        const leftVolume = ((value >> 4) & 0x07) / 7;
        const rightVolume = (value & 0x07) / 7;
        
        // For simplicity, we just use the average for the master volume
        if (this.masterGain) {
          this.masterGain.gain.value = (leftVolume + rightVolume) / 2 * 0.25;
        }
        break;
        
      case 0x25: // NR51: Sound panning
        // Not fully implemented - would control which channel goes to which speaker
        break;
        
      case 0x26: // NR52: Sound on/off
        const masterEnable = (value & 0x80) !== 0;
        
        if (!masterEnable) {
          // Turn off all sound
          this.ch1Enabled = false;
          this.ch2Enabled = false;
          this.ch3Enabled = false;
          this.ch4Enabled = false;
          
          if (this.channel1 && this.channel1.gainNode) this.channel1.gainNode.gain.value = 0;
          if (this.channel2 && this.channel2.gainNode) this.channel2.gainNode.gain.value = 0;
          if (this.channel3 && this.channel3.gainNode) this.channel3.gainNode.gain.value = 0;
          if (this.channel4 && this.channel4.gainNode) this.channel4.gainNode.gain.value = 0;
          
          // Reset registers
          for (let i = 0x10; i <= 0x25; i++) {
            this.mmu.io[i] = 0;
          }
        }
        
        break;
    }
  }
  
  // Update channel 1 frequency
  updateChannel1Frequency() {
    if (!this.channel1) return;
    
    // Convert GB frequency to actual frequency in Hz
    // GB frequency formula: 131072/(2048-x) Hz where x is the 11-bit frequency value
    const gbFreq = 131072 / (2048 - this.ch1Frequency);
    this.channel1.frequency.value = gbFreq;
  }
  
  // Update channel 2 frequency
  updateChannel2Frequency(freq) {
    if (!this.channel2) return;
    
    this.channel2.frequency = freq;
    const gbFreq = 131072 / (2048 - freq);
    this.channel2.frequency.value = gbFreq;
  }
  
  // Update channel 3 frequency
  updateChannel3Frequency(freq) {
    if (!this.channel3) return;
    
    this.channel3.frequency = freq;
    const gbFreq = 65536 / (2048 - freq);
    this.channel3.frequency.value = gbFreq;
  }
  
  // Update channel 1 (sweep, envelope)
  updateChannel1(cycles) {
    // Simple implementation - not cycle-accurate
    if (!this.ch1Enabled || !this.channel1) return;
    
    // Update envelope
    if (this.channel1Envelope.stepTime > 0) {
      this.channel1Envelope.timer += cycles;
      
      // Envelope step time is calculated as n * 64 Hz (n * 64 cycles)
      const stepCycles = this.channel1Envelope.stepTime * 64;
      
      if (this.channel1Envelope.timer >= stepCycles) {
        this.channel1Envelope.timer -= stepCycles;
        
        // Update volume based on direction
        if (this.channel1Envelope.direction === 1) {
          // Increasing
          if (this.channel1Envelope.volume < 15) {
            this.channel1Envelope.volume++;
          }
        } else {
          // Decreasing
          if (this.channel1Envelope.volume > 0) {
            this.channel1Envelope.volume--;
          }
        }
        
        // Update gain
        this.channel1.gainNode.gain.value = this.channel1Envelope.volume / 15 * 0.25;
        
        // Disable channel if volume reaches 0
        if (this.channel1Envelope.volume === 0) {
          this.ch1Enabled = false;
        }
      }
    }
    
    // Implement sweep logic (simplified)
    // TODO: Implement proper sweep logic
  }
  
  // Update channel 2 (envelope)
  updateChannel2(cycles) {
    // Similar to channel 1 but without sweep
    if (!this.ch2Enabled || !this.channel2) return;
    
    // Update envelope
    if (this.channel2Envelope.stepTime > 0) {
      this.channel2Envelope.timer += cycles;
      
      const stepCycles = this.channel2Envelope.stepTime * 64;
      
      if (this.channel2Envelope.timer >= stepCycles) {
        this.channel2Envelope.timer -= stepCycles;
        
        if (this.channel2Envelope.direction === 1) {
          if (this.channel2Envelope.volume < 15) {
            this.channel2Envelope.volume++;
          }
        } else {
          if (this.channel2Envelope.volume > 0) {
            this.channel2Envelope.volume--;
          }
        }
        
        this.channel2.gainNode.gain.value = this.channel2Envelope.volume / 15 * 0.25;
        
        if (this.channel2Envelope.volume === 0) {
          this.ch2Enabled = false;
        }
      }
    }
  }
  
  // Update channel 3 (wave pattern)
  updateChannel3(cycles) {
    // Wave channel doesn't have an envelope
    if (!this.ch3Enabled) return;
    
    // Nothing to update for now - waveform is updated when registers change
  }
  
  // Update channel 4 (noise, envelope)
  updateChannel4(cycles) {
    if (!this.ch4Enabled || !this.channel4) return;
    
    // Update envelope
    if (this.channel4Envelope.stepTime > 0) {
      this.channel4Envelope.timer += cycles;
      
      const stepCycles = this.channel4Envelope.stepTime * 64;
      
      if (this.channel4Envelope.timer >= stepCycles) {
        this.channel4Envelope.timer -= stepCycles;
        
        if (this.channel4Envelope.direction === 1) {
          if (this.channel4Envelope.volume < 15) {
            this.channel4Envelope.volume++;
          }
        } else {
          if (this.channel4Envelope.volume > 0) {
            this.channel4Envelope.volume--;
          }
        }
        
        this.channel4.gainNode.gain.value = this.channel4Envelope.volume / 15 * 0.15;
        
        if (this.channel4Envelope.volume === 0) {
          this.ch4Enabled = false;
        }
      }
    }
  }
  
  // Create a pulse wave with the given duty cycle
  createPulseWave(dutyCycle) {
    if (!this.audioCtx) return null;
    
    // Create a single cycle waveform with the specified duty
    const samples = 32;
    const real = new Float32Array(samples);
    const imag = new Float32Array(samples);
    
    // First coefficient is average value (DC offset)
    real[0] = dutyCycle;
    
    // Calculate harmonics
    for (let i = 1; i < samples; i++) {
      const harmonic = i;
      const coefficient = 2 * Math.sin(Math.PI * harmonic * dutyCycle) / (harmonic * Math.PI);
      imag[i] = coefficient;
    }
    
    return this.audioCtx.createPeriodicWave(real, imag);
  }
  
  // Update waveform for channel 3 based on wave pattern RAM
  updateWaveform() {
    if (!this.audioCtx || !this.channel3) return;
    
    // Each byte in wave RAM contains two 4-bit samples
    const samples = 32;
    const real = new Float32Array(samples);
    const imag = new Float32Array(samples);
    
    // Calculate waveform from wave pattern RAM
    // Each byte contains two 4-bit samples
    for (let i = 0; i < 16; i++) {
      const byte = this.wavePattern[i];
      
      // High 4 bits
      const high = (byte >> 4) / 15 * 2 - 1;
      // Low 4 bits
      const low = (byte & 0x0F) / 15 * 2 - 1;
      
      real[i*2] = high;
      real[i*2+1] = low;
    }
    
    try {
      const wave = this.audioCtx.createPeriodicWave(real, imag);
      this.channel3.setPeriodicWave(wave);
    } catch (e) {
      console.error('Error creating waveform:', e);
    }
  }
  
  // Process audio data from Web Worker
  processAudioFromWorker(audioData) {
    // Implementation will depend on how audio data is structured
    if (!audioData) return;
    
    // Basic implementation - to be expanded based on audio data format
    console.log('Received audio data from worker');
  }
}