import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly client: Resend | null;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.client = key ? new Resend(key) : null;
  }

  async sendAccessEmail(input: {
    to: string;
    subject: string;
    text: string;
    actionUrl: string;
    actionLabel: string;
    idempotencyKey: string;
  }) {
    if (!this.client) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException({ code: 'EMAIL_NOT_CONFIGURED', message: 'Email delivery is temporarily unavailable.' });
      }
      return { delivered: false, localPreview: input.text };
    }
    const { data, error } = await this.client.emails.send(
      {
        from: this.config.getOrThrow<string>('EMAIL_FROM'),
        to: input.to,
        subject: input.subject,
        text: `${input.text}\n\n${input.actionUrl}`,
        html: this.renderAccessEmail(input.subject, input.text, input.actionUrl, input.actionLabel),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (error || !data?.id) {
      this.logger.error(`Resend rejected ${input.idempotencyKey}: ${error?.name ?? 'unknown error'}`);
      throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED', message: 'The verification email could not be sent. Please try again.' });
    }
    return { delivered: true, id: data.id };
  }

  private renderAccessEmail(subject: string, text: string, actionUrl: string, actionLabel: string) {
    const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character] ?? character);
    return `<!doctype html><html><body style="margin:0;background:#f3f6f0;color:#173f3b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 22px"><div style="background:#fff;border:1px solid #dbe5dc;border-radius:18px;padding:32px"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#176c61">NEX4LMS</div><h1 style="font-size:28px;line-height:1.15;margin:18px 0 12px">${escape(subject)}</h1><p style="font-size:16px;line-height:1.6;color:#53645f">${escape(text)}</p><a href="${escape(actionUrl)}" style="display:inline-block;margin-top:18px;background:#176c61;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">${escape(actionLabel)}</a><p style="font-size:12px;line-height:1.5;color:#7b8985;margin-top:28px">If you did not request this access, you can ignore this email.</p></div></div></body></html>`;
  }
}

