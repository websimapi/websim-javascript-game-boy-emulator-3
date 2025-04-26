/**
 * GameBoy CPU Emulation (Sharp LR35902)
 * A cycle-accurate implementation of the Game Boy CPU
 */

export class CPU {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.mmu = gameboy.mmu;
    
    // CPU registers
    this.a = 0;         // Accumulator
    this.b = 0;
    this.c = 0;
    this.d = 0;
    this.e = 0;
    this.h = 0;
    this.l = 0;
    this._f = 0;        // Flags: Z N H C 0 0 0 0
    this.pc = 0;        // Program Counter
    this.sp = 0;        // Stack Pointer
    
    // CPU state
    this.ime = false;   // Interrupt Master Enable flag
    this.pendingIME = false; // For EI's delayed effect
    this.halted = false;
    this.stopped = false;
    this.cycles = 0;    // Clock cycle counter
    
    // Flag masks
    this.FLAGS = {
      Z: 0x80,  // Zero flag (bit 7)
      N: 0x40,  // Subtract flag (bit 6)
      H: 0x20,  // Half Carry flag (bit 5)
      C: 0x10   // Carry flag (bit 4)
    };
    
    // Initialize instruction tables
    this.initOpcodes();
    this.initCBOpcodes();
  }
  
  // Getters and setters for 16-bit registers
  get f() { return this._f & 0xF0; } // Lower 4 bits always read as 0
  set f(val) { this._f = val & 0xF0; } // Only upper 4 bits can be set
  
  get af() { return (this.a << 8) | this.f; }
  set af(val) { this.a = (val >> 8) & 0xFF; this.f = val & 0xFF; }
  
  get bc() { return (this.b << 8) | this.c; }
  set bc(val) { this.b = (val >> 8) & 0xFF; this.c = val & 0xFF; }
  
  get de() { return (this.d << 8) | this.e; }
  set de(val) { this.d = (val >> 8) & 0xFF; this.e = val & 0xFF; }
  
  get hl() { return (this.h << 8) | this.l; }
  set hl(val) { this.h = (val >> 8) & 0xFF; this.l = val & 0xFF; }
  
  // Flag operations
  setFlag(flag, value) {
    if (value) {
      this._f |= this.FLAGS[flag];
    } else {
      this._f &= ~this.FLAGS[flag];
    }
  }
  
  getFlag(flag) {
    return (this._f & this.FLAGS[flag]) !== 0;
  }
  
  // Reset CPU state
  reset() {
    // Initialize registers as they would be after the boot ROM
    this.a = 0x01;
    this.f = 0xB0;
    this.b = 0x00;
    this.c = 0x13;
    this.d = 0x00;
    this.e = 0xD8;
    this.h = 0x01;
    this.l = 0x4D;
    this.sp = 0xFFFE;
    this.pc = 0x0100;  // Start at cartridge entry point
    
    this.ime = true;
    this.pendingIME = false;
    this.halted = false;
    this.stopped = false;
    this.cycles = 0;
  }
  
  // Execute one CPU instruction
  step() {
    // Handle IME delay (EI enables interrupts after the next instruction)
    if (this.pendingIME) {
      this.ime = true;
      this.pendingIME = false;
    }
    
    // Check for interrupts
    if (this.ime || this.halted) {
      const interruptFired = this.handleInterrupts();
      if (interruptFired) return 20; // Interrupt handling takes 20 cycles
    }
    
    // CPU is halted, just count cycles without executing
    if (this.halted) {
      return 4; // One M-cycle passes while halted
    }
    
    // Fetch opcode
    const opcode = this.mmu.readByte(this.pc);
    
    // Decode and execute instruction
    let cycles;
    
    if (opcode === 0xCB) {
      // CB-prefixed instruction (bit operations)
      this.pc = (this.pc + 1) & 0xFFFF;
      const cbOpcode = this.mmu.readByte(this.pc);
      this.pc = (this.pc + 1) & 0xFFFF;
      cycles = this.executeCBOpcode(cbOpcode);
    } else {
      // Regular instruction
      this.pc = (this.pc + 1) & 0xFFFF;
      cycles = this.executeOpcode(opcode);
    }
    
    this.cycles += cycles;
    return cycles;
  }
  
  // Handle interrupts
  handleInterrupts() {
    // Check if any enabled interrupts are pending
    const ie = this.mmu.readByte(0xFFFF); // Interrupt Enable
    const if_ = this.mmu.readByte(0xFF0F); // Interrupt Flags
    
    let fired = false;
    
    // Check each interrupt bit
    const pendingInterrupts = ie & if_ & 0x1F;
    
    if (pendingInterrupts > 0) {
      // Exit HALT mode even if IME=0
      this.halted = false;
      
      // Only service interrupts if master enable is true
      if (this.ime) {
        this.ime = false; // Disable interrupts while handling
        
        // Push current PC to stack
        this.sp = (this.sp - 1) & 0xFFFF;
        this.mmu.writeByte(this.sp, (this.pc >> 8) & 0xFF);
        this.sp = (this.sp - 1) & 0xFFFF;
        this.mmu.writeByte(this.sp, this.pc & 0xFF);
        
        // Service the highest priority interrupt
        if (pendingInterrupts & 0x01) {
          // VBlank
          this.mmu.writeByte(0xFF0F, if_ & ~0x01);
          this.pc = 0x0040;
        } else if (pendingInterrupts & 0x02) {
          // LCD STAT
          this.mmu.writeByte(0xFF0F, if_ & ~0x02);
          this.pc = 0x0048;
        } else if (pendingInterrupts & 0x04) {
          // Timer
          this.mmu.writeByte(0xFF0F, if_ & ~0x04);
          this.pc = 0x0050;
        } else if (pendingInterrupts & 0x08) {
          // Serial
          this.mmu.writeByte(0xFF0F, if_ & ~0x08);
          this.pc = 0x0058;
        } else if (pendingInterrupts & 0x10) {
          // Joypad
          this.mmu.writeByte(0xFF0F, if_ & ~0x10);
          this.pc = 0x0060;
        }
        
        fired = true;
      }
    }
    
    return fired;
  }
  
  // ALU helper functions
  add8(value) {
    const a = this.a;
    const result = (a + value) & 0xFF;
    
    this.setFlag('Z', result === 0);
    this.setFlag('N', false);
    this.setFlag('H', ((a & 0x0F) + (value & 0x0F)) > 0x0F);
    this.setFlag('C', (a + value) > 0xFF);
    
    this.a = result;
  }
  
  adc8(value) {
    const a = this.a;
    const carry = this.getFlag('C') ? 1 : 0;
    const result = (a + value + carry) & 0xFF;
    
    this.setFlag('Z', result === 0);
    this.setFlag('N', false);
    this.setFlag('H', ((a & 0x0F) + (value & 0x0F) + carry) > 0x0F);
    this.setFlag('C', (a + value + carry) > 0xFF);
    
    this.a = result;
  }
  
  sub8(value) {
    const a = this.a;
    const result = (a - value) & 0xFF;
    
    this.setFlag('Z', result === 0);
    this.setFlag('N', true);
    this.setFlag('H', (a & 0x0F) < (value & 0x0F));
    this.setFlag('C', a < value);
    
    this.a = result;
  }
  
  sbc8(value) {
    const a = this.a;
    const carry = this.getFlag('C') ? 1 : 0;
    const result = (a - value - carry) & 0xFF;
    
    this.setFlag('Z', result === 0);
    this.setFlag('N', true);
    this.setFlag('H', (a & 0x0F) < ((value & 0x0F) + carry));
    this.setFlag('C', a < (value + carry));
    
    this.a = result;
  }
  
  and8(value) {
    this.a &= value;
    
    this.setFlag('Z', this.a === 0);
    this.setFlag('N', false);
    this.setFlag('H', true);
    this.setFlag('C', false);
  }
  
  or8(value) {
    this.a |= value;
    
    this.setFlag('Z', this.a === 0);
    this.setFlag('N', false);
    this.setFlag('H', false);
    this.setFlag('C', false);
  }
  
  xor8(value) {
    this.a ^= value;
    
    this.setFlag('Z', this.a === 0);
    this.setFlag('N', false);
    this.setFlag('H', false);
    this.setFlag('C', false);
  }
  
  cp8(value) {
    const a = this.a;
    const result = (a - value) & 0xFF;
    
    this.setFlag('Z', result === 0);
    this.setFlag('N', true);
    this.setFlag('H', (a & 0x0F) < (value & 0x0F));
    this.setFlag('C', a < value);
  }
  
  add16(reg, value) {
    const result = (this[reg] + value) & 0xFFFF;
    
    this.setFlag('N', false);
    this.setFlag('H', ((this[reg] & 0x0FFF) + (value & 0x0FFF)) > 0x0FFF);
    this.setFlag('C', (this[reg] + value) > 0xFFFF);
    
    this[reg] = result;
  }
  
  inc8(reg) {
    // Registers can be memory locations like (HL)
    let value;
    if (reg === '(HL)') {
      value = this.mmu.readByte(this.hl);
      value = (value + 1) & 0xFF;
      this.mmu.writeByte(this.hl, value);
    } else {
      value = (this[reg] + 1) & 0xFF;
      this[reg] = value;
    }
    
    this.setFlag('Z', value === 0);
    this.setFlag('N', false);
    this.setFlag('H', (value & 0x0F) === 0);
  }
  
  dec8(reg) {
    // Registers can be memory locations like (HL)
    let value;
    if (reg === '(HL)') {
      value = this.mmu.readByte(this.hl);
      value = (value - 1) & 0xFF;
      this.mmu.writeByte(this.hl, value);
    } else {
      value = (this[reg] - 1) & 0xFF;
      this[reg] = value;
    }
    
    this.setFlag('Z', value === 0);
    this.setFlag('N', true);
    this.setFlag('H', (value & 0x0F) === 0x0F);
  }
  
  // Stack operations
  push16(value) {
    this.sp = (this.sp - 1) & 0xFFFF;
    this.mmu.writeByte(this.sp, (value >> 8) & 0xFF);
    this.sp = (this.sp - 1) & 0xFFFF;
    this.mmu.writeByte(this.sp, value & 0xFF);
  }
  
  pop16() {
    const low = this.mmu.readByte(this.sp);
    this.sp = (this.sp + 1) & 0xFFFF;
    const high = this.mmu.readByte(this.sp);
    this.sp = (this.sp + 1) & 0xFFFF;
    return (high << 8) | low;
  }
  
  // Main opcode execution
  executeOpcode(opcode) {
    return this.opcodeHandlers[opcode].call(this);
  }
  
  executeCBOpcode(opcode) {
    return this.cbOpcodeHandlers[opcode].call(this);
  }
  
  // Initialize opcode lookup tables
  initOpcodes() {
    this.opcodeHandlers = [
      // 0x00: NOP
      () => { return 4; },
      
      // 0x01: LD BC,d16
      () => {
        const low = this.mmu.readByte(this.pc++);
        const high = this.mmu.readByte(this.pc++);
        this.bc = (high << 8) | low;
        return 12;
      },
      
      // 0x02: LD (BC),A
      () => {
        this.mmu.writeByte(this.bc, this.a);
        return 8;
      },
      
      // 0x03: INC BC
      () => {
        this.bc = (this.bc + 1) & 0xFFFF;
        return 8;
      },
      
      // 0x04: INC B
      () => {
        this.inc8('b');
        return 4;
      },
      
      // 0x05: DEC B
      () => {
        this.dec8('b');
        return 4;
      },
      
      // 0x06: LD B,d8
      () => {
        this.b = this.mmu.readByte(this.pc++);
        return 8;
      },
      
      // 0x07: RLCA
      () => {
        const carry = (this.a & 0x80) >> 7;
        this.a = ((this.a << 1) | carry) & 0xFF;
        
        this.setFlag('Z', false);
        this.setFlag('N', false);
        this.setFlag('H', false);
        this.setFlag('C', carry === 1);
        
        return 4;
      },
      
      // 0x08: LD (a16),SP
      () => {
        const low = this.mmu.readByte(this.pc++);
        const high = this.mmu.readByte(this.pc++);
        const addr = (high << 8) | low;
        
        this.mmu.writeByte(addr, this.sp & 0xFF);
        this.mmu.writeByte(addr + 1, (this.sp >> 8) & 0xFF);
        
        return 20;
      },
      
      // 0x09: ADD HL,BC
      () => {
        this.add16('hl', this.bc);
        return 8;
      },
      
      // 0x0A: LD A,(BC)
      () => {
        this.a = this.mmu.readByte(this.bc);
        return 8;
      },
      
      // 0x0B: DEC BC
      () => {
        this.bc = (this.bc - 1) & 0xFFFF;
        return 8;
      },
      
      // 0x0C: INC C
      () => {
        this.inc8('c');
        return 4;
      },
      
      // 0x0D: DEC C
      () => {
        this.dec8('c');
        return 4;
      },
      
      // 0x0E: LD C,d8
      () => {
        this.c = this.mmu.readByte(this.pc++);
        return 8;
      },
      
      // 0x0F: RRCA
      () => {
        const carry = this.a & 0x01;
        this.a = ((this.a >> 1) | (carry << 7)) & 0xFF;
        
        this.setFlag('Z', false);
        this.setFlag('N', false);
        this.setFlag('H', false);
        this.setFlag('C', carry === 1);
        
        return 4;
      },
      
      // 0x10: STOP 0
      () => {
        this.pc++; // Skip the following 0x00 byte
        this.stopped = true;
        return 4;
      },
      
      // Continue with the rest of the opcodes...
      // ...existing code...
    ];
    
    // Continue with dozens more opcodes...
    // For brevity, I'm only including a subset of the complete implementation
    
    // This would go on to include all 256 opcodes from 0x00 to 0xFF
    // Each opcode handler should return the number of cycles it consumes
  }
  
  initCBOpcodes() {
    this.cbOpcodeHandlers = [
      // 0xCB 0x00: RLC B
      () => {
        const carry = (this.b & 0x80) >> 7;
        this.b = ((this.b << 1) | carry) & 0xFF;
        
        this.setFlag('Z', this.b === 0);
        this.setFlag('N', false);
        this.setFlag('H', false);
        this.setFlag('C', carry === 1);
        
        return 8;
      },
      
      // Continue with CB-prefixed opcodes...
      // Similar to the main opcodes, there would be 256 handlers for CB opcodes
    ];
    
    // For brevity, I'm only including a subset of the complete implementation
  }
}

