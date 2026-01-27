/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument */
import { Injectable } from '@nestjs/common';
import { createCanvas } from 'canvas';

@Injectable()
export class ShareImageService {
  /**
   * Generate a shareable image for an achievement (Open Graph format: 1200x630)
   */
  async generateAchievementShareImage(
    userName: string,
    achievement: {
      name: string;
      icon: string;
      rarity: string;
      description: string;
    },
  ): Promise<Buffer> {
    const width = 1200;
    const height = 630; // Open Graph recommended size
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient based on rarity
    const rarityColors = {
      COMMON: { start: '#4A5568', end: '#2D3748' },
      RARE: { start: '#3182CE', end: '#2C5282' },
      EPIC: { start: '#805AD5', end: '#6B46C1' },
      LEGENDARY: { start: '#D69E2E', end: '#B7791F' },
    };

    const colors = rarityColors[achievement.rarity] || rarityColors.COMMON;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(1, colors.end);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle pattern/texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < 20; i++) {
      ctx.fillRect(i * 60, 0, 30, height);
    }

    // Title "ACHIEVEMENT UNLOCKED"
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText('ACHIEVEMENT UNLOCKED!', width / 2, 100);
    ctx.shadowBlur = 0;

    // Achievement icon (large emoji)
    ctx.font = '180px Arial';
    ctx.fillText(achievement.icon, width / 2, 280);

    // Achievement name
    ctx.font = 'bold 56px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(achievement.name, width / 2, 380);

    // Achievement description
    ctx.font = '32px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const maxWidth = width - 100;
    const words = achievement.description.split(' ');
    let line = '';
    let y = 440;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, width / 2, y);
        line = words[n] + ' ';
        y += 40;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, width / 2, y);

    // User name at bottom
    ctx.font = 'italic 40px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(`Unlocked by ${userName}`, width / 2, height - 60);

    // Rarity badge (top right)
    const badgeWidth = 200;
    const badgeHeight = 60;
    const badgeX = width - badgeWidth - 40;
    const badgeY = 40;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.fillText(achievement.rarity, badgeX + badgeWidth / 2, badgeY + 42);
    ctx.textAlign = 'center'; // Reset for next text

    // Footer branding
    ctx.font = '24px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(
      'ActivScanIO - Mario Kart Fantasy Racing',
      width / 2,
      height - 20,
    );

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate a shareable stats image (Open Graph format: 1200x630)
   */
  async generateStatsShareImage(
    userName: string,
    stats: {
      level: number;
      totalAchievements: number;
      unlockedAchievements: number;
      winRate: number;
      totalPoints: number;
      rank?: number;
    },
  ): Promise<Buffer> {
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a202c');
    gradient.addColorStop(1, '#2d3748');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // User name (large at top)
    ctx.font = 'bold 70px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 15;
    ctx.fillText(userName, width / 2, 100);
    ctx.shadowBlur = 0;

    // Stats grid (2x2)
    const statItems = [
      {
        label: 'LEVEL',
        value: stats.level.toString(),
        emoji: '📈',
        color: '#48BB78',
      },
      {
        label: 'ACHIEVEMENTS',
        value: `${stats.unlockedAchievements}/${stats.totalAchievements}`,
        emoji: '🏆',
        color: '#ED8936',
      },
      {
        label: 'WIN RATE',
        value: `${stats.winRate.toFixed(1)}%`,
        emoji: '🎯',
        color: '#4299E1',
      },
      {
        label: 'TOTAL POINTS',
        value: stats.totalPoints.toString(),
        emoji: '⭐',
        color: '#9F7AEA',
      },
    ];

    const gridStartY = 180;
    const gridSpacing = 200;
    const colWidth = width / 2;

    statItems.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = col * colWidth + colWidth / 2;
      const y = gridStartY + row * gridSpacing;

      // Stat emoji
      ctx.font = '60px Arial';
      ctx.fillText(item.emoji, x, y);

      // Stat value (large)
      ctx.font = 'bold 64px Arial';
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, x, y + 80);

      // Stat label
      ctx.font = '28px Arial';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(item.label, x, y + 120);
    });

    // Rank (if available)
    if (stats.rank) {
      ctx.font = 'bold 36px Arial';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`🏅 Rank #${stats.rank}`, width / 2, height - 70);
    }

    // Footer
    ctx.font = '24px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(
      'ActivScanIO - Mario Kart Fantasy Racing',
      width / 2,
      height - 20,
    );

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate a perfect score celebration share image
   */
  async generatePerfectScoreShareImage(
    userName: string,
    score: number,
    raceTitle: string,
  ): Promise<Buffer> {
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Gold gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#F59E0B');
    gradient.addColorStop(0.5, '#D97706');
    gradient.addColorStop(1, '#B45309');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Radial glow effect
    const glow = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      400,
    );
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // "PERFECT SCORE"
    ctx.font = 'bold 80px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('🎉 PERFECT SCORE! 🎉', width / 2, 140);
    ctx.shadowBlur = 0;

    // Score (massive)
    ctx.font = 'bold 160px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8;
    ctx.strokeText(score.toString(), width / 2, 300);
    ctx.fillText(score.toString(), width / 2, 300);

    // "POINTS"
    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('POINTS', width / 2, 360);

    // User name
    ctx.font = 'bold 56px Arial';
    ctx.fillStyle = '#FFE082';
    ctx.fillText(userName, width / 2, 440);

    // Race title
    ctx.font = 'italic 32px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(raceTitle, width / 2, 490);

    // Trophy emoji
    ctx.font = '100px Arial';
    ctx.fillText('🏆', width / 2, 580);

    return canvas.toBuffer('image/png');
  }
}
