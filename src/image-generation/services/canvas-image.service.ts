import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';

export interface CelebrationImageOptions {
  userName: string;
  characterName?: string;
  characterImageUrl?: string;
  score: number;
  raceTitle: string;
  date: Date;
}

export interface RaceAnnouncementOptions {
  raceTitle: string;
  scheduledTime: Date;
  podiumCompetitors: Array<{
    position: number;
    name: string;
    imageUrl?: string;
  }>;
}

@Injectable()
export class CanvasImageService {
  private readonly logger = new Logger(CanvasImageService.name);

  /**
   * Génère une image de célébration pour un perfect score (60 points)
   * Style: bowling strike celebration with dramatic effects
   */
  async generatePerfectScoreCelebration(
    options: CelebrationImageOptions,
  ): Promise<Buffer> {
    this.logger.log(
      `🎨 Generating canvas perfect score celebration for ${options.userName}`,
    );

    const width = 1920; // TV HD resolution
    const height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient (dark navy to black)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#1a1a2e');
    bgGradient.addColorStop(1, '#0f0f1e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Starburst rays effect (gold rays from center)
    this.drawStarburstRays(ctx, width, height);

    // Main title "PERFECT SCORE!"
    ctx.font = 'bold 140px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleY = 180;
    ctx.strokeText('PERFECT SCORE!', width / 2, titleY);
    ctx.fillText('PERFECT SCORE!', width / 2, titleY);

    // Score display (massive numbers)
    ctx.font = 'bold 220px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 8;

    const scoreY = 420;
    ctx.strokeText(`${options.score}`, width / 2, scoreY);
    ctx.fillText(`${options.score}`, width / 2, scoreY);

    // "POINTS" label
    ctx.font = 'bold 70px Arial';
    ctx.fillStyle = '#CCCCCC';
    ctx.strokeStyle = 'none';
    ctx.fillText('POINTS', width / 2, scoreY + 100);

    // User name (cyan highlight)
    ctx.font = 'bold 90px Arial';
    ctx.fillStyle = '#00D9FF';
    ctx.strokeStyle = '#003D4D';
    ctx.lineWidth = 4;

    const nameY = 700;
    ctx.strokeText(options.userName.toUpperCase(), width / 2, nameY);
    ctx.fillText(options.userName.toUpperCase(), width / 2, nameY);

    // Character name (if provided)
    if (options.characterName) {
      ctx.font = 'italic 50px Arial';
      ctx.fillStyle = '#AAAAAA';
      ctx.fillText(`"${options.characterName}"`, width / 2, 790);
    }

    // Character image (if provided) - centered circle avatar
    if (options.characterImageUrl) {
      try {
        const characterImg = await loadImage(options.characterImageUrl);
        const avatarSize = 250;
        const avatarX = width / 2 - avatarSize / 2;
        const avatarY = 850;

        // Draw circular avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          width / 2,
          avatarY + avatarSize / 2,
          avatarSize / 2,
          0,
          Math.PI * 2,
        );
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(characterImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();

        // Gold border around avatar
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(
          width / 2,
          avatarY + avatarSize / 2,
          avatarSize / 2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } catch (error) {
        this.logger.warn('Failed to load character image', error);
      }
    }

    // Race info at bottom
    ctx.font = '45px Arial';
    ctx.fillStyle = '#888888';
    ctx.fillText(
      `${options.raceTitle} • ${options.date.toLocaleDateString('fr-FR')}`,
      width / 2,
      height - 50,
    );

    // Decorative elements (corner stars)
    this.drawCornerStars(ctx, width, height);

    return canvas.toBuffer('image/png');
  }

  /**
   * Draw starburst rays from center (bowling strike effect)
   */
  private drawStarburstRays(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const rayCount = 16;

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.15;

    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI * 2) / rayCount;
      const endX = centerX + Math.cos(angle) * 800;
      const endY = centerY + Math.sin(angle) * 600;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw decorative stars in corners
   */
  private drawCornerStars(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const positions = [
      { x: 100, y: 100 },
      { x: width - 100, y: 100 },
      { x: 100, y: height - 100 },
      { x: width - 100, y: height - 100 },
    ];

    ctx.fillStyle = '#FFD700';
    ctx.globalAlpha = 0.6;

    for (const pos of positions) {
      this.drawStar(ctx, pos.x, pos.y, 5, 30, 15);
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw a star shape
   */
  private drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number,
  ): void {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }

    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Generate a race announcement image with podium
   */
  generateRaceAnnouncement(options: RaceAnnouncementOptions): Buffer {
    this.logger.log(`🏁 Generating race announcement for ${options.raceTitle}`);

    const width = 1920;
    const height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0f2027');
    gradient.addColorStop(0.5, '#203a43');
    gradient.addColorStop(1, '#2c5364');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Title "PROCHAINE COURSE"
    ctx.font = 'bold 100px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('PROCHAINE COURSE', width / 2, 150);

    // Race title
    ctx.font = 'bold 80px Arial';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(options.raceTitle, width / 2, 280);

    // Scheduled time
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(
      options.scheduledTime.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      width / 2,
      380,
    );

    // Podium visualization
    const podiumY = 500;
    const podiumPositions = [
      {
        x: width / 2 - 400,
        height: 200,
        rank: 2,
        color: '#C0C0C0',
        label: '2ème',
      },
      { x: width / 2, height: 280, rank: 1, color: '#FFD700', label: '1er' },
      {
        x: width / 2 + 400,
        height: 150,
        rank: 3,
        color: '#CD7F32',
        label: '3ème',
      },
    ];

    for (const pos of podiumPositions) {
      const competitor = options.podiumCompetitors.find(
        (c) => c.position === pos.rank,
      );

      // Podium rectangle
      ctx.fillStyle = pos.color;
      ctx.fillRect(pos.x - 100, podiumY + (280 - pos.height), 200, pos.height);

      // Rank label on podium
      ctx.font = 'bold 60px Arial';
      ctx.fillStyle = '#000000';
      ctx.fillText(
        pos.label,
        pos.x,
        podiumY + (280 - pos.height) + pos.height / 2 + 20,
      );

      // Competitor name below podium
      if (competitor) {
        ctx.font = 'bold 40px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(competitor.name, pos.x, podiumY + 340);
      }
    }

    return canvas.toBuffer('image/png');
  }
}
