import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function Notifications() {
  const { user } = useAuth();
  const { userProfile, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (userProfile) {
      fetchNotifications();
    }
  }, [userProfile]);

  const fetchNotifications = async () => {
    if (!userProfile) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userProfile.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    setUnreadCount((data || []).filter(n => !n.read_at).length);
  };

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    fetchNotifications();
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.entity_type && notification.entity_id) {
      if (notification.entity_type === 'contact') {
        navigate(`/contacts/${notification.entity_id}`);
      } else if (notification.entity_type === 'opportunity') {
        navigate(`/opportunities/${notification.entity_id}`);
      } else if (notification.entity_type === 'task') {
        navigate('/tasks');
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2 border-b">
          <p className="font-semibold text-sm">{t('notifications.title')}</p>
        </div>
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('notifications.empty')}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`p-3 cursor-pointer ${!notification.read_at ? 'bg-muted/50' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{notification.title}</p>
                    {!notification.read_at && (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                  {notification.body && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
