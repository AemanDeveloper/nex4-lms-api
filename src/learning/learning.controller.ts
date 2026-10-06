import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberRequest } from '../auth/auth.types';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import {
  AcceptInvitationDto,
  AssignCourseDto,
  AssignMembershipDto,
  CreateClassDto,
  CreateInvitationDto,
  CreateQuizDto,
  GradeQuizAttemptDto,
  GradeSubmissionDto,
  SaveQuizAnswerDto,
  SaveSubmissionDto,
  UpdateLessonAvailabilityDto,
  UpdateQuizAvailabilityDto,
} from './dto/learning-core.dto';
import { InvitationService } from './invitation.service';
import { LearningService } from './learning.service';

function actor(request: MemberRequest) {
  return {
    organisationId: request.member.organisationId,
    userId: request.member.sub,
    role: request.member.role,
  };
}

@ApiTags('invitations')
@Controller('invitations')
export class PublicInvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('accept')
  accept(@Body() body: AcceptInvitationDto) {
    return this.invitations.accept(body);
  }
}

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(MemberAuthGuard, OrganisationWriteGuard)
@Controller()
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly invitations: InvitationService,
  ) {}

  @Get('invitations')
  listInvitations(@Req() request: MemberRequest) {
    return this.invitations.list(
      request.member.organisationId,
      request.member.role,
    );
  }

  @Post('invitations')
  createInvitation(
    @Req() request: MemberRequest,
    @Body() body: CreateInvitationDto,
  ) {
    return this.invitations.create(
      request.member.organisationId,
      request.member.sub,
      request.member.role,
      body,
    );
  }

  @Post('invitations/:invitationId/resend')
  resendInvitation(
    @Req() request: MemberRequest,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitations.resend(
      request.member.organisationId,
      request.member.sub,
      request.member.role,
      invitationId,
    );
  }

  @Get('courses')
  listCourses(@Req() request: MemberRequest) {
    return this.learning.listCourses(actor(request));
  }

  @Post('courses')
  createCourse(@Req() request: MemberRequest, @Body() body: CreateCourseDto) {
    return this.learning.createCourse(actor(request), body);
  }

  @Patch('courses/:courseId/publishing')
  setCoursePublished(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: UpdateQuizAvailabilityDto,
  ) {
    return this.learning.setCoursePublished(
      actor(request),
      courseId,
      body.published,
    );
  }

  @Post('courses/:courseId/lessons')
  createLesson(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateLessonDto,
  ) {
    return this.learning.createLesson(actor(request), courseId, body);
  }

  @Patch('lessons/:lessonId/availability')
  setLessonAvailability(
    @Req() request: MemberRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() body: UpdateLessonAvailabilityDto,
  ) {
    return this.learning.setLessonAvailability(actor(request), lessonId, body);
  }

  @Post('lessons/:lessonId/complete')
  completeLesson(
    @Req() request: MemberRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learning.completeLesson(actor(request), lessonId);
  }

  @Post('lessons/:lessonId/start')
  startLesson(
    @Req() request: MemberRequest,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.learning.startLesson(actor(request), lessonId);
  }

  @Post('courses/:courseId/assignments')
  createAssignment(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateAssignmentDto,
  ) {
    return this.learning.createAssignment(actor(request), courseId, body);
  }

  @Get('assignments/:assignmentId/submissions')
  listSubmissions(
    @Req() request: MemberRequest,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.learning.listSubmissions(actor(request), assignmentId);
  }

  @Post('assignments/:assignmentId/submission')
  saveSubmission(
    @Req() request: MemberRequest,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: SaveSubmissionDto,
  ) {
    return this.learning.saveSubmission(actor(request), assignmentId, body);
  }

  @Post('submissions/:submissionId/grade')
  gradeSubmission(
    @Req() request: MemberRequest,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() body: GradeSubmissionDto,
  ) {
    return this.learning.gradeSubmission(actor(request), submissionId, body);
  }

  @Get('classes')
  listClasses(@Req() request: MemberRequest) {
    return this.learning.listClasses(actor(request));
  }

  @Post('classes')
  createClass(@Req() request: MemberRequest, @Body() body: CreateClassDto) {
    return this.learning.createClass(actor(request), body);
  }

  @Post('classes/:classId/teachers')
  assignTeacher(
    @Req() request: MemberRequest,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AssignMembershipDto,
  ) {
    return this.learning.assignTeacher(actor(request), classId, body);
  }

  @Post('classes/:classId/students')
  enrolStudent(
    @Req() request: MemberRequest,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AssignMembershipDto,
  ) {
    return this.learning.enrolStudent(actor(request), classId, body);
  }

  @Post('classes/:classId/courses')
  assignCourse(
    @Req() request: MemberRequest,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() body: AssignCourseDto,
  ) {
    return this.learning.assignCourse(actor(request), classId, body);
  }

  @Get('classes/:classId/progress')
  classProgress(
    @Req() request: MemberRequest,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.learning.classProgress(actor(request), classId);
  }

  @Post('courses/:courseId/quizzes')
  createQuiz(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateQuizDto,
  ) {
    return this.learning.createQuiz(actor(request), courseId, body);
  }

  @Patch('quizzes/:quizId/publishing')
  setQuizPublished(
    @Req() request: MemberRequest,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() body: UpdateQuizAvailabilityDto,
  ) {
    return this.learning.setQuizPublished(
      actor(request),
      quizId,
      body.published,
    );
  }

  @Post('quizzes/:quizId/attempts')
  startQuiz(
    @Req() request: MemberRequest,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.learning.startQuiz(actor(request), quizId);
  }

  @Get('quizzes/:quizId/attempts')
  listQuizAttempts(
    @Req() request: MemberRequest,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ) {
    return this.learning.listQuizAttempts(actor(request), quizId);
  }

  @Post('quiz-attempts/:attemptId/answers')
  saveQuizAnswer(
    @Req() request: MemberRequest,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() body: SaveQuizAnswerDto,
  ) {
    return this.learning.saveQuizAnswer(actor(request), attemptId, body);
  }

  @Post('quiz-attempts/:attemptId/submit')
  submitQuiz(
    @Req() request: MemberRequest,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.learning.submitQuiz(actor(request), attemptId);
  }

  @Post('quiz-attempts/:attemptId/grade')
  gradeQuizAttempt(
    @Req() request: MemberRequest,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() body: GradeQuizAttemptDto,
  ) {
    return this.learning.gradeQuizAttempt(actor(request), attemptId, body);
  }
}
