export type User = { id: string; name: string; email: string; avatarUrl: string };

export type BoardSummary = {
  id: string;
  name: string;
  coverGradient: string;
  updatedAt: string;
  listCount: number;
  labelCount: number;
};

export type Label = { id: string; name: string; color: string };

export type CardMember = { id: string; name: string; avatarUrl: string };

export type ChecklistItem = { id: string; text: string; done: boolean; position: number };

export type Checklist = { id: string; title: string; items: ChecklistItem[] };

export type CardLite = {
  id: string;
  listId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  coverColor: string | null;
  coverImage: string | null;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  members: CardMember[];
  checklists: Checklist[];
};

export type KanbanList = { id: string; name: string; position: number; cards: CardLite[] };

export type BoardDetail = {
  id: string;
  name: string;
  coverGradient: string;
  updatedAt: string;
  labels: Label[];
  lists: KanbanList[];
};

export type CardDetail = {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  coverColor: string | null;
  coverImage: string | null;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  members: CardMember[];
  checklists: Checklist[];
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: CardMember;
  }>;
  activities: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
    user: CardMember;
  }>;
};

export type PresenceViewer = {
  userId: string;
  name: string;
  avatarUrl: string;
  clientId: string;
};
