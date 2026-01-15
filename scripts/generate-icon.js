const fs = require('fs');
const path = require('path');

// 简单的 PNG 文件生成器
// 创建一个 128x128 的蓝色图标，上面有白色的书本图标

function generatePNG() {
  const size = 128;
  const bytesPerPixel = 4; // RGBA
  const pixelData = Buffer.alloc(size * size * bytesPerPixel);

  // SVG 图标的简化版本转换为像素
  // 背景色：#3FA9F5 (63, 169, 245)
  // 文字/线条色：白色 (255, 255, 255)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * bytesPerPixel;

      // 检查是否在书本形状内
      const centerX = size / 2;
      const centerY = size / 2;
      const bookWidth = 60;
      const bookHeight = 80;
      const bookLeft = centerX - bookWidth / 2;
      const bookRight = centerX + bookWidth / 2;
      const bookTop = centerY - bookHeight / 2;
      const bookBottom = centerY + bookHeight / 2;

      // 检查圆角
      const radius = 8;
      const inBook = x >= bookLeft + radius && x <= bookRight - radius &&
                     y >= bookTop + radius && y <= bookBottom - radius;

      const inCornerTL = x < bookLeft + radius && y < bookTop + radius &&
                         Math.pow(x - (bookLeft + radius), 2) + Math.pow(y - (bookTop + radius), 2) <= radius * radius;
      const inCornerTR = x > bookRight - radius && y < bookTop + radius &&
                         Math.pow(x - (bookRight - radius), 2) + Math.pow(y - (bookTop + radius), 2) <= radius * radius;
      const inCornerBL = x < bookLeft + radius && y > bookBottom - radius &&
                         Math.pow(x - (bookLeft + radius), 2) + Math.pow(y - (bookBottom - radius), 2) <= radius * radius;
      const inCornerBR = x > bookRight - radius && y > bookBottom - radius &&
                         Math.pow(x - (bookRight - radius), 2) + Math.pow(y - (bookBottom - radius), 2) <= radius * radius;

      const inBookShape = inBook || inCornerTL || inCornerTR || inCornerBL || inCornerBR;

      if (inBookShape) {
        // 书本背景色
        pixelData[idx] = 63;     // R
        pixelData[idx + 1] = 169; // G
        pixelData[idx + 2] = 245; // B
        pixelData[idx + 3] = 255; // A

        // 绘制白色横线（文字）
        const lineWidth = 36;
        const lineHeight = 4;
        const lineSpacing = 10;
        const firstLineTop = bookTop + 18;

        for (let line = 0; line < 4; line++) {
          const lineTop = firstLineTop + line * lineSpacing;
          const lineBottom = lineTop + lineHeight;
          const lineLeft = centerX - lineWidth / 2;
          const lineRight = centerX + lineWidth / 2;

          if (y >= lineTop && y <= lineBottom && x >= lineLeft && x <= lineRight) {
            pixelData[idx] = 255;
            pixelData[idx + 1] = 255;
            pixelData[idx + 2] = 255;
            pixelData[idx + 3] = 255;
          }
        }
      } else {
        // 透明背景
        pixelData[idx] = 0;
        pixelData[idx + 1] = 0;
        pixelData[idx + 2] = 0;
        pixelData[idx + 3] = 0;
      }
    }
  }

  // 手动创建 PNG 文件头和数据
  // PNG 签名
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(6, 9);        // color type (RGBA)
  ihdr.writeUInt8(0, 10);       // compression method
  ihdr.writeUInt8(0, 11);       // filter method
  ihdr.writeUInt8(0, 12);       // interlace method

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (图像数据)
  const deflateData = zlibDeflate(pixelData);
  const idatChunk = createChunk('IDAT', deflateData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = calculateCrc(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCrc(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zlibDeflate(data) {
  // 简单的 zlib 压缩（使用 Node.js 的 zlib）
  const zlib = require('zlib');
  return zlib.deflateSync(Buffer.concat([
    Buffer.from([0x78, 0x01]), // zlib header
    data,
    Buffer.from([0x00, 0x00, 0xff, 0xff]) // adler32 (simplified)
  ]));
}

try {
  const pngData = generatePNG();
  const outputPath = path.join(__dirname, '..', 'media', 'zenReader.png');
  fs.writeFileSync(outputPath, pngData);
  console.log('Icon generated successfully at:', outputPath);
} catch (error) {
  console.error('Error generating icon:', error);
  // 如果失败，创建一个最小的有效 PNG
  createMinimalPNG();
}

function createMinimalPNG() {
  // 创建一个最简单的 1x1 PNG
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(128, 0);  // 128x128
  ihdr.writeUInt32BE(128, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);  // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = createChunk('IHDR', ihdr);

  // 创建纯蓝色图像数据
  const size = 128;
  const pixelData = Buffer.alloc(size * size * 4);
  for (let i = 0; i < pixelData.length; i += 4) {
    pixelData[i] = 63;     // R
    pixelData[i + 1] = 169; // G
    pixelData[i + 2] = 245; // B
    pixelData[i + 3] = 255; // A
  }

  const zlib = require('zlib');
  const scanlines = [];
  for (let y = 0; y < size; y++) {
    const scanline = Buffer.concat([Buffer.from([0]), pixelData.subarray(y * size * 4, (y + 1) * size * 4)]);
    scanlines.push(scanline);
  }
  const rawData = Buffer.concat(scanlines);
  const compressed = zlib.deflateSync(rawData);

  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  const pngData = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);

  const outputPath = path.join(__dirname, '..', 'media', 'zenReader.png');
  fs.writeFileSync(outputPath, pngData);
  console.log('Minimal icon generated at:', outputPath);
}
