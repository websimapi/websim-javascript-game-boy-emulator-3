/**
 * Cartridge Module
 * Handles ROM loading and cartridge type detection
 */

export class Cartridge {
  constructor(romData) {
    this.rom = null;
    this.ramBanks = 0;
    this.ramSize = 0;
    this.mbc = 0;
    this.name = '';
    this.type = 0;
    
    if (romData) {
      this.loadRom(romData);
    }
  }
  
  loadRom(romData) {
    if (!romData || !romData.length) {
      throw new Error('Invalid ROM data');
    }
    
    // Store ROM data
    this.rom = new Uint8Array(romData);
    
    // Parse cartridge header
    this.parseHeader();
    
    console.log('Loaded ROM:', {
      name: this.name,
      type: this.getCartridgeType(),
      romSize: this.rom.length,
      ramSize: this.ramSize,
      ramBanks: this.ramBanks,
      mbc: this.mbc
    });
  }
  
  parseHeader() {
    // Extract cartridge name (0x134-0x143)
    let name = '';
    for (let i = 0x134; i <= 0x143; i++) {
      const char = this.rom[i];
      // Stop at the first 0 or non-ASCII character
      if (char === 0 || char > 127) break;
      name += String.fromCharCode(char);
    }
    this.name = name.trim();
    
    // Cartridge type (0x147)
    this.type = this.rom[0x147];
    
    // Determine MBC type
    this.determineMBC();
    
    // ROM size (0x148)
    const romSizeCode = this.rom[0x148];
    // ROM size formula: 32KB << n (where n is the ROM size code)
    
    // RAM size (0x149)
    const ramSizeCode = this.rom[0x149];
    
    // Determine RAM size and banks
    switch (ramSizeCode) {
      case 0x00:
        this.ramSize = 0;
        this.ramBanks = 0;
        break;
      case 0x01:
        this.ramSize = 2 * 1024; // 2KB
        this.ramBanks = 1;
        break;
      case 0x02:
        this.ramSize = 8 * 1024; // 8KB
        this.ramBanks = 1;
        break;
      case 0x03:
        this.ramSize = 32 * 1024; // 32KB (4 banks of 8KB)
        this.ramBanks = 4;
        break;
      case 0x04:
        this.ramSize = 128 * 1024; // 128KB (16 banks of 8KB)
        this.ramBanks = 16;
        break;
      case 0x05:
        this.ramSize = 64 * 1024; // 64KB (8 banks of 8KB)
        this.ramBanks = 8;
        break;
      default:
        this.ramSize = 0;
        this.ramBanks = 0;
    }
    
    // Verify Nintendo logo (0x104-0x133)
    // This is a simple check for valid ROMs
    const nintendoLogo = [
      0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
      0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
      0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E
    ];
    
    let logoValid = true;
    for (let i = 0; i < nintendoLogo.length; i++) {
      if (this.rom[0x104 + i] !== nintendoLogo[i]) {
        logoValid = false;
        break;
      }
    }
    
    if (!logoValid) {
      console.warn('Nintendo logo check failed - ROM may be invalid');
    }
    
    // Validate header checksum (0x14D)
    let checksum = 0;
    for (let i = 0x134; i <= 0x14C; i++) {
      checksum = checksum - this.rom[i] - 1;
    }
    checksum &= 0xFF;
    
    if (checksum !== this.rom[0x14D]) {
      console.warn('Header checksum invalid - ROM may be corrupted');
    }
  }
  
  determineMBC() {
    switch (this.type) {
      case 0x00:
        // ROM ONLY
        this.mbc = 0;
        break;
        
      case 0x01:
      case 0x02:
      case 0x03:
        // MBC1
        this.mbc = 1;
        break;
        
      case 0x05:
      case 0x06:
        // MBC2
        this.mbc = 2;
        break;
        
      case 0x0F:
      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
        // MBC3
        this.mbc = 3;
        break;
        
      case 0x19:
      case 0x1A:
      case 0x1B:
      case 0x1C:
      case 0x1D:
      case 0x1E:
        // MBC5
        this.mbc = 5;
        break;
        
      default:
        console.warn('Unsupported cartridge type:', this.type);
        this.mbc = 0; // Default to ROM ONLY
    }
  }
  
  getCartridgeType() {
    const types = {
      0x00: 'ROM ONLY',
      0x01: 'MBC1',
      0x02: 'MBC1+RAM',
      0x03: 'MBC1+RAM+BATTERY',
      0x05: 'MBC2',
      0x06: 'MBC2+BATTERY',
      0x08: 'ROM+RAM',
      0x09: 'ROM+RAM+BATTERY',
      0x0B: 'MMM01',
      0x0C: 'MMM01+RAM',
      0x0D: 'MMM01+RAM+BATTERY',
      0x0F: 'MBC3+TIMER+BATTERY',
      0x10: 'MBC3+TIMER+RAM+BATTERY',
      0x11: 'MBC3',
      0x12: 'MBC3+RAM',
      0x13: 'MBC3+RAM+BATTERY',
      0x19: 'MBC5',
      0x1A: 'MBC5+RAM',
      0x1B: 'MBC5+RAM+BATTERY',
      0x1C: 'MBC5+RUMBLE',
      0x1D: 'MBC5+RUMBLE+RAM',
      0x1E: 'MBC5+RUMBLE+RAM+BATTERY',
      0x20: 'MBC6',
      0x22: 'MBC7+SENSOR+RUMBLE+RAM+BATTERY',
      0xFC: 'POCKET CAMERA',
      0xFD: 'BANDAI TAMA5',
      0xFE: 'HuC3',
      0xFF: 'HuC1+RAM+BATTERY'
    };
    
    return types[this.type] || 'UNKNOWN';
  }
}

