const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// 创建一个 128x128 的图标
const size = 128;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// 背景：透明
ctx.clearRect(0, 0, size, size);

// 绘制书本形状（圆角矩形）
const bookWidth = 64;
const bookHeight = 84;
const bookX = (size - bookWidth) / 2;
const bookY = (size - bookHeight) / 2;
const radius = 10;

// 书本背景色：蓝色
ctx.fillStyle = '#3FA9F5';
ctx.beginPath();
ctx.roundRect(bookX, bookY, bookWidth, bookHeight, radius);
ctx.fill();

// 绘制白色横线（代表文字）
ctx.strokeStyle = '#FFFFFF';
ctx.lineWidth = 3;
ctx.lineCap = 'round';

const lineY = bookY + 20;
const lineHeight = 3;
const lineSpacing = 12;
const lineWidth = 40;
const lineX = (size - lineWidth) / 2;

for (let i = 0; i < 4; i++) {
  ctx.beginPath();
  ctx.moveTo(lineX, lineY + i * lineSpacing);
  ctx.lineTo(lineX + lineWidth, lineY + i * lineSpacing);
  ctx.stroke();
}

// 保存为 PNG
const buffer = canvas.toBuffer('image/png');
const outputPath = path.join(__dirname, '..', 'media', 'zenReader.png');
fs.writeFileSync(outputPath, buffer);

console.log('Icon created successfully at:', outputPath);
console.log('File size:', buffer.length, 'bytes');
