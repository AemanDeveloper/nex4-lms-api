import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DEMO_PERSPECTIVES, type DemoPerspective } from './demo.types';

const dashboards = {
  student: {
    greeting: 'Welcome back, Maya',
    summary: [{ label: 'Learning streak', value: '8 days' }, { label: 'Lessons this week', value: '6' }, { label: 'Next class', value: 'Science · 10:30' }],
    cards: ['Continue fractions', 'Science project', 'Reading club'],
  },
  guardian: {
    greeting: 'Family learning overview',
    summary: [{ label: 'Active learners', value: '2' }, { label: 'Attendance', value: '96%' }, { label: 'Tasks due', value: '3' }],
    cards: ['Maya’s progress', 'Adam’s timetable', 'School announcements'],
  },
  teacher: {
    greeting: 'Today’s teaching plan',
    summary: [{ label: 'Classes today', value: '4' }, { label: 'Work to mark', value: '12' }, { label: 'Learners', value: '68' }],
    cards: ['Year 5 Mathematics', 'Feedback queue', 'Live-class schedule'],
  },
  'organisation-admin': {
    greeting: 'Organisation overview',
    summary: [{ label: 'Learners', value: '186' }, { label: 'Teachers', value: '18' }, { label: 'Branches', value: '2' }],
    cards: ['Memberships', 'Course enrolment', 'Usage and access'],
  },
} satisfies Record<DemoPerspective, object>;

@Injectable()
export class DemoService {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  createSession(perspective: DemoPerspective) {
    const expiresInSeconds = 60 * 60;
    const token = this.jwt.sign(
      { sub: crypto.randomUUID(), aud: 'nex4-demo', accessMode: 'read-only', perspectives: DEMO_PERSPECTIVES },
      { secret: this.config.getOrThrow<string>('DEMO_JWT_SECRET'), expiresIn: expiresInSeconds },
    );
    return {
      token,
      accessMode: 'read-only',
      perspective,
      perspectives: DEMO_PERSPECTIVES,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  getDashboard(perspective: DemoPerspective) {
    return { perspective, ...dashboards[perspective], fictionalData: true };
  }
}
