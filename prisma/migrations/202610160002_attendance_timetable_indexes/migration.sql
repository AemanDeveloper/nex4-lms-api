CREATE INDEX "attendance_sessions_createdByMembershipId_idx"
  ON "attendance_sessions"("createdByMembershipId");

CREATE INDEX "attendance_records_studentMembershipId_idx"
  ON "attendance_records"("studentMembershipId");

CREATE INDEX "timetable_entries_courseId_idx"
  ON "timetable_entries"("courseId");

CREATE INDEX "timetable_entries_createdByMembershipId_idx"
  ON "timetable_entries"("createdByMembershipId");
