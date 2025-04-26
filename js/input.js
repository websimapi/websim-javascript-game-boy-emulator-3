/**
 * Input Handler
 * Manages keyboard input for the Game Boy emulator
 */

export class Input {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.mmu = gameboy.mmu;
    
    // Joypad state
    this.buttonKeys = 0xF; // All buttons released (1 = released, 0 = pressed)
    this.directionKeys = 0xF; // All directions released
    
    // Selection state (0 = selected)
    this.buttonSelect = 1; // Default: not selected
    this.directionSelect = 1; // Default: not selected
    
    // Define key mappings
    this.keyMap = {
      // Arrow keys for direction
      37: { type: 'direction', bit: 1 }, // Left
      38: { type: 'direction', bit: 2 }, // Up
      39: { type: 'direction', bit: 0 }, // Right
      40: { type: 'direction', bit: 3 }, // Down
      
      // Z, X, Enter, Shift for A, B, Start, Select
      90: { type: 'button', bit: 0 },  // Z = A
      88: { type: 'button', bit: 1 },  // X = B
      13: { type: 'button', bit: 3 },  // Enter = Start
      16: { type: 'button', bit: 2 }   // Shift = Select
    };
    
    // Initialize
    this.reset();
  }
  
  reset() {
    this.buttonKeys = 0xF;
    this.directionKeys = 0xF;
    this.buttonSelect = 1;
    this.directionSelect = 1;
    
    // Reset joypad register in MMU
    this.updateJoypadRegister();
  }
  
  // Handle key down events
  handleKeyDown(e) {
    const key = this.keyMap[e.keyCode];
    if (!key) return;
    
    if (key.type === 'button') {
      // Clear the bit (pressed = 0)
      this.buttonKeys &= ~(1 << key.bit);
    } else if (key.type === 'direction') {
      // Clear the bit (pressed = 0)
      this.directionKeys &= ~(1 << key.bit);
    }
    
    this.updateJoypadRegister();
    
    // Prevent default action for mapped keys
    e.preventDefault();
  }
  
  // Handle key up events
  handleKeyUp(e) {
    const key = this.keyMap[e.keyCode];
    if (!key) return;
    
    if (key.type === 'button') {
      // Set the bit (released = 1)
      this.buttonKeys |= (1 << key.bit);
    } else if (key.type === 'direction') {
      // Set the bit (released = 1)
      this.directionKeys |= (1 << key.bit);
    }
    
    this.updateJoypadRegister();
    
    // Prevent default action for mapped keys
    e.preventDefault();
  }
  
  // Read the current state of the joypad
  readJoypad() {
    // Bits 0-3: Button/Direction state (0=pressed, 1=released)
    // Bits 4-5: Selection (0=select, 1=not selected)
    // Bits 6-7: Always 1
    
    let value = 0xCF; // Default: bits 6-7 set, others clear
    
    // Update selection bits based on register value
    this.buttonSelect = (this.mmu.io[0x00] & 0x20) ? 1 : 0;
    this.directionSelect = (this.mmu.io[0x00] & 0x10) ? 1 : 0;
    
    // Apply selection bits
    value &= ~((this.buttonSelect << 5) | (this.directionSelect << 4));
    
    // Apply button/direction state based on selection
    if (this.buttonSelect === 0) {
      value &= 0xF0; // Clear lower 4 bits
      value |= (this.buttonKeys & 0x0F); // Set from button state
    }
    
    if (this.directionSelect === 0) {
      value &= 0xF0; // Clear lower 4 bits
      value |= (this.directionKeys & 0x0F); // Set from direction state
    }
    
    return value;
  }
  
  // Update the joypad register and request interrupt if needed
  updateJoypadRegister() {
    const prevValue = this.mmu.io[0x00];
    const newValue = this.readJoypad();
    
    // Update the register value
    this.mmu.io[0x00] = newValue;
    
    // Check if any button/direction changed from not pressed to pressed
    // P10-P13 bits going from 1 to 0 trigger the interrupt
    const previousUnpressed = prevValue & 0x0F; // 1 = unpressed
    const currentUnpressed = newValue & 0x0F;   // 1 = unpressed
    
    // If any bit went from 1 to 0 (unpressed to pressed)
    if ((previousUnpressed & ~currentUnpressed) !== 0) {
      // Request joypad interrupt
      this.requestJoypadInterrupt();
    }
  }
  
  // Request a joypad interrupt
  requestJoypadInterrupt() {
    let interruptFlags = this.mmu.readByte(0xFF0F);
    interruptFlags |= 0x10; // Set bit 4 (joypad interrupt)
    this.mmu.writeByte(0xFF0F, interruptFlags);
  }
}

