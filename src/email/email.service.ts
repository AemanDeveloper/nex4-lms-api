import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly client: Resend | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.client = key ? new Resend(key) : null;
  }

  async sendAccessEmail(to: string, subject: string, text: string) {
    if (!this.client) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('Email delivery is not configured');
      }
      return { delivered: false, localPreview: text };
    }
    await this.client.emails.send({
      from: this.config.getOrThrow<string>('EMAIL_FROM'),
      to,
      subject,
      text,
    });
    return { delivered: true };
  }
}

