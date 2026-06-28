import {
  closestCorners,
  getFirstCollision,
  KeyboardCode,
  type DroppableContainer,
  type KeyboardCoordinateGetter
} from "@dnd-kit/core";

import type { IssueDTO } from "@/lib/types";

const directions: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left
];

/**
 * Keyboard navigation for the Kanban board (built on @dnd-kit/core droppables,
 * not @dnd-kit/sortable). Arrow keys move the picked-up card toward the nearest
 * column / card droppable in that direction, snapping to its center so a single
 * Left/Right press jumps between columns instead of nudging by a fixed delta.
 */
export const boardCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } }
) => {
  if (!directions.includes(event.code)) return undefined;

  event.preventDefault();
  if (!active || !collisionRect) return undefined;

  const activeIssue = active.data.current?.issue as IssueDTO | undefined;
  const activeIssueId = activeIssue?.id;
  // The column the card currently lives in. Excluding it stops a lateral move
  // from snapping onto the card's own column (whose padded left edge sits just
  // left of the card), which would otherwise swallow the keypress.
  const activeColumnId = activeIssue ? `column:${activeIssue.status}` : null;

  const candidates: DroppableContainer[] = [];
  droppableContainers.getEnabled().forEach((container) => {
    if (!container || container.disabled) return;

    const rect = droppableRects.get(container.id);
    if (!rect) return;

    // Skip the dragged card's own droppable node and its current column.
    const data = container.data.current as { issueId?: string } | undefined;
    if (activeIssueId && data?.issueId === activeIssueId) return;
    if (activeColumnId && String(container.id) === activeColumnId) return;

    switch (event.code) {
      case KeyboardCode.Down:
        if (collisionRect.top < rect.top) candidates.push(container);
        break;
      case KeyboardCode.Up:
        if (collisionRect.top > rect.top) candidates.push(container);
        break;
      case KeyboardCode.Left:
        if (collisionRect.left > rect.left) candidates.push(container);
        break;
      case KeyboardCode.Right:
        if (collisionRect.left < rect.left) candidates.push(container);
        break;
    }
  });

  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null
  });
  const closestId = getFirstCollision(collisions, "id");
  if (closestId == null) return undefined;

  const newRect = droppableRects.get(closestId);
  if (!newRect) return undefined;

  // Align the dragged card with the target's top-left (small offset) rather than
  // its center: centering would push the wide card's edge into the neighbouring
  // column, so the default rectIntersection in <DndContext> would resolve `over`
  // to the wrong column. Top-left keeps the card contained in the target column.
  return {
    x: newRect.left + 8,
    y: newRect.top + 8
  };
};
