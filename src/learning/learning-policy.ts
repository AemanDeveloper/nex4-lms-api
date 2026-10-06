import { QuizScorePolicy } from '@prisma/client';

export function isAvailable(availableFrom: Date | null, now = new Date()) {
  return !availableFrom || availableFrom <= now;
}

export function canSubmitAfterDueDate(
  dueAt: Date | null,
  allowLate: boolean,
  isReturned: boolean,
  now = new Date(),
) {
  return !dueAt || dueAt >= now || allowLate || isReturned;
}

export function calculateProgressPercentage(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((Math.min(Math.max(completed, 0), total) / total) * 100);
}

export function selectQuizScore(
  scores: Array<{ score: number | null; attemptNumber: number }>,
  policy: QuizScorePolicy,
) {
  const graded = scores.filter(
    (attempt): attempt is { score: number; attemptNumber: number } =>
      attempt.score !== null,
  );
  if (graded.length === 0) return null;
  if (policy === QuizScorePolicy.LATEST) {
    return graded.reduce((latest, attempt) =>
      attempt.attemptNumber > latest.attemptNumber ? attempt : latest,
    ).score;
  }
  return Math.max(...graded.map((attempt) => attempt.score));
}

export function answersMatch(response: unknown, correctAnswer: unknown) {
  return normalise(response) === normalise(correctAnswer);
}

function normalise(value: unknown) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'boolean' || typeof value === 'number')
    return String(value).toLowerCase();
  return JSON.stringify(value);
}
