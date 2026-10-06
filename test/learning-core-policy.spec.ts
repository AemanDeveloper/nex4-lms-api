import 'reflect-metadata';
import { QuizScorePolicy } from '@prisma/client';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateInvitationDto,
  CreateQuizDto,
} from '../src/learning/dto/learning-core.dto';
import {
  answersMatch,
  calculateProgressPercentage,
  canSubmitAfterDueDate,
  isAvailable,
  selectQuizScore,
} from '../src/learning/learning-policy';

describe('learning core policy', () => {
  it('locks scheduled lessons until their availability time', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    expect(isAvailable(null, now)).toBe(true);
    expect(isAvailable(new Date('2026-10-06T09:59:00.000Z'), now)).toBe(true);
    expect(isAvailable(new Date('2026-10-06T10:01:00.000Z'), now)).toBe(false);
  });

  it('allows returned work to be resubmitted after the original due date', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const dueAt = new Date('2026-10-05T10:00:00.000Z');
    expect(canSubmitAfterDueDate(dueAt, false, false, now)).toBe(false);
    expect(canSubmitAfterDueDate(dueAt, true, false, now)).toBe(true);
    expect(canSubmitAfterDueDate(dueAt, false, true, now)).toBe(true);
  });

  it('calculates lesson progress from completed published lessons', () => {
    expect(calculateProgressPercentage(0, 0)).toBe(0);
    expect(calculateProgressPercentage(2, 3)).toBe(67);
    expect(calculateProgressPercentage(5, 3)).toBe(100);
  });

  it('applies highest and latest quiz score policies', () => {
    const attempts = [
      { score: 80, attemptNumber: 1 },
      { score: 65, attemptNumber: 2 },
      { score: null, attemptNumber: 3 },
    ];
    expect(selectQuizScore(attempts, QuizScorePolicy.HIGHEST)).toBe(80);
    expect(selectQuizScore(attempts, QuizScorePolicy.LATEST)).toBe(65);
  });

  it('normalises objective quiz answers before auto-grading', () => {
    expect(answersMatch(' TRUE ', 'true')).toBe(true);
    expect(answersMatch('Option A', 'option a')).toBe(true);
    expect(answersMatch('Option B', 'option a')).toBe(false);
  });

  it('only accepts Teacher and Student invitation roles', async () => {
    const valid = Object.assign(new CreateInvitationDto(), {
      email: 'teacher@example.com',
      role: 'TEACHER',
    });
    const invalid = Object.assign(new CreateInvitationDto(), {
      email: 'owner@example.com',
      role: 'ORGANISATION_ADMIN',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('enforces the one-to-five quiz attempt range', async () => {
    const dto = Object.assign(new CreateQuizDto(), {
      title: 'Quick check',
      attemptsAllowed: 6,
      scorePolicy: QuizScorePolicy.HIGHEST,
      questions: [],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'attemptsAllowed')).toBe(
      true,
    );
  });
});
