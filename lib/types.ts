export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED";
export type IssueStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type IssueType = "TASK" | "SUBTASK";

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type CurrentUserDTO = UserDTO & {
  role: "admin" | "user";
};

export type IssueDTO = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  estimate: number | null;
  timeSpent: number;
  timeRemaining: number | null;
  timeSpentDescription: string | null;
  startDate: string;
  dueDate: string;
  position: number;
  epicId: string | null;
  epic: EpicDTO | null;
  sprintId: string | null;
  parentIssueId: string | null;
  blockedByIssueId: string | null;
  isBlockedUntilDone: boolean;
  assigneeId: string;
  reporterId: string;
  assignee: UserDTO;
  labels?: IssueLabelDTO[];
  createdAt: string;
  updatedAt: string;
};

export type SprintDTO = {
  id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startsAt: string | null;
  endsAt: string | null;
  issues?: IssueDTO[];
  createdAt: string;
  updatedAt: string;
};

export type EpicDTO = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type IssueLabelDTO = {
  id: string;
  name: string;
  color: string;
};

export type IssueCommentDTO = {
  id: string;
  body: string;
  authorId: string;
  author: UserDTO;
  createdAt: string;
  updatedAt: string;
};

export type IssueAttachmentDTO = {
  id: string;
  issueId: string;
  uploaderId: string;
  uploader: UserDTO;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueWorklogDTO = {
  id: string;
  issueId: string;
  authorId: string;
  author: UserDTO;
  timeSpent: number;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueSummaryDTO = {
  id: string;
  code: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  estimate?: number | null;
  startDate?: string;
  dueDate?: string;
  assignee: UserDTO;
  createdAt: string;
  updatedAt: string;
};

export type IssueBlockerDTO = {
  id: string;
  blockedIssueId: string;
  blockerIssueId: string;
  isBlockingUntilDone: boolean;
  blockerIssue: IssueSummaryDTO;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogDTO = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  userId: string;
  user: UserDTO;
  createdAt: string;
  updatedAt: string;
};

export type IssueDetailDTO = IssueDTO & {
  parentIssue: IssueSummaryDTO | null;
  blockedByIssue: IssueSummaryDTO | null;
  blockers: IssueBlockerDTO[];
  subtasks: IssueSummaryDTO[];
  reporter: UserDTO;
  comments: IssueCommentDTO[];
  attachments: IssueAttachmentDTO[];
  worklogs: IssueWorklogDTO[];
  auditLogs: AuditLogDTO[];
};

export type BacklogDTO = {
  project: {
    id: string;
    key: string;
    name: string;
  } | null;
  currentUser: CurrentUserDTO | null;
  users: UserDTO[];
  epics: EpicDTO[];
  sprints: Array<SprintDTO & { issues: IssueDTO[] }>;
  backlogIssues: IssueDTO[];
};

export type BoardDTO = {
  project: {
    id: string;
    key: string;
    name: string;
  } | null;
  currentUser: CurrentUserDTO | null;
  sprint: (SprintDTO & { issues: IssueDTO[] }) | null;
  users: UserDTO[];
  epics: EpicDTO[];
  labels: IssueLabelDTO[];
  plannedSprints: SprintDTO[];
};
