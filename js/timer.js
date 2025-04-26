/**
 * Timer Module
 * Emulates the Game Boy's timer hardware
 */

export class Timer {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.mmu = gameboy.mmu;
    
    // Timer registers
    this.div = 0;    // Divider Register (increments at 16384Hz)
    this.tima = 0;   // Timer Counter (increments at frequency specified by TAC)
    this.tma = 0;    // Timer Modulo (loaded into TIMA when it overflows)
    this.tac = 0;    // Timer Control (enables timer and sets frequency)
    
    // Internal counter used for DIV and TIMA
    this.internalCounter = 0;
    
    // Timer frequency divider
    this.timerFrequency = 4096; // Default frequency (1024Hz)
    
    // Initialize
    this.reset();
  }
  
  reset() {
    this.div = 0;
    this.tima = 0;
    this.tma = 0;
    this.tac = 0;
    this.internalCounter = 0;
    this.timerFrequency = 4096;
    
    // Reset timer registers in MMU
    this.mmu.io[0x04] = this.div;
    this.mmu.io[0x05] = this.tima;
    this.mmu.io[0x06] = this.tma;
    this.mmu.io[0x07] = this.tac;
  }
  
  // Update timer state
  update(cycles) {
    // Update internal counter
    this.internalCounter += cycles;
    
    // Update DIV register (increments at 16384Hz, which is 256 CPU cycles)
    if (this.internalCounter >= 256) {
      // Number of DIV increments
      const divIncrements = Math.floor(this.internalCounter / 256);
      this.internalCounter %= 256;
      
      this.div = (this.div + divIncrements) & 0xFF;
      this.mmu.io[0x04] = this.div;
    }
    
    // Update TIMA if timer is enabled
    if (this.tac & 0x04) {
      // Calculate how many TIMA increments to perform
      const cyclesPerIncrement = this.getCyclesPerTimaIncrement();
      const timaIncrements = Math.floor(cycles / cyclesPerIncrement);
      
      if (timaIncrements > 0) {
        // Calculate new TIMA value
        let newTima = this.tima + timaIncrements;
        
        // Check for overflows
        if (newTima > 0xFF) {
          // TIMA overflowed
          newTima = (this.tma + (newTima & 0xFF)) & 0xFF;
          
          // Request a timer interrupt
          this.requestInterrupt();
        }
        
        this.tima = newTima;
        this.mmu.io[0x05] = this.tima;
      }
    }
  }
  
  // Calculate CPU cycles per TIMA increment based on TAC
  getCyclesPerTimaIncrement() {
    const frequencyBits = this.tac & 0x03;
    
    switch (frequencyBits) {
      case 0: return 1024; // 4096Hz (CPU / 1024)
      case 1: return 16;   // 262144Hz (CPU / 16)
      case 2: return 64;   // 65536Hz (CPU / 64)
      case 3: return 256;  // 16384Hz (CPU / 256)
      default: return 1024;
    }
  }
  
  // Update timer frequency based on TAC register
  updateFrequency() {
    const frequencyBits = this.tac & 0x03;
    
    switch (frequencyBits) {
      case 0: this.timerFrequency = 4096; break;    // 4096Hz
      case 1: this.timerFrequency = 262144; break;  // 262144Hz
      case 2: this.timerFrequency = 65536; break;   // 65536Hz
      case 3: this.timerFrequency = 16384; break;   // 16384Hz
    }
  }
  
  // Request a timer interrupt
  requestInterrupt() {
    let interruptFlags = this.mmu.readByte(0xFF0F);
    interruptFlags |= 0x04; // Set bit 2 (timer interrupt)
    this.mmu.writeByte(0xFF0F, interruptFlags);
  }
  
  // Handle reads from timer registers
  read(address) {
    switch (address) {
      case 0xFF04: return this.div;
      case 0xFF05: return this.tima;
      case 0xFF06: return this.tma;
      case 0xFF07: return this.tac;
      default: return 0xFF;
    }
  }
  
  // Handle writes to timer registers
  write(address, value) {
    switch (address) {
      case 0xFF04:
        // Writing any value to DIV resets it to 0
        this.div = 0;
        this.internalCounter = 0;
        break;
        
      case 0xFF05:
        this.tima = value;
        break;
        
      case 0xFF06:
        this.tma = value;
        break;
        
      case 0xFF07:
        // Only lower 3 bits are used
        this.tac = value & 0x07;
        this.updateFrequency();
        break;
    }
  }
}

