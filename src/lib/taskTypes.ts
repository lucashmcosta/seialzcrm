import {
  CheckSquare,
  Phone,
  ChatCircle,
  WhatsappLogo,
  Bell,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

export interface TaskTypeConfig {
  id: string;
  labelKey: string;
  icon: ComponentType<{ size?: number | string; weight?: any; className?: string }>;
}

export const TASK_TYPES: TaskTypeConfig[] = [
  { id: 'general', labelKey: 'tasks.typeGeneral', icon: CheckSquare },
  { id: 'call', labelKey: 'tasks.typeCall', icon: Phone },
  { id: 'message', labelKey: 'tasks.typeMessage', icon: ChatCircle },
  { id: 'whatsapp', labelKey: 'tasks.typeWhatsapp', icon: WhatsappLogo },
  { id: 'reminder', labelKey: 'tasks.typeReminder', icon: Bell },
  { id: 'follow_up', labelKey: 'tasks.typeFollowUp', icon: ArrowsClockwise },
];

export const getTaskTypeConfig = (id?: string | null): TaskTypeConfig => {
  return TASK_TYPES.find((t) => t.id === id) ?? TASK_TYPES[0];
};
