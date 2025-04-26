/**
 * Memory Management Unit (MMU)
 * Handles all memory access and mapping for the Game Boy
 */

export class MMU {
  constructor(gameboy) {
    this.gameboy = gameboy;
    
    // Memory areas
    this.rom = null;       // Cartridge ROM
    this.vram = new Uint8Array(0x2000);      // Video RAM (8KB)
    this.eram = new Uint8Array(0x8000);      // External RAM (32KB max)
    this.wram = new Uint8Array(0x2000);      // Work RAM (8KB)
    this.oam = new Uint8Array(0xA0);         // Object Attribute Memory
    this.io = new Uint8Array(0x80);          // I/O Registers
    this.hram = new Uint8Array(0x7F);        // High RAM
    
    // Memory banking
    this.romBank = 1;      // Current ROM bank
    this.ramBank = 0;      // Current RAM bank
    this.ramEnabled = false;
    this.mbc = 0;          // MBC type
    this.mode = 0;         // ROM/RAM mode
    
    // Interrupt Enable register (0xFFFF)
    this.ie = 0;
    
    // Initialize
    this.reset();
  }
  
  reset() {
    // Clear all memory
    this.vram.fill(0);
    this.eram.fill(0);
    this.wram.fill(0);
    this.oam.fill(0);
    this.io.fill(0);
    this.hram.fill(0);
    
    // Set ROM bank to 1
    this.romBank = 1;
    this.ramBank = 0;
    this.ramEnabled = false;
    this.mode = 0;
    
    // Reset interrupt enable register
    this.ie = 0;
    
    // Initialize IO registers with their boot values
    this.io[0x05] = 0x00; // TIMA
    this.io[0x06] = 0x00; // TMA
    this.io[0x07] = 0x00; // TAC
    this.io[0x10] = 0x80; // NR10
    this.io[0x11] = 0xBF; // NR11
    this.io[0x12] = 0xF3; // NR12
    this.io[0x14] = 0xBF; // NR14
    this.io[0x16] = 0x3F; // NR21
    this.io[0x17] = 0x00; // NR22
    this.io[0x19] = 0xBF; // NR24
    this.io[0x1A] = 0x7F; // NR30
    this.io[0x1B] = 0xFF; // NR31
    this.io[0x1C] = 0x9F; // NR32
    this.io[0x1E] = 0xBF; // NR33
    this.io[0x20] = 0xFF; // NR41
    this.io[0x21] = 0x00; // NR42
    this.io[0x22] = 0x00; // NR43
    this.io[0x23] = 0xBF; // NR44
    this.io[0x24] = 0x77; // NR50
    this.io[0x25] = 0xF3; // NR51
    this.io[0x26] = 0xF1; // NR52
    this.io[0x40] = 0x91; // LCDC
    this.io[0x42] = 0x00; // SCY
    this.io[0x43] = 0x00; // SCX
    this.io[0x45] = 0x00; // LYC
    this.io[0x47] = 0xFC; // BGP
    this.io[0x48] = 0xFF; // OBP0
    this.io[0x49] = 0xFF; // OBP1
    this.io[0x4A] = 0x00; // WY
    this.io[0x4B] = 0x00; // WX
    this.io[0x0F] = 0xE1; // IF
    
    // If we have loaded a cartridge, set the MBC type
    if (this.gameboy.cartridge && this.gameboy.cartridge.rom) {
      this.rom = this.gameboy.cartridge.rom;
      this.mbc = this.gameboy.cartridge.mbc;
    }
  }
  
  // Read a byte from memory
  readByte(address) {
    // ROM bank 0
    if (address < 0x4000) {
      return this.rom[address];
    }
    
    // Switchable ROM bank
    else if (address < 0x8000) {
      const bankAddress = ((this.romBank * 0x4000) + (address - 0x4000)) % this.rom.length;
      return this.rom[bankAddress];
    }
    
    // VRAM
    else if (address < 0xA000) {
      // Check if VRAM is accessible (not being used by PPU)
      if (this.gameboy.ppu && this.gameboy.ppu.mode === 3) {
        return 0xFF; // VRAM is inaccessible during mode 3
      }
      return this.vram[address - 0x8000];
    }
    
    // External RAM
    else if (address < 0xC000) {
      if (this.ramEnabled) {
        const ramAddress = (this.ramBank * 0x2000) + (address - 0xA000);
        return this.eram[ramAddress % this.eram.length];
      }
      return 0xFF;
    }
    
    // Work RAM
    else if (address < 0xE000) {
      return this.wram[address - 0xC000];
    }
    
    // Echo RAM (mirror of C000-DDFF)
    else if (address < 0xFE00) {
      return this.wram[address - 0xE000];
    }
    
    // OAM
    else if (address < 0xFEA0) {
      // Check if OAM is accessible (not being used by PPU)
      if (this.gameboy.ppu && (this.gameboy.ppu.mode === 2 || this.gameboy.ppu.mode === 3)) {
        return 0xFF; // OAM is inaccessible during modes 2 and 3
      }
      return this.oam[address - 0xFE00];
    }
    
    // Not usable
    else if (address < 0xFF00) {
      return 0xFF;
    }
    
    // I/O Registers
    else if (address < 0xFF80) {
      // Special handling for I/O registers
      const register = address & 0xFF;
      
      // Joypad register (0xFF00)
      if (register === 0x00) {
        return this.gameboy.input.readJoypad();
      }
      
      // Serial data transfer (0xFF01-0xFF02)
      if (register === 0x01 || register === 0x02) {
        return this.io[register];
      }
      
      // Timer registers (0xFF04-0xFF07)
      if (register >= 0x04 && register <= 0x07) {
        if (register === 0x04) {
          return this.gameboy.timer.div;
        }
        return this.io[register];
      }
      
      // Interrupt Flag (0xFF0F)
      if (register === 0x0F) {
        return this.io[0x0F];
      }
      
      // Audio registers (0xFF10-0xFF3F)
      if (register >= 0x10 && register <= 0x3F) {
        return this.io[register];
      }
      
      // LCD registers (0xFF40-0xFF4B)
      if (register >= 0x40 && register <= 0x4B) {
        // LY register (0xFF44) - current scanline
        if (register === 0x44) {
          return this.gameboy.ppu ? this.gameboy.ppu.ly : 0;
        }
        return this.io[register];
      }
      
      return this.io[register];
    }
    
    // High RAM
    else if (address < 0xFFFF) {
      return this.hram[address - 0xFF80];
    }
    
    // Interrupt Enable register
    else if (address === 0xFFFF) {
      return this.ie;
    }
    
    return 0xFF;
  }
  
  // Write a byte to memory
  writeByte(address, value) {
    // ROM bank 0 & Switchable ROM bank - handle MBC commands
    if (address < 0x8000) {
      this.handleMBC(address, value);
      return;
    }
    
    // VRAM
    else if (address < 0xA000) {
      // Check if VRAM is accessible
      if (this.gameboy.ppu && this.gameboy.ppu.mode === 3) {
        return; // VRAM is inaccessible during mode 3
      }
      this.vram[address - 0x8000] = value;
    }
    
    // External RAM
    else if (address < 0xC000) {
      if (this.ramEnabled) {
        const ramAddress = (this.ramBank * 0x2000) + (address - 0xA000);
        this.eram[ramAddress % this.eram.length] = value;
      }
    }
    
    // Work RAM
    else if (address < 0xE000) {
      this.wram[address - 0xC000] = value;
    }
    
    // Echo RAM (mirror of C000-DDFF)
    else if (address < 0xFE00) {
      this.wram[address - 0xE000] = value;
    }
    
    // OAM
    else if (address < 0xFEA0) {
      // Check if OAM is accessible
      if (this.gameboy.ppu && (this.gameboy.ppu.mode === 2 || this.gameboy.ppu.mode === 3)) {
        return; // OAM is inaccessible during modes 2 and 3
      }
      this.oam[address - 0xFE00] = value;
    }
    
    // Not usable
    else if (address < 0xFF00) {
      // Do nothing
    }
    
    // I/O Registers
    else if (address < 0xFF80) {
      const register = address & 0xFF;
      
      // Joypad register (0xFF00)
      if (register === 0x00) {
        this.io[0x00] = value & 0x30; // Only bits 4-5 are writable
        return;
      }
      
      // Serial data transfer (0xFF01-0xFF02)
      if (register === 0x01 || register === 0x02) {
        this.io[register] = value;
        return;
      }
      
      // Timer registers (0xFF04-0xFF07)
      if (register >= 0x04 && register <= 0x07) {
        if (register === 0x04) {
          this.gameboy.timer.div = 0; // Writing to DIV resets it to 0
        } else {
          this.io[register] = value;
          if (register === 0x07) {
            this.gameboy.timer.updateFrequency(); // Update timer frequency on TAC write
          }
        }
        return;
      }
      
      // Interrupt Flag (0xFF0F)
      if (register === 0x0F) {
        this.io[0x0F] = value & 0x1F; // Only bits 0-4 are used
        return;
      }
      
      // DMA Transfer (0xFF46)
      if (register === 0x46) {
        this.dmaTransfer(value);
        this.io[register] = value;
        return;
      }
      
      // Audio registers (0xFF10-0xFF3F)
      if (register >= 0x10 && register <= 0x3F) {
        this.io[register] = value;
        // Notify APU of the register change
        if (this.gameboy.apu) {
          this.gameboy.apu.writeRegister(register, value);
        }
        return;
      }
      
      // LCD registers (0xFF40-0xFF4B)
      if (register >= 0x40 && register <= 0x4B) {
        // LY register (0xFF44) is read-only
        if (register === 0x44) {
          return;
        }
        
        this.io[register] = value;
        
        // LCDC register (0xFF40) - Handle LCD enable/disable
        if (register === 0x40 && this.gameboy.ppu) {
          const lcdEnabled = (value & 0x80) !== 0;
          // If LCD status changed
          if (lcdEnabled !== this.gameboy.ppu.lcdEnabled) {
            this.gameboy.ppu.setLCDStatus(lcdEnabled);
          }
        }
        
        // LYC register (0xFF45) - Check LYC=LY coincidence
        if (register === 0x45 && this.gameboy.ppu) {
          this.gameboy.ppu.checkLYC();
        }
        
        // STAT register (0xFF41) - Update LCD status
        if (register === 0x41 && this.gameboy.ppu) {
          // Only bits 3-6 are writable
          this.io[0x41] = (value & 0x78) | (this.io[0x41] & 0x87);
          this.gameboy.ppu.updateSTAT();
        }
        
        return;
      }
      
      this.io[register] = value;
    }
    
    // High RAM
    else if (address < 0xFFFF) {
      this.hram[address - 0xFF80] = value;
    }
    
    // Interrupt Enable register
    else if (address === 0xFFFF) {
      this.ie = value;
    }
  }
  
  // Read a 16-bit word from memory
  readWord(address) {
    const low = this.readByte(address);
    const high = this.readByte(address + 1);
    return (high << 8) | low;
  }
  
  // Write a 16-bit word to memory
  writeWord(address, value) {
    this.writeByte(address, value & 0xFF);
    this.writeByte(address + 1, (value >> 8) & 0xFF);
  }
  
  // Handle Memory Bank Controller operations
  handleMBC(address, value) {
    switch (this.mbc) {
      case 0: // ROM Only
        // No banking, can't write to ROM
        break;
        
      case 1: // MBC1
        this.handleMBC1(address, value);
        break;
        
      case 2: // MBC2
        this.handleMBC2(address, value);
        break;
        
      case 3: // MBC3
        this.handleMBC3(address, value);
        break;
        
      case 5: // MBC5
        this.handleMBC5(address, value);
        break;
    }
  }
  
  // Handle MBC1 controller
  handleMBC1(address, value) {
    // RAM Enable (0000-1FFF)
    if (address < 0x2000) {
      this.ramEnabled = (value & 0x0F) === 0x0A;
    }
    
    // ROM Bank Number (2000-3FFF)
    else if (address < 0x4000) {
      let bank = value & 0x1F; // 5 bits
      if (bank === 0) bank = 1; // Bank 0 -> Bank 1
      
      // Replace lower 5 bits of current ROM bank
      this.romBank = (this.romBank & 0x60) | bank;
    }
    
    // RAM Bank Number or Upper Bits of ROM Bank Number (4000-5FFF)
    else if (address < 0x6000) {
      value &= 0x03; // 2 bits
      
      if (this.mode === 0) {
        // ROM banking mode: Set upper bits of ROM bank
        this.romBank = (this.romBank & 0x1F) | (value << 5);
      } else {
        // RAM banking mode: Set RAM bank
        this.ramBank = value;
      }
    }
    
    // Banking Mode Select (6000-7FFF)
    else if (address < 0x8000) {
      this.mode = value & 0x01;
      
      if (this.mode === 0) {
        this.ramBank = 0; // Reset RAM bank in ROM mode
      }
    }
  }
  
  // Handle MBC2 controller
  handleMBC2(address, value) {
    // RAM Enable (0000-1FFF) - bit 8 of address must be 0
    if (address < 0x2000) {
      if ((address & 0x0100) === 0) {
        this.ramEnabled = (value & 0x0F) === 0x0A;
      }
    }
    
    // ROM Bank Number (2000-3FFF) - bit 8 of address must be 1
    else if (address < 0x4000) {
      if ((address & 0x0100) !== 0) {
        let bank = value & 0x0F; // 4 bits
        if (bank === 0) bank = 1; // Bank 0 -> Bank 1
        this.romBank = bank;
      }
    }
  }
  
  // Handle MBC3 controller
  handleMBC3(address, value) {
    // RAM and Timer Enable (0000-1FFF)
    if (address < 0x2000) {
      this.ramEnabled = (value & 0x0F) === 0x0A;
    }
    
    // ROM Bank Number (2000-3FFF)
    else if (address < 0x4000) {
      let bank = value & 0x7F; // 7 bits
      if (bank === 0) bank = 1; // Bank 0 -> Bank 1
      this.romBank = bank;
    }
    
    // RAM Bank Number or RTC Register Select (4000-5FFF)
    else if (address < 0x6000) {
      this.ramBank = value;
    }
    
    // Latch Clock Data (6000-7FFF)
    else if (address < 0x8000) {
      // RTC functionality not implemented
    }
  }
  
  // Handle MBC5 controller
  handleMBC5(address, value) {
    // RAM Enable (0000-1FFF)
    if (address < 0x2000) {
      this.ramEnabled = (value & 0x0F) === 0x0A;
    }
    
    // ROM Bank Number Low (2000-2FFF)
    else if (address < 0x3000) {
      this.romBank = (this.romBank & 0x100) | value;
    }
    
    // ROM Bank Number High (3000-3FFF)
    else if (address < 0x4000) {
      this.romBank = (this.romBank & 0xFF) | ((value & 0x01) << 8);
    }
    
    // RAM Bank Number (4000-5FFF)
    else if (address < 0x6000) {
      this.ramBank = value & 0x0F;
    }
  }
  
  // Perform DMA transfer (from XX00-XX9F to FE00-FE9F)
  dmaTransfer(value) {
    const source = value << 8; // XX00
    
    // Copy 160 bytes (0xA0) from source to OAM
    for (let i = 0; i < 0xA0; i++) {
      const byte = this.readByte(source + i);
      this.oam[i] = byte;
    }
  }
}

