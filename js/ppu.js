/**
 * Pixel Processing Unit (PPU)
 * Emulates the Game Boy's LCD controller
 */

export class PPU {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.mmu = gameboy.mmu;
    
    // Screen dimensions
    this.WIDTH = 160;
    this.HEIGHT = 144;
    
    // PPU state
    this.mode = 0;         // 0: HBlank, 1: VBlank, 2: OAM scan, 3: Drawing
    this.ly = 0;           // Current scanline (0-153)
    this.lcdEnabled = true;
    this.statInterruptLine = false;
    
    // Timers
    this.modeClock = 0;    // Tracks cycles in current mode
    
    // Frame buffer
    this.frameBuffer = new ImageData(this.WIDTH, this.HEIGHT);
    
    // Palettes
    this.bgPalette = [0, 0, 0, 0];
    this.objPalette0 = [0, 0, 0, 0];
    this.objPalette1 = [0, 0, 0, 0];
    
    // Initialize
    this.reset();
  }
  
  reset() {
    // Reset PPU state
    this.mode = 0;
    this.ly = 0;
    this.modeClock = 0;
    this.lcdEnabled = true;
    this.statInterruptLine = false;
    
    // Clear frame buffer
    const data = this.frameBuffer.data;
    for (let i = 0; i < this.WIDTH * this.HEIGHT * 4; i += 4) {
      data[i] = 155;     // R (light green)
      data[i+1] = 188;   // G
      data[i+2] = 15;    // B
      data[i+3] = 255;   // A
    }
    
    // Update palettes from initial IO values
    this.updatePalettes();
  }
  
  // Update PPU by a certain number of cycles
  update(cycles) {
    // If LCD is disabled, don't update
    if (!this.lcdEnabled) return;
    
    this.modeClock += cycles;
    
    // Mode 0: HBlank (204 cycles)
    if (this.mode === 0) {
      if (this.modeClock >= 204) {
        this.modeClock = 0;
        this.ly++;
        
        // Check if we've reached the bottom of the display
        if (this.ly === 144) {
          this.setMode(1); // Switch to VBlank
          this.requestInterrupt(0); // Request VBlank interrupt
        } else {
          this.setMode(2); // Switch to OAM scan
        }
        
        this.checkLYC(); // Check LY=LYC coincidence
      }
    }
    
    // Mode 1: VBlank (4560 cycles, 10 scanlines)
    else if (this.mode === 1) {
      if (this.modeClock >= 456) {
        this.modeClock = 0;
        this.ly++;
        
        // End of VBlank
        if (this.ly === 154) {
          this.ly = 0;
          this.setMode(2); // Switch to OAM scan
          this.checkLYC(); // Check LY=LYC coincidence
        }
      }
    }
    
    // Mode 2: OAM scan (80 cycles)
    else if (this.mode === 2) {
      if (this.modeClock >= 80) {
        this.modeClock = 0;
        this.setMode(3); // Switch to drawing pixels
      }
    }
    
    // Mode 3: Drawing pixels (172-289 cycles, varies)
    else if (this.mode === 3) {
      if (this.modeClock >= 172) { // Simplified; actual timing varies
        this.modeClock = 0;
        this.setMode(0); // Switch to HBlank
        
        // Render scanline
        this.renderScanline();
      }
    }
  }
  
  // Set the PPU mode and trigger STAT interrupts if needed
  setMode(mode) {
    // Don't update if the mode is already set
    if (this.mode === mode) return;
    
    const stat = this.mmu.readByte(0xFF41);
    let requestInterrupt = false;
    
    // Check if the new mode should trigger a STAT interrupt
    switch (mode) {
      case 0: // HBlank
        if (stat & 0x08) requestInterrupt = true;
        break;
      case 1: // VBlank
        if (stat & 0x10) requestInterrupt = true;
        break;
      case 2: // OAM scan
        if (stat & 0x20) requestInterrupt = true;
        break;
    }
    
    this.mode = mode;
    
    // Update STAT register with new mode
    this.updateSTAT();
    
    // Request STAT interrupt if needed
    if (requestInterrupt && !this.statInterruptLine) {
      this.statInterruptLine = true;
      this.requestInterrupt(1); // STAT interrupt
    } else if (!requestInterrupt) {
      this.statInterruptLine = false;
    }
  }
  
  // Update the STAT register (FF41)
  updateSTAT() {
    let stat = this.mmu.readByte(0xFF41) & 0xF8; // Clear lower 3 bits
    stat |= this.mode & 0x03; // Set mode bits
    
    // Set LYC=LY flag (bit 2) if they match
    if (this.ly === this.mmu.readByte(0xFF45)) {
      stat |= 0x04;
    }
    
    // Write back to STAT
    this.mmu.io[0x41] = stat;
  }
  
  // Check LYC=LY coincidence and trigger interrupt if enabled
  checkLYC() {
    const lyc = this.mmu.readByte(0xFF45);
    const stat = this.mmu.readByte(0xFF41);
    const coincidence = (this.ly === lyc);
    
    // Update STAT register
    if (coincidence) {
      this.mmu.io[0x41] |= 0x04; // Set coincidence flag
      
      // Check if LYC=LY interrupt is enabled
      if (stat & 0x40) {
        this.requestInterrupt(1); // STAT interrupt
      }
    } else {
      this.mmu.io[0x41] &= ~0x04; // Clear coincidence flag
    }
  }
  
  // Request an interrupt
  requestInterrupt(type) {
    let interruptFlags = this.mmu.readByte(0xFF0F);
    
    switch (type) {
      case 0: // VBlank
        interruptFlags |= 0x01;
        break;
      case 1: // STAT
        interruptFlags |= 0x02;
        break;
    }
    
    this.mmu.writeByte(0xFF0F, interruptFlags);
  }
  
  // Set LCD enabled/disabled status
  setLCDStatus(enabled) {
    if (enabled === this.lcdEnabled) return;
    
    this.lcdEnabled = enabled;
    
    if (!enabled) {
      // LCD turned off - reset PPU state
      this.ly = 0;
      this.mode = 0;
      this.modeClock = 0;
      
      // Update LY and STAT registers
      this.mmu.io[0x44] = 0;
      this.updateSTAT();
      
      // Clear screen (to white)
      const data = this.frameBuffer.data;
      for (let i = 0; i < this.WIDTH * this.HEIGHT * 4; i += 4) {
        data[i] = 255;   // R
        data[i+1] = 255; // G
        data[i+2] = 255; // B
        data[i+3] = 255; // A
      }
    }
  }
  
  // Update color palettes from memory
  updatePalettes() {
    const bgp = this.mmu.readByte(0xFF47);
    this.bgPalette[0] = (bgp >> 0) & 0x03;
    this.bgPalette[1] = (bgp >> 2) & 0x03;
    this.bgPalette[2] = (bgp >> 4) & 0x03;
    this.bgPalette[3] = (bgp >> 6) & 0x03;
    
    const obp0 = this.mmu.readByte(0xFF48);
    this.objPalette0[0] = (obp0 >> 0) & 0x03;
    this.objPalette0[1] = (obp0 >> 2) & 0x03;
    this.objPalette0[2] = (obp0 >> 4) & 0x03;
    this.objPalette0[3] = (obp0 >> 6) & 0x03;
    
    const obp1 = this.mmu.readByte(0xFF49);
    this.objPalette1[0] = (obp1 >> 0) & 0x03;
    this.objPalette1[1] = (obp1 >> 2) & 0x03;
    this.objPalette1[2] = (obp1 >> 4) & 0x03;
    this.objPalette1[3] = (obp1 >> 6) & 0x03;
  }
  
  // Get actual RGB color from Game Boy color index (0-3)
  getColor(colorIndex) {
    switch (colorIndex) {
      case 0: return [155, 188, 15, 255]; // Light green
      case 1: return [139, 172, 15, 255]; // Medium green
      case 2: return [48, 98, 48, 255];   // Dark green
      case 3: return [15, 56, 15, 255];   // Very dark green
      default: return [0, 0, 0, 255];     // Black (shouldn't happen)
    }
  }
  
  // Render the current scanline
  renderScanline() {
    if (!this.lcdEnabled || this.ly >= 144) return;
    
    // Update color palettes
    this.updatePalettes();
    
    const lcdc = this.mmu.readByte(0xFF40);
    
    // Check if LCD and background are enabled
    const lcdEnabled = (lcdc & 0x80) !== 0;
    const bgEnabled = (lcdc & 0x01) !== 0;
    
    if (!lcdEnabled) return;
    
    // Clear scanline
    const scanlineOffset = this.ly * this.WIDTH * 4;
    const data = this.frameBuffer.data;
    
    if (bgEnabled) {
      this.renderBackground(data, scanlineOffset);
    } else {
      // If background is disabled, fill with white
      for (let x = 0; x < this.WIDTH; x++) {
        const pixelOffset = scanlineOffset + (x * 4);
        data[pixelOffset] = 255;     // R
        data[pixelOffset+1] = 255;   // G
        data[pixelOffset+2] = 255;   // B
        data[pixelOffset+3] = 255;   // A
      }
    }
    
    // Check if window is enabled
    const windowEnabled = (lcdc & 0x20) !== 0;
    if (windowEnabled) {
      this.renderWindow(data, scanlineOffset);
    }
    
    // Check if sprites are enabled
    const spritesEnabled = (lcdc & 0x02) !== 0;
    if (spritesEnabled) {
      this.renderSprites(data, scanlineOffset);
    }
  }
  
  // Render background for the current scanline
  renderBackground(data, scanlineOffset) {
    const lcdc = this.mmu.readByte(0xFF40);
    const bgTileMapAddress = (lcdc & 0x08) ? 0x9C00 : 0x9800;
    const bgWindowTileDataAddress = (lcdc & 0x10) ? 0x8000 : 0x8800;
    const signed = !(lcdc & 0x10);
    
    const scx = this.mmu.readByte(0xFF43);
    const scy = this.mmu.readByte(0xFF42);
    
    // Calculate which line of the background we're drawing
    const yPos = (this.ly + scy) & 0xFF;
    
    // Which tile row are we drawing from?
    const tileRow = Math.floor(yPos / 8);
    
    // Which line of the tile are we on?
    const tileLine = yPos % 8;
    
    // Draw all 160 pixels for this scanline
    for (let x = 0; x < this.WIDTH; x++) {
      // Calculate which pixel of the background we're drawing
      const xPos = (x + scx) & 0xFF;
      
      // Which tile column are we drawing from?
      const tileCol = Math.floor(xPos / 8);
      
      // Which pixel of the tile are we drawing?
      const tilePixel = xPos % 8;
      
      // Get the tile index from the background map
      const tileMapAddress = bgTileMapAddress + (tileRow * 32) + tileCol;
      let tileIndex = this.mmu.readByte(tileMapAddress);
      
      // If using signed addressing mode (0x8800), convert the tile index
      if (signed) {
        tileIndex = tileIndex & 0x80 ? tileIndex - 256 : tileIndex;
      }
      
      // Get the tile data address
      let tileAddress;
      if (signed) {
        tileAddress = 0x9000 + (tileIndex * 16);
      } else {
        tileAddress = bgWindowTileDataAddress + (tileIndex * 16);
      }
      
      // Each tile row is 2 bytes, get the correct bytes for this line
      const tileLine2BytesAddress = tileAddress + (tileLine * 2);
      const byte1 = this.mmu.readByte(tileLine2BytesAddress);
      const byte2 = this.mmu.readByte(tileLine2BytesAddress + 1);
      
      // Pixel data is stored with most significant bit first
      // So pixel 0 is bit 7, pixel 1 is bit 6, etc.
      const bitPos = 7 - tilePixel;
      
      // Combine the two bits to get the color index (0-3)
      const colorBit1 = (byte1 >> bitPos) & 0x01;
      const colorBit2 = (byte2 >> bitPos) & 0x01;
      const colorIndex = (colorBit2 << 1) | colorBit1;
      
      // Look up the actual color using BGP palette
      const paletteIndex = this.bgPalette[colorIndex];
      const [r, g, b, a] = this.getColor(paletteIndex);
      
      // Set the pixel in the frame buffer
      const pixelOffset = scanlineOffset + (x * 4);
      data[pixelOffset] = r;
      data[pixelOffset+1] = g;
      data[pixelOffset+2] = b;
      data[pixelOffset+3] = a;
    }
  }
  
  // Render window for the current scanline
  renderWindow(data, scanlineOffset) {
    const lcdc = this.mmu.readByte(0xFF40);
    
    // Check if window is enabled and visible on this scanline
    const windowEnabled = (lcdc & 0x20) !== 0;
    if (!windowEnabled) return;
    
    const wy = this.mmu.readByte(0xFF4A);
    if (this.ly < wy) return;
    
    const wx = this.mmu.readByte(0xFF4B) - 7;
    if (wx >= this.WIDTH) return;
    
    const windowTileMapAddress = (lcdc & 0x40) ? 0x9C00 : 0x9800;
    const tileDataAddress = (lcdc & 0x10) ? 0x8000 : 0x8800;
    const signed = !(lcdc & 0x10);
    
    // Which line of the window we're drawing
    const windowLine = this.ly - wy;
    
    // Which tile row
    const tileRow = Math.floor(windowLine / 8);
    
    // Which line of the tile
    const tileLine = windowLine % 8;
    
    // Draw the window for each pixel
    for (let x = Math.max(0, wx); x < this.WIDTH; x++) {
      // Which tile column
      const tileCol = Math.floor((x - wx) / 8);
      
      // Which pixel of the tile
      const tilePixel = (x - wx) % 8;
      
      // Get the tile index from the window map
      const tileMapAddress = windowTileMapAddress + (tileRow * 32) + tileCol;
      let tileIndex = this.mmu.readByte(tileMapAddress);
      
      // Convert index if using signed addressing
      if (signed) {
        tileIndex = tileIndex & 0x80 ? tileIndex - 256 : tileIndex;
      }
      
      // Get the tile data address
      let tileAddress;
      if (signed) {
        tileAddress = 0x9000 + (tileIndex * 16);
      } else {
        tileAddress = tileDataAddress + (tileIndex * 16);
      }
      
      // Get the tile line data
      const tileLine2BytesAddress = tileAddress + (tileLine * 2);
      const byte1 = this.mmu.readByte(tileLine2BytesAddress);
      const byte2 = this.mmu.readByte(tileLine2BytesAddress + 1);
      
      // Get the color index for this pixel
      const bitPos = 7 - tilePixel;
      const colorBit1 = (byte1 >> bitPos) & 0x01;
      const colorBit2 = (byte2 >> bitPos) & 0x01;
      const colorIndex = (colorBit2 << 1) | colorBit1;
      
      // Skip transparent pixels (index 0)
      if (colorIndex === 0) continue;
      
      // Look up the color from the BGP palette
      const paletteIndex = this.bgPalette[colorIndex];
      const [r, g, b, a] = this.getColor(paletteIndex);
      
      // Set the pixel in the frame buffer
      const pixelOffset = scanlineOffset + (x * 4);
      data[pixelOffset] = r;
      data[pixelOffset+1] = g;
      data[pixelOffset+2] = b;
      data[pixelOffset+3] = a;
    }
  }
  
  // Render sprites for the current scanline
  renderSprites(data, scanlineOffset) {
    const lcdc = this.mmu.readByte(0xFF40);
    
    // Check if sprites are enabled
    if (!(lcdc & 0x02)) return;
    
    // Determine sprite height (8x8 or 8x16)
    const spriteHeight = (lcdc & 0x04) ? 16 : 8;
    
    // Array to store visible sprites on this scanline
    const visibleSprites = [];
    
    // Check all 40 sprites in OAM
    for (let sprite = 0; sprite < 40; sprite++) {
      // Each sprite uses 4 bytes in OAM
      const index = sprite * 4;
      const yPos = this.mmu.oam[index] - 16;
      const xPos = this.mmu.oam[index + 1] - 8;
      const tileIndex = this.mmu.oam[index + 2];
      const attributes = this.mmu.oam[index + 3];
      
      // Check if sprite is visible on this scanline
      if (this.ly >= yPos && this.ly < yPos + spriteHeight) {
        // Only add first 10 visible sprites (hardware limit)
        if (visibleSprites.length < 10) {
          visibleSprites.push({
            x: xPos,
            y: yPos,
            tile: tileIndex,
            attributes: attributes,
            oamIndex: sprite // Store for priority handling
          });
        }
      }
    }
    
    // Sort sprites by x-coordinate (smaller x has higher priority)
    // If x is equal, earlier OAM index has higher priority
    visibleSprites.sort((a, b) => {
      if (a.x !== b.x) return a.x - b.x;
      return a.oamIndex - b.oamIndex;
    });
    
    // Draw sprites in priority order (reverse of array, as lower x has higher priority)
    for (let i = visibleSprites.length - 1; i >= 0; i--) {
      const sprite = visibleSprites[i];
      
      // Flags from attributes
      const behindBG = (sprite.attributes & 0x80) !== 0; // BG over OBJ (0=No, 1=BG hides sprite)
      const yFlip = (sprite.attributes & 0x40) !== 0;    // Y flip
      const xFlip = (sprite.attributes & 0x20) !== 0;    // X flip
      const paletteNum = (sprite.attributes & 0x10) !== 0; // Palette (0=OBP0, 1=OBP1)
      
      // Which line of the sprite are we drawing?
      let spriteLine = this.ly - sprite.y;
      
      // Handle Y-flip
      if (yFlip) {
        spriteLine = spriteHeight - 1 - spriteLine;
      }
      
      // For 8x16 sprites, we need to adjust the tile index
      let tileNum = sprite.tile;
      if (spriteHeight === 16) {
        // In 8x16 mode, the lowest bit of the tile number is ignored
        tileNum &= 0xFE;
        
        // If we're drawing the bottom half of the sprite, increment the tile number
        if (spriteLine >= 8) {
          tileNum++;
          spriteLine -= 8;
        }
      }
      
      // Calculate the tile address
      const tileAddress = 0x8000 + (tileNum * 16);
      
      // Get the tile data for this line
      const tileLine2BytesAddress = tileAddress + (spriteLine * 2);
      const byte1 = this.mmu.readByte(tileLine2BytesAddress);
      const byte2 = this.mmu.readByte(tileLine2BytesAddress + 1);
      
      // Draw each pixel of the sprite line
      for (let tilePixel = 0; tilePixel < 8; tilePixel++) {
        // Skip if pixel is off-screen
        const x = sprite.x + tilePixel;
        if (x < 0 || x >= this.WIDTH) continue;
        
        // Handle X-flip
        const bitPos = xFlip ? tilePixel : 7 - tilePixel;
        
        // Get color index
        const colorBit1 = (byte1 >> bitPos) & 0x01;
        const colorBit2 = (byte2 >> bitPos) & 0x01;
        const colorIndex = (colorBit2 << 1) | colorBit1;
        
        // Skip transparent pixels (index 0)
        if (colorIndex === 0) continue;
        
        // Check BG-over-OBJ priority
        if (behindBG) {
          const pixelOffset = scanlineOffset + (x * 4);
          // Check if background pixel is not transparent (color 0)
          const r = data[pixelOffset];
          const g = data[pixelOffset+1];
          const b = data[pixelOffset+2];
          
          // Skip if background pixel is not transparent
          // This is a simplified check - ideally we'd check the actual background color index
          if (!(r === 155 && g === 188 && b === 15)) continue;
        }
        
        // Get color from the appropriate palette
        const palette = paletteNum ? this.objPalette1 : this.objPalette0;
        const paletteIndex = palette[colorIndex];
        const [r, g, b, a] = this.getColor(paletteIndex);
        
        // Set pixel in frame buffer
        const pixelOffset = scanlineOffset + (x * 4);
        data[pixelOffset] = r;
        data[pixelOffset+1] = g;
        data[pixelOffset+2] = b;
        data[pixelOffset+3] = a;
      }
    }
  }
}

