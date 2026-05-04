import {
  Phone,
  ChatCircle,
  Bell,
  ArrowsClockwise,
  FolderPlus,
  Flag,
  PencilSimple,
  ShareNetwork,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

export interface TaskTypeConfig {
  id: string;
  labelKey: string;
  icon: ComponentType<{ size?: number | string; weight?: any; className?: string }>;
}

export const TASK_TYPES: TaskTypeConfig[] = [
  { id: 'folder_creation', labelKey: 'tasks.typeFolderCreation', icon: FolderPlus },
  { id: 'initial', labelKey: 'tasks.typeInitial', icon: Flag },
  { id: 'correction', labelKey: 'tasks.typeCorrection', icon: PencilSimple },
  { id: 'distribution', labelKey: 'tasks.typeDistribution', icon: ShareNetwork },
  { id: 'call', labelKey: 'tasks.typeCall', icon: Phone },
  { id: 'message', labelKey: 'tasks.typeMessage', icon: ChatCircle },
  { id: 'reminder', labelKey: 'tasks.typeReminder', icon: Bell },
  { id: 'follow_up', labelKey: 'tasks.typeFollowUp', icon: ArrowsClockwise },
];

export const getTaskTypeConfig = (id?: string | null): TaskTypeConfig => {
  return (
    TASK_TYPES.find((t) => t.id === id) ??
    TASK_TYPES.find((t) => t.id === 'initial') ??
    TASK_TYPES[0]
  );
};
