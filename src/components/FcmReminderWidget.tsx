import React from 'react';

interface FcmReminderWidgetProps {
  userId?: string;
  userName?: string;
  department?: string;
  appConfig?: any;
  compact?: boolean;
  onTriggerCheckIn?: (type?: 'in' | 'out') => void;
}

export const FcmReminderWidget: React.FC<FcmReminderWidgetProps> = () => {
  // Tính năng thông báo FCM Widget đã được tắt theo yêu cầu người dùng
  return null;
};
