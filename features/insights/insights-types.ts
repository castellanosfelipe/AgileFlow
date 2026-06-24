import type {
  CurrentUserDTO,
  EpicDTO,
  IssueBlockerDTO,
  IssueSummaryDTO,
  IssueStatus,
  IssueType,
  IssueWorklogDTO,
  SprintDTO,
  UserDTO
} from "@/lib/types";

type PlanningWorklogDTO = Omit<IssueWorklogDTO, "author"> & {
  author?: IssueWorklogDTO["author"];
};

export type PlanningIssueDTO = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  estimate: number | null;
  timeSpent: number;
  timeRemaining: number | null;
  startDate: string;
  dueDate: string;
  position: number;
  epicId: string | null;
  epic: EpicDTO | null;
  sprintId: string | null;
  sprint: SprintDTO | null;
  parentIssueId: string | null;
  parentIssue: IssueSummaryDTO | null;
  assigneeId: string;
  assignee: UserDTO;
  blockers: IssueBlockerDTO[];
  blockingLinks: Array<{
    id: string;
    blockedIssueId: string;
    blockerIssueId: string;
    isBlockingUntilDone: boolean;
    blockedIssue: IssueSummaryDTO;
    createdAt: string;
    updatedAt: string;
  }>;
  worklogs: PlanningWorklogDTO[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectInsightsDTO = {
  project: {
    id: string;
    key: string;
    name: string;
  } | null;
  currentUser: CurrentUserDTO | null;
  users: UserDTO[];
  epics: EpicDTO[];
  sprints: SprintDTO[];
  issues: PlanningIssueDTO[];
};
