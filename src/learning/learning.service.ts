import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  Prisma,
  QuizAttemptStatus,
  QuizQuestionType,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import {
  AssignCourseDto,
  AssignMembershipDto,
  CreateClassDto,
  CreateQuizDto,
  GradeQuizAttemptDto,
  GradeSubmissionDto,
  SaveQuizAnswerDto,
  SaveSubmissionDto,
  UpdateLessonAvailabilityDto,
} from './dto/learning-core.dto';
import {
  answersMatch,
  calculateProgressPercentage,
  canSubmitAfterDueDate,
  isAvailable,
  selectQuizScore,
} from './learning-policy';

type Actor = { organisationId: string; userId: string; role: MembershipRole };

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  listCourses(actor: Actor) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const where: Prisma.CourseWhereInput = {
          organisationId: actor.organisationId,
        };
        if (actor.role === MembershipRole.TEACHER) {
          where.classes = {
            some: {
              class: {
                teachers: { some: { teacherMembershipId: membership.id } },
              },
            },
          };
        } else if (actor.role === MembershipRole.STUDENT) {
          where.published = true;
          where.classes = {
            some: {
              class: {
                students: { some: { studentMembershipId: membership.id } },
              },
            },
          };
        } else if (actor.role !== MembershipRole.ORGANISATION_ADMIN) {
          return [];
        }
        const now = new Date();
        return transaction.course
          .findMany({
            where,
            include: {
              classes: {
                include: { class: { select: { id: true, name: true } } },
              },
              lessons: {
                where:
                  actor.role === MembershipRole.STUDENT
                    ? { published: true }
                    : undefined,
                include:
                  actor.role === MembershipRole.STUDENT
                    ? {
                        progress: {
                          where: { studentMembershipId: membership.id },
                        },
                      }
                    : undefined,
                orderBy: { position: 'asc' },
              },
              assignments: { orderBy: { dueAt: 'asc' } },
              quizzes: {
                where:
                  actor.role === MembershipRole.STUDENT
                    ? { published: true }
                    : undefined,
                include:
                  actor.role === MembershipRole.STUDENT
                    ? {
                        attempts: {
                          where: { studentMembershipId: membership.id },
                        },
                      }
                    : undefined,
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { updatedAt: 'desc' },
          })
          .then((courses) =>
            courses.map((course) => ({
              ...course,
              lessons: course.lessons.map((lesson) => ({
                ...lesson,
                locked: Boolean(
                  lesson.availableFrom && lesson.availableFrom > now,
                ),
              })),
            })),
          );
      },
    );
  }

  createCourse(actor: Actor, body: CreateCourseDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const teachingClass =
          actor.role === MembershipRole.TEACHER
            ? await transaction.classTeacher.findFirst({
                where: {
                  organisationId: actor.organisationId,
                  teacherMembershipId: membership.id,
                },
                orderBy: { createdAt: 'asc' },
              })
            : null;
        if (actor.role === MembershipRole.TEACHER && !teachingClass) {
          throw new ForbiddenException({
            code: 'CLASS_ASSIGNMENT_REQUIRED',
            message:
              'A teacher must be assigned to a class before creating a course.',
          });
        }
        const course = await transaction.course.create({
          data: {
            organisationId: actor.organisationId,
            title: body.title.trim(),
            description: body.description.trim(),
            ...(teachingClass
              ? {
                  classes: {
                    create: {
                      organisationId: actor.organisationId,
                      classId: teachingClass.classId,
                    },
                  },
                }
              : {}),
          },
        });
        await this.audit(
          transaction,
          actor,
          'course.created',
          'course',
          course.id,
          {},
        );
        return course;
      },
    );
  }

  setCoursePublished(actor: Actor, courseId: string, published: boolean) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        await this.requireCourseAccess(transaction, actor, courseId);
        const course = await transaction.course.update({
          where: { id: courseId },
          data: { published },
        });
        await this.audit(
          transaction,
          actor,
          published ? 'course.published' : 'course.unpublished',
          'course',
          courseId,
          {},
        );
        return course;
      },
    );
  }

  createLesson(actor: Actor, courseId: string, body: CreateLessonDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        await this.requireCourseAccess(transaction, actor, courseId);
        const lesson = await transaction.lesson.create({
          data: {
            courseId,
            title: body.title.trim(),
            content: body.content as Prisma.InputJsonValue,
            position: body.position,
          },
        });
        await this.audit(
          transaction,
          actor,
          'lesson.created',
          'lesson',
          lesson.id,
          { courseId },
        );
        return lesson;
      },
    );
  }

  setLessonAvailability(
    actor: Actor,
    lessonId: string,
    body: UpdateLessonAvailabilityDto,
  ) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const lesson = await transaction.lesson.findFirst({
          where: {
            id: lessonId,
            course: { organisationId: actor.organisationId },
          },
        });
        if (!lesson) throw new NotFoundException();
        await this.requireCourseAccess(transaction, actor, lesson.courseId);
        const updated = await transaction.lesson.update({
          where: { id: lessonId },
          data: {
            published: body.published,
            availableFrom: body.availableFrom
              ? new Date(body.availableFrom)
              : null,
          },
        });
        await this.audit(
          transaction,
          actor,
          body.published ? 'lesson.published' : 'lesson.unpublished',
          'lesson',
          lessonId,
          {
            availableFrom: updated.availableFrom?.toISOString() ?? null,
          },
        );
        return updated;
      },
    );
  }

  completeLesson(actor: Actor, lessonId: string) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const lesson = await transaction.lesson.findFirst({
          where: {
            id: lessonId,
            published: true,
            course: {
              organisationId: actor.organisationId,
              published: true,
              classes: {
                some: {
                  class: {
                    students: { some: { studentMembershipId: membership.id } },
                  },
                },
              },
            },
          },
        });
        if (!lesson) throw new NotFoundException();
        if (!isAvailable(lesson.availableFrom)) {
          throw new ForbiddenException({
            code: 'LESSON_LOCKED',
            message: 'This lesson is not available yet.',
          });
        }
        const now = new Date();
        const progress = await transaction.lessonProgress.upsert({
          where: {
            lessonId_studentMembershipId: {
              lessonId,
              studentMembershipId: membership.id,
            },
          },
          update: { completedAt: now },
          create: {
            organisationId: actor.organisationId,
            lessonId,
            studentMembershipId: membership.id,
            startedAt: now,
            completedAt: now,
          },
        });
        await this.audit(
          transaction,
          actor,
          'lesson.completed',
          'lesson',
          lessonId,
          {},
        );
        return progress;
      },
    );
  }

  startLesson(actor: Actor, lessonId: string) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const lesson = await transaction.lesson.findFirst({
          where: {
            id: lessonId,
            published: true,
            course: {
              organisationId: actor.organisationId,
              published: true,
              classes: {
                some: {
                  class: {
                    students: { some: { studentMembershipId: membership.id } },
                  },
                },
              },
            },
          },
        });
        if (!lesson) throw new NotFoundException();
        if (!isAvailable(lesson.availableFrom)) {
          throw new ForbiddenException({
            code: 'LESSON_LOCKED',
            message: 'This lesson is not available yet.',
          });
        }
        const progress = await transaction.lessonProgress.upsert({
          where: {
            lessonId_studentMembershipId: {
              lessonId,
              studentMembershipId: membership.id,
            },
          },
          update: {},
          create: {
            organisationId: actor.organisationId,
            lessonId,
            studentMembershipId: membership.id,
            startedAt: new Date(),
          },
        });
        await this.audit(
          transaction,
          actor,
          'lesson.started',
          'lesson',
          lessonId,
          {},
        );
        return progress;
      },
    );
  }

  createAssignment(actor: Actor, courseId: string, body: CreateAssignmentDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        await this.requireCourseAccess(transaction, actor, courseId);
        const assignment = await transaction.assignment.create({
          data: {
            courseId,
            title: body.title.trim(),
            instructions: body.instructions?.trim() ?? '',
            points: body.points,
            dueAt: body.dueAt ? new Date(body.dueAt) : null,
            allowLateSubmissions: body.allowLateSubmissions ?? false,
          },
        });
        await this.audit(
          transaction,
          actor,
          'assignment.created',
          'assignment',
          assignment.id,
          { courseId },
        );
        return assignment;
      },
    );
  }

  saveSubmission(actor: Actor, assignmentId: string, body: SaveSubmissionDto) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const assignment = await transaction.assignment.findFirst({
          where: {
            id: assignmentId,
            course: {
              organisationId: actor.organisationId,
              published: true,
              classes: {
                some: {
                  class: {
                    students: { some: { studentMembershipId: membership.id } },
                  },
                },
              },
            },
          },
        });
        if (!assignment) throw new NotFoundException();
        const existing = await transaction.assignmentSubmission.findUnique({
          where: {
            assignmentId_studentMembershipId: {
              assignmentId,
              studentMembershipId: membership.id,
            },
          },
          include: { attachment: true },
        });
        if (
          existing?.status === SubmissionStatus.SUBMITTED ||
          existing?.status === SubmissionStatus.GRADED
        ) {
          throw new ConflictException({
            code: 'SUBMISSION_LOCKED',
            message:
              'This submission cannot be edited unless it is returned by the teacher.',
          });
        }
        if (
          body.submit &&
          !canSubmitAfterDueDate(
            assignment.dueAt,
            assignment.allowLateSubmissions,
            existing?.status === SubmissionStatus.RETURNED,
          )
        ) {
          throw new ForbiddenException({
            code: 'ASSIGNMENT_CLOSED',
            message:
              'The due date has passed and late submissions are disabled.',
          });
        }
        if (!body.body?.trim() && !body.fileId && !existing?.attachment) {
          throw new BadRequestException({
            code: 'SUBMISSION_EMPTY',
            message: 'Add a written response or one file.',
          });
        }
        if (body.fileId)
          await this.requireOwnedReadyFile(transaction, actor, body.fileId);

        const isResubmission = existing?.status === SubmissionStatus.RETURNED;
        const submission = await transaction.assignmentSubmission.upsert({
          where: {
            assignmentId_studentMembershipId: {
              assignmentId,
              studentMembershipId: membership.id,
            },
          },
          update: {
            body: body.body?.trim(),
            status: body.submit
              ? SubmissionStatus.SUBMITTED
              : SubmissionStatus.DRAFT,
            submittedAt: body.submit ? new Date() : null,
            score: null,
            feedback: null,
            gradedAt: null,
            gradedByMembershipId: null,
            ...(isResubmission ? { revision: { increment: 1 } } : {}),
          },
          create: {
            organisationId: actor.organisationId,
            assignmentId,
            studentMembershipId: membership.id,
            body: body.body?.trim(),
            status: body.submit
              ? SubmissionStatus.SUBMITTED
              : SubmissionStatus.DRAFT,
            submittedAt: body.submit ? new Date() : null,
          },
        });
        if (body.fileId !== undefined) {
          await transaction.submissionAttachment.deleteMany({
            where: { submissionId: submission.id },
          });
          if (body.fileId) {
            await transaction.submissionAttachment.create({
              data: {
                organisationId: actor.organisationId,
                submissionId: submission.id,
                storedFileId: body.fileId,
              },
            });
          }
        }
        await this.audit(
          transaction,
          actor,
          body.submit ? 'assignment.submitted' : 'assignment.draft_saved',
          'assignment_submission',
          submission.id,
          { assignmentId, revision: submission.revision },
        );
        return transaction.assignmentSubmission.findUniqueOrThrow({
          where: { id: submission.id },
          include: { attachment: { include: { storedFile: { select: { id: true, fileName: true, contentType: true } } } } },
        });
      },
    );
  }

  listSubmissions(actor: Actor, assignmentId: string) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const assignment = await transaction.assignment.findFirst({
          where: {
            id: assignmentId,
            course: { organisationId: actor.organisationId },
          },
        });
        if (!assignment) throw new NotFoundException();
        const membership = await this.actorMembership(transaction, actor);
        if (actor.role === MembershipRole.STUDENT) {
          await this.requireStudentCourseAccess(
            transaction,
            actor.organisationId,
            membership.id,
            assignment.courseId,
          );
          return transaction.assignmentSubmission.findMany({
            where: { assignmentId, studentMembershipId: membership.id },
            include: { attachment: { include: { storedFile: { select: { id: true, fileName: true, contentType: true } } } } },
          });
        }
        this.requireStaff(actor.role);
        await this.requireCourseAccess(transaction, actor, assignment.courseId);
        return transaction.assignmentSubmission.findMany({
          where: { assignmentId },
          include: {
            student: {
              include: { user: { select: { id: true, email: true } } },
            },
            attachment: { include: { storedFile: { select: { id: true, fileName: true, contentType: true } } } },
          },
          orderBy: { updatedAt: 'desc' },
        });
      },
    );
  }

  gradeSubmission(
    actor: Actor,
    submissionId: string,
    body: GradeSubmissionDto,
  ) {
    this.requireStaff(actor.role);
    if (
      body.status !== SubmissionStatus.GRADED &&
      body.status !== SubmissionStatus.RETURNED
    ) {
      throw new BadRequestException({
        code: 'GRADE_STATUS_INVALID',
        message: 'A submission can only be graded or returned.',
      });
    }
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const submission = await transaction.assignmentSubmission.findFirst({
          where: { id: submissionId, organisationId: actor.organisationId },
          include: { assignment: true },
        });
        if (!submission) throw new NotFoundException();
        await this.requireCourseAccess(
          transaction,
          actor,
          submission.assignment.courseId,
        );
        if (submission.status !== SubmissionStatus.SUBMITTED) {
          throw new ConflictException({
            code: 'SUBMISSION_NOT_READY',
            message: 'Only submitted work can be graded or returned.',
          });
        }
        if (
          body.status === SubmissionStatus.GRADED &&
          (body.score === undefined ||
            body.score > submission.assignment.points)
        ) {
          throw new BadRequestException({
            code: 'SCORE_INVALID',
            message: `Score must be between 0 and ${submission.assignment.points}.`,
          });
        }
        const grader = await this.actorMembership(transaction, actor);
        const graded = await transaction.assignmentSubmission.update({
          where: { id: submissionId },
          data: {
            status: body.status,
            score: body.status === SubmissionStatus.GRADED ? body.score : null,
            feedback: body.feedback.trim(),
            gradedAt:
              body.status === SubmissionStatus.GRADED ? new Date() : null,
            gradedByMembershipId: grader.id,
          },
        });
        await this.audit(
          transaction,
          actor,
          body.status === SubmissionStatus.GRADED
            ? 'assignment.graded'
            : 'assignment.returned',
          'assignment_submission',
          submissionId,
          {
            score: graded.score,
          },
        );
        return graded;
      },
    );
  }

  listClasses(actor: Actor) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const where: Prisma.ClassWhereInput = {
          organisationId: actor.organisationId,
        };
        if (actor.role === MembershipRole.TEACHER)
          where.teachers = { some: { teacherMembershipId: membership.id } };
        else if (actor.role === MembershipRole.STUDENT)
          where.students = { some: { studentMembershipId: membership.id } };
        else if (actor.role !== MembershipRole.ORGANISATION_ADMIN) return [];
        return transaction.class.findMany({
          where,
          include: {
            branch: { select: { id: true, name: true } },
            teachers: {
              include: {
                teacher: {
                  include: { user: { select: { id: true, email: true } } },
                },
              },
            },
            students: {
              include: {
                student: {
                  include: { user: { select: { id: true, email: true } } },
                },
              },
            },
            courses: {
              include: {
                course: { select: { id: true, title: true, published: true } },
              },
            },
          },
          orderBy: { name: 'asc' },
        });
      },
    );
  }

  createClass(actor: Actor, body: CreateClassDto) {
    this.requireRole(actor.role, MembershipRole.ORGANISATION_ADMIN);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        if (body.branchId) {
          const branch = await transaction.branch.findFirst({
            where: { id: body.branchId, organisationId: actor.organisationId },
          });
          if (!branch) throw new NotFoundException();
        }
        const created = await transaction.class.create({
          data: {
            organisationId: actor.organisationId,
            name: body.name.trim(),
            code: body.code?.trim() || null,
            academicYear: body.academicYear?.trim() || null,
            branchId: body.branchId,
          },
        });
        await this.audit(
          transaction,
          actor,
          'class.created',
          'class',
          created.id,
          {},
        );
        return created;
      },
    );
  }

  assignTeacher(actor: Actor, classId: string, body: AssignMembershipDto) {
    return this.assignMember(
      actor,
      classId,
      body.membershipId,
      MembershipRole.TEACHER,
    );
  }

  enrolStudent(actor: Actor, classId: string, body: AssignMembershipDto) {
    return this.assignMember(
      actor,
      classId,
      body.membershipId,
      MembershipRole.STUDENT,
    );
  }

  assignCourse(actor: Actor, classId: string, body: AssignCourseDto) {
    this.requireRole(actor.role, MembershipRole.ORGANISATION_ADMIN);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const [classroom, course] = await Promise.all([
          transaction.class.findFirst({
            where: { id: classId, organisationId: actor.organisationId },
          }),
          transaction.course.findFirst({
            where: { id: body.courseId, organisationId: actor.organisationId },
          }),
        ]);
        if (!classroom || !course) throw new NotFoundException();
        const assignment = await transaction.courseClass.upsert({
          where: { courseId_classId: { courseId: course.id, classId } },
          update: {},
          create: {
            organisationId: actor.organisationId,
            classId,
            courseId: course.id,
          },
        });
        await this.audit(
          transaction,
          actor,
          'course.class_assigned',
          'course_class',
          assignment.id,
          { classId, courseId: course.id },
        );
        return assignment;
      },
    );
  }

  createQuiz(actor: Actor, courseId: string, body: CreateQuizDto) {
    this.requireStaff(actor.role);
    this.validateQuizQuestions(body);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        await this.requireCourseAccess(transaction, actor, courseId);
        const quiz = await transaction.quiz.create({
          data: {
            organisationId: actor.organisationId,
            courseId,
            title: body.title.trim(),
            instructions: body.instructions?.trim() ?? '',
            availableFrom: body.availableFrom
              ? new Date(body.availableFrom)
              : null,
            dueAt: body.dueAt ? new Date(body.dueAt) : null,
            attemptsAllowed: body.attemptsAllowed,
            scorePolicy: body.scorePolicy,
            questions: {
              create: body.questions.map((question) => ({
                organisationId: actor.organisationId,
                type: question.type,
                prompt: question.prompt.trim(),
                points: question.points,
                position: question.position,
                options: question.options as Prisma.InputJsonValue | undefined,
                correctAnswer: question.correctAnswer as
                  Prisma.InputJsonValue | undefined,
              })),
            },
          },
          include: { questions: { orderBy: { position: 'asc' } } },
        });
        await this.audit(transaction, actor, 'quiz.created', 'quiz', quiz.id, {
          courseId,
          questionCount: body.questions.length,
        });
        return quiz;
      },
    );
  }

  setQuizPublished(actor: Actor, quizId: string, published: boolean) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const quiz = await transaction.quiz.findFirst({
          where: { id: quizId, organisationId: actor.organisationId },
          include: { questions: true },
        });
        if (!quiz) throw new NotFoundException();
        await this.requireCourseAccess(transaction, actor, quiz.courseId);
        if (published && quiz.questions.length === 0) {
          throw new BadRequestException({
            code: 'QUIZ_EMPTY',
            message: 'Add at least one question before publishing.',
          });
        }
        const updated = await transaction.quiz.update({
          where: { id: quizId },
          data: { published },
        });
        await this.audit(
          transaction,
          actor,
          published ? 'quiz.published' : 'quiz.unpublished',
          'quiz',
          quizId,
          {},
        );
        return updated;
      },
    );
  }

  startQuiz(actor: Actor, quizId: string) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const quiz = await transaction.quiz.findFirst({
          where: {
            id: quizId,
            organisationId: actor.organisationId,
            published: true,
            course: {
              published: true,
              classes: {
                some: {
                  class: {
                    students: { some: { studentMembershipId: membership.id } },
                  },
                },
              },
            },
          },
          include: {
            questions: { orderBy: { position: 'asc' } },
            attempts: { where: { studentMembershipId: membership.id } },
          },
        });
        if (!quiz) throw new NotFoundException();
        const now = new Date();
        if (!isAvailable(quiz.availableFrom, now)) {
          throw new ForbiddenException({
            code: 'QUIZ_LOCKED',
            message: 'This quiz is not available yet.',
          });
        }
        if (quiz.dueAt && quiz.dueAt < now)
          throw new ForbiddenException({
            code: 'QUIZ_CLOSED',
            message: 'This quiz is closed.',
          });
        const inProgress = quiz.attempts.find(
          (attempt) => attempt.status === QuizAttemptStatus.IN_PROGRESS,
        );
        if (inProgress) return this.safeAttempt(transaction, inProgress.id);
        if (quiz.attempts.length >= quiz.attemptsAllowed) {
          throw new ForbiddenException({
            code: 'QUIZ_ATTEMPTS_EXHAUSTED',
            message: 'No quiz attempts remain.',
          });
        }
        const attempt = await transaction.quizAttempt.create({
          data: {
            organisationId: actor.organisationId,
            quizId,
            studentMembershipId: membership.id,
            attemptNumber: quiz.attempts.length + 1,
          },
        });
        await this.audit(
          transaction,
          actor,
          'quiz.attempt_started',
          'quiz_attempt',
          attempt.id,
          { quizId, attemptNumber: attempt.attemptNumber },
        );
        return this.safeAttempt(transaction, attempt.id);
      },
    );
  }

  saveQuizAnswer(actor: Actor, attemptId: string, body: SaveQuizAnswerDto) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const attempt = await transaction.quizAttempt.findFirst({
          where: {
            id: attemptId,
            organisationId: actor.organisationId,
            studentMembershipId: membership.id,
            status: QuizAttemptStatus.IN_PROGRESS,
          },
          include: { quiz: true },
        });
        if (!attempt) throw new NotFoundException();
        if (attempt.quiz.dueAt && attempt.quiz.dueAt < new Date())
          throw new ForbiddenException({
            code: 'QUIZ_CLOSED',
            message: 'This quiz is closed.',
          });
        const question = await transaction.quizQuestion.findFirst({
          where: { id: body.questionId, quizId: attempt.quizId },
        });
        if (!question) throw new NotFoundException();
        if (question.type === QuizQuestionType.FILE_RESPONSE) {
          if (!body.fileId)
            throw new BadRequestException({
              code: 'FILE_REQUIRED',
              message: 'Attach one file for this response.',
            });
          await this.requireOwnedReadyFile(transaction, actor, body.fileId);
        } else if (body.fileId) {
          throw new BadRequestException({
            code: 'FILE_NOT_ALLOWED',
            message: 'This question does not accept a file.',
          });
        }
        return transaction.quizAnswer.upsert({
          where: {
            attemptId_questionId: { attemptId, questionId: question.id },
          },
          update: {
            response: body.response as Prisma.InputJsonValue | undefined,
            storedFileId: body.fileId || null,
          },
          create: {
            organisationId: actor.organisationId,
            attemptId,
            questionId: question.id,
            response: body.response as Prisma.InputJsonValue | undefined,
            storedFileId: body.fileId || null,
          },
        });
      },
    );
  }

  submitQuiz(actor: Actor, attemptId: string) {
    this.requireRole(actor.role, MembershipRole.STUDENT);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const attempt = await transaction.quizAttempt.findFirst({
          where: {
            id: attemptId,
            organisationId: actor.organisationId,
            studentMembershipId: membership.id,
            status: QuizAttemptStatus.IN_PROGRESS,
          },
          include: { quiz: { include: { questions: true } }, answers: true },
        });
        if (!attempt) throw new NotFoundException();
        const answers = new Map(
          attempt.answers.map((answer) => [answer.questionId, answer]),
        );
        const unanswered = attempt.quiz.questions.some((question) => {
          const answer = answers.get(question.id);
          if (!answer) return true;
          if (question.type === QuizQuestionType.FILE_RESPONSE)
            return !answer.storedFileId;
          return (
            answer.response === null ||
            answer.response === undefined ||
            answer.response === ''
          );
        });
        if (unanswered) {
          throw new BadRequestException({
            code: 'QUIZ_INCOMPLETE',
            message: 'Answer every question before submitting the quiz.',
          });
        }
        let score = 0;
        let needsReview = false;
        for (const question of attempt.quiz.questions) {
          const answer = answers.get(question.id);
          if (
            question.type === QuizQuestionType.MCQ ||
            question.type === QuizQuestionType.TRUE_FALSE
          ) {
            const awardedPoints =
              answer && answersMatch(answer.response, question.correctAnswer)
                ? question.points
                : 0;
            if (answer)
              await transaction.quizAnswer.update({
                where: { id: answer.id },
                data: { awardedPoints },
              });
            score += awardedPoints;
          } else {
            needsReview = true;
          }
        }
        const status = needsReview
          ? QuizAttemptStatus.PENDING_REVIEW
          : QuizAttemptStatus.GRADED;
        const updated = await transaction.quizAttempt.update({
          where: { id: attemptId },
          data: {
            status,
            score: needsReview ? null : score,
            submittedAt: new Date(),
            gradedAt: needsReview ? null : new Date(),
          },
        });
        await this.audit(
          transaction,
          actor,
          'quiz.attempt_submitted',
          'quiz_attempt',
          attemptId,
          { status, autoScore: score },
        );
        return updated;
      },
    );
  }

  listQuizAttempts(actor: Actor, quizId: string) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const quiz = await transaction.quiz.findFirst({
          where: { id: quizId, organisationId: actor.organisationId },
        });
        if (!quiz) throw new NotFoundException();
        const membership = await this.actorMembership(transaction, actor);
        if (actor.role === MembershipRole.STUDENT) {
          await this.requireStudentCourseAccess(
            transaction,
            actor.organisationId,
            membership.id,
            quiz.courseId,
          );
          const attempts = await transaction.quizAttempt.findMany({
            where: { quizId, studentMembershipId: membership.id },
            include: { answers: true },
            orderBy: { attemptNumber: 'desc' },
          });
          return {
            attempts,
            resultScore: selectQuizScore(attempts, quiz.scorePolicy),
            scorePolicy: quiz.scorePolicy,
          };
        }
        this.requireStaff(actor.role);
        await this.requireCourseAccess(transaction, actor, quiz.courseId);
        return transaction.quizAttempt.findMany({
          where: { quizId },
          include: {
            student: {
              include: { user: { select: { id: true, email: true } } },
            },
            answers: { include: { question: true, storedFile: { select: { id: true, fileName: true, contentType: true } } } },
          },
          orderBy: [{ submittedAt: 'desc' }, { attemptNumber: 'desc' }],
        });
      },
    );
  }

  gradeQuizAttempt(actor: Actor, attemptId: string, body: GradeQuizAttemptDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const attempt = await transaction.quizAttempt.findFirst({
          where: {
            id: attemptId,
            organisationId: actor.organisationId,
            status: QuizAttemptStatus.PENDING_REVIEW,
          },
          include: {
            quiz: { include: { questions: true } },
            answers: { include: { question: true } },
          },
        });
        if (!attempt) throw new NotFoundException();
        await this.requireCourseAccess(
          transaction,
          actor,
          attempt.quiz.courseId,
        );
        const answersById = new Map(
          attempt.answers.map((answer) => [answer.id, answer]),
        );
        for (const grade of body.answers) {
          const answer = answersById.get(grade.answerId);
          if (
            !answer ||
            (answer.question.type !== QuizQuestionType.SHORT_ANSWER &&
              answer.question.type !== QuizQuestionType.ESSAY &&
              answer.question.type !== QuizQuestionType.FILE_RESPONSE)
          ) {
            throw new BadRequestException({
              code: 'QUIZ_ANSWER_INVALID',
              message: 'A manual grade references an invalid answer.',
            });
          }
          if (grade.awardedPoints > answer.question.points) {
            throw new BadRequestException({
              code: 'SCORE_INVALID',
              message: `Score cannot exceed ${answer.question.points}.`,
            });
          }
          await transaction.quizAnswer.update({
            where: { id: answer.id },
            data: {
              awardedPoints: grade.awardedPoints,
              feedback: grade.feedback?.trim() || null,
            },
          });
        }
        const gradedAnswers = await transaction.quizAnswer.findMany({
          where: { attemptId },
        });
        const gradedByQuestion = new Map(
          gradedAnswers.map((answer) => [answer.questionId, answer]),
        );
        const incompleteManualAnswer = attempt.quiz.questions.some(
          (question) => {
            if (
              question.type === QuizQuestionType.MCQ ||
              question.type === QuizQuestionType.TRUE_FALSE
            )
              return false;
            return gradedByQuestion.get(question.id)?.awardedPoints == null;
          },
        );
        if (incompleteManualAnswer) {
          throw new BadRequestException({
            code: 'MANUAL_GRADING_INCOMPLETE',
            message: 'Every manual response must receive a score.',
          });
        }
        const score = gradedAnswers.reduce(
          (total, answer) => total + (answer.awardedPoints ?? 0),
          0,
        );
        const grader = await this.actorMembership(transaction, actor);
        const graded = await transaction.quizAttempt.update({
          where: { id: attemptId },
          data: {
            status: QuizAttemptStatus.GRADED,
            score,
            gradedAt: new Date(),
            gradedByMembershipId: grader.id,
          },
        });
        await this.audit(
          transaction,
          actor,
          'quiz.attempt_graded',
          'quiz_attempt',
          attemptId,
          { score },
        );
        return graded;
      },
    );
  }

  async classProgress(actor: Actor, classId: string) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        const classroom = await transaction.class.findFirst({
          where: {
            id: classId,
            organisationId: actor.organisationId,
            ...(actor.role === MembershipRole.TEACHER
              ? { teachers: { some: { teacherMembershipId: membership.id } } }
              : {}),
          },
          include: {
            students: {
              include: {
                student: {
                  include: { user: { select: { id: true, email: true } } },
                },
              },
            },
            courses: {
              include: {
                course: {
                  include: {
                    lessons: {
                      where: { published: true },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!classroom) throw new NotFoundException();
        const lessonIds = classroom.courses.flatMap((item) =>
          item.course.lessons.map((lesson) => lesson.id),
        );
        const progress = await transaction.lessonProgress.groupBy({
          by: ['studentMembershipId'],
          where: { lessonId: { in: lessonIds }, completedAt: { not: null } },
          _count: { _all: true },
        });
        const completed = new Map(
          progress.map((item) => [item.studentMembershipId, item._count._all]),
        );
        return {
          class: { id: classroom.id, name: classroom.name },
          totalLessons: lessonIds.length,
          students: classroom.students.map(({ student }) => {
            const completedLessons = completed.get(student.id) ?? 0;
            return {
              membershipId: student.id,
              email: student.user.email,
              completedLessons,
              progressPercentage: calculateProgressPercentage(
                completedLessons,
                lessonIds.length,
              ),
            };
          }),
        };
      },
    );
  }

  private async assignMember(
    actor: Actor,
    classId: string,
    membershipId: string,
    role: MembershipRole,
  ) {
    this.requireRole(actor.role, MembershipRole.ORGANISATION_ADMIN);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const [classroom, member] = await Promise.all([
          transaction.class.findFirst({
            where: { id: classId, organisationId: actor.organisationId },
          }),
          transaction.membership.findFirst({
            where: {
              id: membershipId,
              organisationId: actor.organisationId,
              role,
            },
          }),
        ]);
        if (!classroom || !member) throw new NotFoundException();
        const assignment =
          role === MembershipRole.TEACHER
            ? await transaction.classTeacher.upsert({
                where: {
                  classId_teacherMembershipId: {
                    classId,
                    teacherMembershipId: membershipId,
                  },
                },
                update: {},
                create: {
                  organisationId: actor.organisationId,
                  classId,
                  teacherMembershipId: membershipId,
                },
              })
            : await transaction.classStudent.upsert({
                where: {
                  classId_studentMembershipId: {
                    classId,
                    studentMembershipId: membershipId,
                  },
                },
                update: {},
                create: {
                  organisationId: actor.organisationId,
                  classId,
                  studentMembershipId: membershipId,
                },
              });
        await this.audit(
          transaction,
          actor,
          role === MembershipRole.TEACHER
            ? 'class.teacher_assigned'
            : 'class.student_enrolled',
          'class',
          classId,
          {
            membershipId,
          },
        );
        return assignment;
      },
    );
  }

  private async actorMembership(
    transaction: Prisma.TransactionClient,
    actor: Actor,
  ) {
    const membership = await transaction.membership.findUnique({
      where: {
        organisationId_userId_role: {
          organisationId: actor.organisationId,
          userId: actor.userId,
          role: actor.role,
        },
      },
    });
    if (!membership)
      throw new ForbiddenException({
        code: 'MEMBERSHIP_REQUIRED',
        message: 'Membership is no longer active.',
      });
    return membership;
  }

  private async requireCourseAccess(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    courseId: string,
  ) {
    if (actor.role === MembershipRole.ORGANISATION_ADMIN) {
      const course = await transaction.course.findFirst({
        where: { id: courseId, organisationId: actor.organisationId },
      });
      if (!course) throw new NotFoundException();
      return course;
    }
    if (actor.role !== MembershipRole.TEACHER)
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Staff access is required.',
      });
    const membership = await this.actorMembership(transaction, actor);
    const course = await transaction.course.findFirst({
      where: {
        id: courseId,
        organisationId: actor.organisationId,
        classes: {
          some: {
            class: {
              teachers: { some: { teacherMembershipId: membership.id } },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
    return course;
  }

  private async requireStudentCourseAccess(
    transaction: Prisma.TransactionClient,
    organisationId: string,
    membershipId: string,
    courseId: string,
  ) {
    const course = await transaction.course.findFirst({
      where: {
        id: courseId,
        organisationId,
        published: true,
        classes: {
          some: {
            class: {
              students: { some: { studentMembershipId: membershipId } },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
  }

  private async requireOwnedReadyFile(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    fileId: string,
  ) {
    const file = await transaction.storedFile.findFirst({
      where: {
        id: fileId,
        organisationId: actor.organisationId,
        uploadedByUserId: actor.userId,
        status: 'READY',
      },
    });
    if (!file)
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'The uploaded file is unavailable.',
      });
    return file;
  }

  private safeAttempt(
    transaction: Prisma.TransactionClient,
    attemptId: string,
  ) {
    return transaction.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        answers: true,
        quiz: {
          include: {
            questions: {
              select: {
                id: true,
                type: true,
                prompt: true,
                points: true,
                position: true,
                options: true,
              },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
  }

  private validateQuizQuestions(body: CreateQuizDto) {
    if (body.questions.length === 0)
      throw new BadRequestException({
        code: 'QUIZ_EMPTY',
        message: 'Add at least one question.',
      });
    const positions = new Set<number>();
    for (const question of body.questions) {
      if (positions.has(question.position))
        throw new BadRequestException({
          code: 'QUESTION_POSITION_DUPLICATE',
          message: 'Question positions must be unique.',
        });
      positions.add(question.position);
      if (question.type === QuizQuestionType.MCQ) {
        if (
          !question.options ||
          question.options.length < 2 ||
          !question.correctAnswer ||
          !question.options.includes(question.correctAnswer)
        ) {
          throw new BadRequestException({
            code: 'MCQ_INVALID',
            message:
              'MCQ questions need at least two options and one matching correct answer.',
          });
        }
      } else if (question.type === QuizQuestionType.TRUE_FALSE) {
        if (
          !['true', 'false'].includes(
            question.correctAnswer?.toLowerCase() ?? '',
          )
        ) {
          throw new BadRequestException({
            code: 'TRUE_FALSE_INVALID',
            message:
              'True/false questions need a true or false correct answer.',
          });
        }
      } else if (question.correctAnswer) {
        throw new BadRequestException({
          code: 'MANUAL_ANSWER_INVALID',
          message:
            'Manual-review questions cannot contain a stored correct answer.',
        });
      }
    }
  }

  private audit(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return transaction.auditLog.create({
      data: {
        organisationId: actor.organisationId,
        actorUserId: actor.userId,
        action,
        targetType,
        targetId,
        metadata,
      },
    });
  }

  private requireStaff(role: MembershipRole) {
    if (
      role !== MembershipRole.TEACHER &&
      role !== MembershipRole.ORGANISATION_ADMIN
    ) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: 'Only assigned staff can manage learning content.',
      });
    }
  }

  private requireRole(actual: MembershipRole, required: MembershipRole) {
    if (actual !== required)
      throw new ForbiddenException({
        code: 'ROLE_NOT_ALLOWED',
        message: `${required} access is required.`,
      });
  }
}
